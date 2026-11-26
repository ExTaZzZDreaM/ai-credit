"""Adapter for the Russian short-form GKB report's 13-column grid.

Read money from individual table cells, never a whitespace-flattened row.
Missing frequency permits an explicitly marked, user-confirmable assumption.
An explicit non-monthly schedule is never silently converted to monthly.
"""
import io
import re
from datetime import datetime
from decimal import Decimal

import pdfplumber

from credit_report import ReportError, TZ, amount, compact, iso_date, loan_issues, number, summarize


def cell(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def cell_amount(value):
    value = cell(value)
    if compact(value) in {"", "-", "нетданных", "неуказано"}:
        return None
    try:
        return number(amount(value))
    except ValueError:
        return None


def read_gkb_pdf(data):
    texts, rows, totals = [], [], {}
    with pdfplumber.open(io.BytesIO(data)) as document:
        for page_number, page in enumerate(document.pages, 1):
            text = page.extract_text() or ""
            if len(text) > 150000:
                raise ReportError("Слишком сложная страница отчёта ГКБ.")
            texts.append(text)
            for table in page.extract_tables():
                if table and len(table[0]) == 13 and compact(cell(table[0][1])) == "кредитор:":
                    for row in table[1:]:
                        if len(row) == 13 and any(cell(c) for c in row[1:]):
                            rows.append((page_number, row))
                for row in table:
                    if len(row) == 4:
                        match = re.fullmatch(r"итого\(([a-z]{3})\):?", compact(cell(row[0])))
                        if match:
                            totals[match[1].upper()] = cell_amount(row[1])
    return texts, rows, totals


def parse_gkb_rows(texts, rows, totals, filename):
    first = texts[0] if texts else ""
    issue = re.search(r"ДАТА\s+И\s+ВРЕМЯ\s+ВЫДАЧИ\s*:\s*(\d{2}\.\d{2}\.\d{4})", first, re.I)
    active = re.search(r"(?<!\d)(\d{1,3})\s+ДЕЙСТВУЮЩИЕ", first, re.I)
    closed = re.search(r"(?<!\d)(\d{1,3})\s+ЗАВЕРШ[ЕЁ]ННЫЕ", first, re.I)
    if not active:
        active = re.search(r"Всего\s*[-–—]\s*(\d{1,3})", first, re.I)
    declared = int(active[1]) if active else None
    declared_closed = int(closed[1]) if closed else None
    if not any("краткаяформа" in compact(t) or "действующихнамоментполученияотчета" in compact(t) for t in texts):
        raise ReportError("Этот макет ГКБ пока не поддерживается. Загрузите персональный отчёт ГКБ в краткой форме с таблицей обязательств.")
    loans, warnings, seen = [], [], set()
    for page_number, values in rows:
        creditor, contract_ref, currency, raw_role, raw_date, upcoming, frequency, balance, overdue, penalty, days = map(cell, values[1:12])
        if not creditor or not contract_ref:
            warnings.append({"level": "warning", "code": "incomplete_contract_row", "text": f"На странице {page_number} есть неполная строка договора. Проверьте полноту списка."})
            continue
        key = (compact(creditor), contract_ref, currency)
        if key in seen:
            warnings.append({"level": "warning", "code": "duplicate_contract_row", "text": f"На странице {page_number} повторяется договор. Повторная строка исключена; сверьте источник."})
            continue
        seen.add(key)
        currency = currency.upper() if currency.upper() in {"KZT", "USD", "EUR", "RUB"} else "UNK"
        role_value = compact(raw_role)
        role = "borrower" if role_value == "заемщик" else "co_borrower" if role_value == "созаемщик" else "guarantor" if role_value in {"гарант", "поручитель"} else "unknown"
        next_payment = cell_amount(upcoming)
        monthly = bool(re.fullmatch(r"ежемесячныеплатежи(?:[-–—]30дней)?|ежемесячно", compact(frequency)))
        unspecified = compact(frequency) in {'', '-', 'нетданных', 'неуказано'}
        assumed = unspecified and next_payment is not None
        payment = next_payment if monthly or assumed else None
        payment_basis = 'assumed_monthly' if assumed else 'reported_monthly' if monthly else None
        balance, overdue = cell_amount(balance), cell_amount(overdue)
        days = int(days) if re.fullmatch(r"\d{1,5}", days) else None
        as_of = iso_date(raw_date)
        sources = {}
        payment_label = 'Сумма предстоящего платежа; месячная периодичность предположена' if assumed else 'Сумма предстоящего платежа; ежемесячная периодичность'
        for field, label, value in [("balance", "Общая задолженность", balance), ("payment", payment_label, payment), ("next_payment", "Сумма предстоящего платежа", next_payment), ("overdue_amount", "Просроченная задолженность", overdue)]:
            if value is not None:
                sources[field] = {"page": page_number, "label": label, "value": value}
        loans.append({"id": f"gkb-{page_number}-{len(loans) + 1}", "title": "Обязательство", "creditor": creditor[:120], "status": "active", "role": role, "currency": currency, "balance": balance, "payment": payment, "payment_basis": payment_basis, "next_payment": next_payment, "payment_frequency": frequency or None, "overdue_amount": overdue, "overdue_days": days, "as_of": as_of, "page": page_number, "sources": sources, "issues": [], "edited": False})
        loans[-1]["issues"] = loan_issues(loans[-1])
    if not loans and declared != 0:
        raise ReportError("Таблица обязательств ГКБ не распознана. Поддерживается текстовая краткая форма с 13 колонками.")
    if declared is not None and declared != len(loans):
        warnings.append({"level": "warning", "code": "contract_count_mismatch", "text": f"В сводке ГКБ действующих договоров: {declared}. Распознано: {len(loans)}. Проверьте полноту списка."})
    summary = summarize(loans)
    for currency, expected in totals.items():
        values = [amount(l["balance"]) for l in loans if l["currency"] == currency and l["balance"] is not None]
        if expected is not None and sum(values, Decimal(0)) != amount(expected):
            warnings.append({"level": "warning", "code": "balance_total_mismatch", "text": f"Сумма распознанных остатков в {currency} не совпадает со строкой «Итого» ГКБ. Проверьте суммы и полноту списка."})
    closed_note = f"В сводке завершённых договоров: {declared_closed}. " if declared_closed is not None else ""
    warnings.append({"level": "warning", "code": "gkb_short_form", "text": closed_note + "Краткая форма ГКБ содержит подробные строки только действующих обязательств. История завершённых договоров и исторических просрочек здесь не представлена."})
    warnings.append({"level": "info", "text": "Подлинность файла и электронной подписи не проверяется. Расчёты основаны на датах и распознанных полях отчёта."})
    report = {"bureau": "ГКБ", "format": "gkb_short", "filename": filename[:180], "pages": len(texts), "report_date": iso_date(issue[1]) if issue else None, "declared_active": declared, "declared_closed": declared_closed, "closed_details_available": False, "parsed_on": datetime.now(TZ).date().isoformat(), "demo": False}
    return {"report": report, "loans": loans, "warnings": warnings, "summary": summary}


def parse_gkb_pdf(data, filename):
    texts, rows, totals = read_gkb_pdf(data)
    return parse_gkb_rows(texts, rows, totals, filename)
