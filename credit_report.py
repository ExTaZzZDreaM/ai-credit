"""Conservative local PDF extraction and descriptive credit arithmetic.

Amounts are extracted from explicit labels, never from original loan amounts
or card limits. A parsed PDF is not authenticated by this application.
"""
from __future__ import annotations

import io
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from bisect import bisect_right

import pypdfium2 as pdfium
from pdf_input import pdf_payload

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 80
TZ = timezone(timedelta(hours=5))
ROLES = {"borrower", "co_borrower", "guarantor", "unknown"}
STATUSES = {"active", "closed", "revoked", "unknown"}
CURRENCIES = {"KZT", "USD", "EUR", "RUB", "UNK"}


class ReportError(ValueError):
    pass


def compact(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).casefold().replace("ё", "е")


def amount(value) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("Сумма должна быть числом.")
    s = re.sub(r"[\s\u00a0\u202f]", "", str(value)).replace(",", ".")
    try:
        n = Decimal(s)
    except InvalidOperation as exc:
        raise ValueError("Не удалось прочитать сумму.") from exc
    if not n.is_finite() or n < 0 or n > Decimal("1000000000000"):
        raise ValueError("Введите неотрицательную сумму до 1 трлн.")
    return n.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def number(n: Decimal | None):
    return None if n is None else float(n)


def iso_date(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%d.%m.%Y").date().isoformat()
    except ValueError:
        return None


def money_text(value) -> str:
    text = f"{amount(value):,.2f}".replace(",", " ")
    return text[:-3] if text.endswith(".00") else text.replace(".", ",")


def loan_issues(loan: dict) -> list[str]:
    """Issues derived from a loan's current fields.

    Shared by the parsers and by recalculation, so a saved edit keeps every
    warning that still applies and drops only the ones the edit resolved.
    GKB records are recognised by their `next_payment` field.
    """
    issues = []
    gkb = "next_payment" in loan
    active = loan.get("status") == "active"
    currency = loan.get("currency")
    if loan.get("status") == "unknown":
        issues.append("Не определён статус договора.")
    if loan.get("role") == "unknown":
        issues.append("Уточните свою роль в договоре.")
    if currency == "UNK":
        issues.append("Не определена валюта договора.")
    limit_currency = loan.get("credit_limit_currency")
    if limit_currency and currency != limit_currency:
        issues.append("Валюта кредитного лимита отличается от валюты задолженности. Проверьте источник.")
    if loan.get("balance") is None:
        issues.append("Не найдена текущая задолженность.")
    if loan.get("payment") is None and active:
        if gkb and loan.get("next_payment") is not None:
            issues.append(f"Предстоящий платёж: {money_text(loan['next_payment'])} {currency}. Месячный платёж не определён по периодичности. Уточните сумму в поле регулярного платежа.")
        elif not gkb:
            issues.append("Не найден регулярный платёж.")
    if gkb and loan.get("next_payment") is None:
        issues.append("Не найдена сумма предстоящего платежа.")
    if loan.get("payment_basis") == "assumed_monthly" and loan.get("payment") is not None and active:
        issues.append("Периодичность в ГКБ не указана. Предстоящий платёж включён в месячный расчёт как предположение; подтвердите его ниже." if gkb else "Месячная периодичность не подтверждена подписью поля ПКБ. Платёж включён как предполагаемый месячный; проверьте периодичность.")
    as_of = loan.get("as_of")
    if as_of and as_of > datetime.now(TZ).date().isoformat():
        issues.append("Дата сведений находится в будущем.")
    return issues


MONEY = r"([0-9]+(?:[.,][0-9]{1,2})?)(kzt|тенге|₸|usd|eur|rub|руб\.?|долл\.?)"


def find_money(block: str, labels: list[str]):
    for label in labels:
        match = re.search(re.escape(compact(label)) + r"[:：]?" + MONEY, block)
        if match:
            currency = {"тенге": "KZT", "₸": "KZT", "руб": "RUB", "руб.": "RUB", "долл.": "USD"}.get(match[2], match[2].upper())
            return number(amount(match[1])), currency, label, match.start()
    return None, None, None, None


def extract_report(data: bytes, filename: str = "report.pdf") -> dict:
    if not data or len(data) > MAX_BYTES:
        raise ReportError("Размер PDF должен быть от 1 байта до 20 МБ.")
    try:
        data, signed_container = pdf_payload(data)
    except ValueError as exc:
        raise ReportError(str(exc)) from exc
    try:
        texts = []
        try:
            document = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as exc:
            if "password" in str(exc).lower():
                raise ReportError("Этот PDF защищён паролем. Загрузите копию без пароля.") from exc
            raise
        with document:
            if not 0 < len(document) <= MAX_PAGES:
                raise ReportError("Поддерживаются отчёты до 80 страниц.")
            for page in document:
                try:
                    textpage = page.get_textpage()
                    try:
                        if textpage.count_chars() > 150000:
                            raise ReportError("Слишком сложная страница PDF. Попробуйте исходный отчёт из бюро.")
                        texts.append(textpage.get_text_range())
                    finally:
                        textpage.close()
                finally:
                    page.close()
                if sum(map(len, texts)) > 600000:
                    raise ReportError("В отчёте слишком много текста для этой версии.")
    except ReportError:
        raise
    except Exception as exc:
        raise ReportError("Не удалось прочитать PDF. Проверьте файл и попробуйте исходный отчёт.") from exc
    if sum(len(t.strip()) for t in texts) < 100:
        raise ReportError("В PDF не найден текст. Сканированные отчёты пока не поддерживаются — скачайте текстовый PDF из бюро.")
    result = parse_pages(texts, filename, pdf_data=data)
    result['report']['input_container'] = 'cms_signed_data' if signed_container else 'pdf'
    return result


def contract_blocks(texts):
    """Follow explicit contract boundaries across pages, never application rows.

    A lender can place the phase, balance and role on different PDF pages.
    Keep page offsets for field provenance while retaining one contract record.
    """
    raw = "\n".join(texts)
    page_starts, offset = [], 0
    for text in texts:
        page_starts.append(offset)
        offset += len(text) + 1
    markers = list(re.finditer(r"(?im)^[ \t]*контракт\s*(?:№|#)?\s*\d{1,4}(?!\d)", raw))
    sections = list(re.finditer(r"действующие\s+договор[аы]|заверш[её]нные\s+договор[аы]|отозванные\s+договор[аы]|договоры\s+завершенные|задолженность\s+перед\s+нефинансовыми|раздел\s*2[.\s]", raw, re.I))
    per_page = {}
    for i, marker in enumerate(markers):
        start = marker.start()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(raw)
        previous = [s for s in sections if s.start() < start]
        section = compact(previous[-1].group()) if previous else ""
        following = [s.start() for s in sections if start < s.start() < end]
        if following:
            end = min(following)
        page_index = bisect_right(page_starts, start) - 1
        per_page[page_index] = per_page.get(page_index, 0) + 1
        # Positions correspond to compact(raw[start:end]), before history is cut.
        breaks = [(0, page_index + 1)]
        for n, boundary in enumerate(page_starts):
            if start < boundary < end:
                breaks.append((len(compact(raw[start:boundary])), n + 1))
        yield page_index, per_page[page_index] - 1, section, raw[start:end], breaks


def bureau_signals(raw: str) -> tuple[bool, bool]:
    """Bureau names in raw text. Abbreviations must be whole words: compacting
    text glues words, e.g. «долг к банку» contains «гкб»."""
    text = compact(raw)
    pkb = "1cb" in text or "первоекредитноебюро" in text or bool(re.search(r"(?<![а-яё])пкб(?![а-яё])", raw, re.I))
    gkb = "государственноекредитноебюро" in text or bool(re.search(r"(?<![а-яё])гкб(?![а-яё])", raw, re.I))
    return pkb, gkb


def detect_bureau(texts: list[str]) -> str:
    # The issuing bureau is named in the header; the body or legal notes can
    # mention the other bureau.
    pkb, gkb = bureau_signals(texts[0][:4000])
    if pkb != gkb:
        return "ПКБ" if pkb else "ГКБ"
    whole = compact("\n".join(texts))
    gkb_layout = "краткаяформа" in whole or "действующихнамоментполученияотчета" in whole
    pkb_layout = bool(re.search(r"(?im)^[ \t]*контракт\s*(?:№|#)?\s*\d{1,4}(?!\d)", "\n".join(texts)))
    if gkb_layout != pkb_layout:
        return "ГКБ" if gkb_layout else "ПКБ"
    pkb, gkb = bureau_signals("\n".join(texts))
    if pkb != gkb:
        return "ПКБ" if pkb else "ГКБ"
    return "Бюро не определено"


def parse_pages(texts: list[str], filename="report.pdf", pdf_data=None) -> dict:
    pages = [compact(t) for t in texts]
    whole = "\n".join(pages)
    if "кредит" not in whole or not any(x in whole for x in ["1cb", "кредитноебюро", "пкб", "гкб", "кредитныйотчет"]):
        raise ReportError("Не удалось определить кредитный отчёт. Загрузите текстовый PDF ПКБ или ГКБ.")
    bureau = detect_bureau(texts)
    if bureau == "ГКБ":
        if pdf_data is None:
            raise ReportError("Для разбора таблицы ГКБ нужен исходный PDF с расположением колонок.")
        from gkb_report import parse_gkb_pdf
        return parse_gkb_pdf(pdf_data, filename)
    first = pages[0][:7000]
    months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    month_date = r"(?<!\d)(\d{1,2})\s+(" + "|".join(months) + r")\s+(20\d{2})"

    def from_month_name(found):
        try:
            return date(int(found[3]), months.index(found[2]) + 1, int(found[1])).isoformat()
        except ValueError:
            return None

    # Explicitly labelled dates first: an unlabelled date on the first page can
    # belong to a contract or a person and would shift the inquiry windows.
    found = re.search(r"(?:датаформирования|датаотчета|датавыдачи)[:：]?(\d{2}\.\d{2}\.\d{4})", first)
    report_date = iso_date(found[1]) if found else None
    if not report_date:
        found = re.search(r"дата\s+(?:формирования|отч[её]та|выдачи)(?:\s+отч[её]та)?\s*[:：]?\s*" + month_date, texts[0].lower())
        report_date = from_month_name(found) if found else None
    if not report_date:
        found = re.search(r"\bID\s*\d{6,12}\s*[-–]?\s*(\d{2}\.\d{2}\.\d{4})(?:\s+\d{2}:\d{2}:\d{2})?", texts[0])
        report_date = iso_date(found[1]) if found else None
    if not report_date:
        # PKB headers can carry the issue date as unlabelled text.
        found = re.search(month_date, texts[0].lower())
        report_date = from_month_name(found) if found else None

    loans, warnings = [], []
    balance_labels = ["Использованная сумма (подлежащая погашению)", "Непогашенная сумма по кредиту", "Остаток основного долга", "Остаток задолженности", "Сумма задолженности"]
    payment_labels = ["Сумма периодического платежа", "Минимальный платеж", "Сумма ежемесячного платежа", "Ежемесячный платеж", "Размер ежемесячного платежа", "Периодический платеж"]
    overdue_labels = ["Сумма просроченных взносов", "Просроченная задолженность"]
    from pkb_enrichment import contract_fields, inquiry_fields
    for page_index, index, section, raw_block, page_breaks in contract_blocks(texts):
        if section.startswith(("задолженностьпереднефинансовыми", "раздел2")):
            continue
        extra_fields, extra_sources = contract_fields(raw_block, page_breaks)
        raw_stop = re.search(r"максимальное\s+количество\s+дней|максимальная\s+сумма\s+просроченных|платежная\s+дисциплина|блок\s+по\s+урегулированию", raw_block, re.I)
        if raw_stop:
            raw_block = raw_block[:raw_stop.start()]
        block = compact(raw_block)
        # The history grid has other dates and balances: stop before it.
        for stop in ["максимальноеколичестводнейпросрочки", "максимальнаясуммапросроченных", "платежнаядисциплина", "блокпоурегулированию"]:
            pos = block.find(stop)
            if pos >= 0:
                block = block[:pos]
        if not any(compact(label) in block for label in balance_labels + payment_labels):
            continue
        status = "closed" if "завершенн" in section else "revoked" if "отозванн" in section else "active" if "действующ" in section else "unknown"
        status_match = re.search(r"статусдоговора[:：]?(.{0,100})", block)
        status_value = status_match[1] if status_match else ""
        phase_match = re.search(r"фазадоговора[:：]?(.{0,35})", block)
        phase = phase_match[1] if phase_match else ""
        if phase.startswith(("погашен", "завершен", "закрыт")):
            status = "closed"
        elif phase.startswith("отозван"):
            status = "revoked"
        elif phase.startswith("действующ"):
            status = "active"
        elif status_value.startswith(("завершен", "закрыт", "погашенполностью")):
            status = "closed"
        elif status == "unknown" and status_value.startswith(("действующ", "непогашен")):
            status = "active"
        role_match = re.search(r"рольсубъекта[:：]?(.{0,45})", block)
        role_value = role_match[1] if role_match else ""
        role = "co_borrower" if role_value.startswith("созаемщик") else "borrower" if role_value.startswith("заемщик") else "guarantor" if role_value.startswith(("гарант", "поручитель")) else "unknown"
        creditor_match = re.search(r"(?:источникинформации\(кредитор\)|кредитор)[:：]?(.{1,200})", block)
        creditor = "Кредитор не распознан"
        if creditor_match:
            raw = creditor_match[1]
            stops = [raw.find(x) for x in ["бинисточника", "типисточника", "общаясумма", "сумма", "баланс", "информацияпосостоянию", "использованная", "непогашенная", "рольсубъекта", "видфинансирования", "датаначала", "номердоговора", "договорсостояние"] if raw.find(x) >= 0]
            creditor = raw[:min(stops)] if stops else raw[:65]
            creditor = creditor.strip(":;.,") or "Кредитор не распознан"
            # Find the original spacing for the extracted lender name.
            normalized_raw = re.sub(r"\s+", " ", raw_block)
            original = re.search(r"(?:Источник\s+информации\s*\(\s*Кредитор\s*\)|Кредитор)\s*[:：]?\s*(.{1,160})", normalized_raw, re.I)
            if original:
                candidate = re.split(r"\s+(?:БИН\s+источника|Тип\s+источника|Общая\s+сумма|Сумма|Баланс|Информация\s+по\s+состоянию|Использованная|Непогашенная|Роль\s+субъекта|Вид\s+финансирования|Дата\s+начала|Номер\s+договора)\b", original[1], maxsplit=1, flags=re.I)[0].strip(":;., ")
                if candidate and compact(candidate) == compact(creditor):
                    creditor = candidate
            if creditor == creditor.lower():
                creditor = creditor[:1].upper() + creditor[1:]
        kind = "Кредитная карта" if "видфинансирования:кредитнаякарта" in block else "Ипотека" if "видфинансирования:ипотечн" in block else "Рассрочка" if "рассрочк" in block else "Займ"
        balance, bc, bl, bp = find_money(block, balance_labels)
        payment, pc, pl, pp = find_money(block, payment_labels)
        overdue, oc, ol, op = find_money(block, overdue_labels)
        # Sum principal components only when both are explicitly present.
        if balance is None:
            current, cc, cl, cp = find_money(block, ["Непросроченный основной долг"])
            late, lc, ll, lp = find_money(block, ["Просроченный основной долг"])
            if current is not None and late is not None and cc == lc:
                balance, bc, bl, bp = number(amount(current) + amount(late)), cc, "Непросроченный + просроченный основной долг", cp
        currency = bc or pc or oc or extra_fields['credit_limit_currency'] or "UNK"
        issues = []
        if pc and bc and pc != bc:
            payment = None
            issues.append("Валюты платежа и задолженности различаются. Проверьте платёж.")
        if oc and bc and oc != bc:
            overdue = None
            issues.append("Проверьте валюту просроченной суммы.")
        payment_basis = None if payment is None else "reported_monthly" if pl and "ежемесячн" in pl.lower() else "assumed_monthly"
        days_match = re.search(r"Количество\s+дней\s+просрочки\s*[:：]?\s*(\d{1,5})(?=\s|$)", raw_block, re.I)
        days = int(days_match[1]) if days_match else None
        d = re.search(r"информацияпосостояниюна[:：]?(\d{1,2}\.\d{2}\.\d{4})", block)
        as_of = iso_date(d[1]) if d else None
        sources = {}
        for field, label, value, pos in [("balance", bl, balance, bp), ("payment", pl, payment, pp), ("overdue_amount", ol, overdue, op)]:
            if label and value is not None:
                source_page = next((n for offset, n in reversed(page_breaks) if offset <= (pos or 0)), page_index + 1)
                sources[field] = {"page": source_page, "label": label, "value": value}
        sources.update(extra_sources)
        loans.append({"id": f"loan-{page_index + 1}-{index + 1}", "title": kind, "creditor": creditor[:120], "status": status, "role": role, "currency": currency, "balance": balance, "payment": payment, "payment_basis": payment_basis, "overdue_amount": overdue, "overdue_days": days, "as_of": as_of, "page": page_index + 1, **extra_fields, "sources": sources, "issues": issues, "edited": False})
        issues.extend(loan_issues(loans[-1]))
    if not loans:
        no_active = any(phrase in whole for phrase in ["субъектнеимеетдействующихдоговоров", "действующиедоговорыотсутствуют", "действующихдоговоров:0", "количестводействующихдоговоров:0"])
        if not no_active:
            raise ReportError("Договоры не распознаны. Эта версия читает подробные блоки «Контракт» с подписями полей. Попробуйте полный отчёт ПКБ; по одному сводному изображению суммы не рассчитываются.")
        warnings.append({"level": "info", "text": "В тексте указано отсутствие действующих договоров. Проверьте это по исходному отчёту."})
    # Summary counts are read with text boundaries: compacting numbers could
    # concatenate a nearby score or document number with a contract count.
    declared = None
    a = re.search(r"(?<!\d)(\d{1,3})\s+Действующие\s+договоры\s+без\s+просрочки", texts[0], re.I)
    b = re.search(r"(?<!\d)(\d{1,3})\s+Действующие\s+договоры\s+с\s+просрочкой", texts[0], re.I)
    if a and b:
        declared = int(a[1]) + int(b[1])
    if declared is None:
        for raw_page in texts:
            row = re.search(r"Действующие\s+договор[аы]\s+За[её]мщик\s+(\d{1,3})\s*\([A-Z]{3}\)", raw_page, re.I)
            if row:
                declared = int(row[1])
                break
    if declared is not None and declared != sum(l["status"] == "active" for l in loans):
        warnings.append({"level": "warning", "code": "contract_count_mismatch", "text": f"В сводке отчёта указано действующих договоров: {declared}. Распознано: {sum(l['status'] == 'active' for l in loans)}. Проверьте полноту списка; итоги могут быть неполными."})
    if not report_date:
        warnings.append({"level": "info", "text": "Дата формирования отчёта не определена."})
    warnings.append({"level": "info", "text": "Файл не проверяется на подлинность. Разбор отражает только распознанные сведения; источник актуальных данных — бюро и кредиторы."})
    report = {"bureau": bureau, "filename": filename[:180], "pages": len(texts), "report_date": report_date, "declared_active": declared, "parsed_on": datetime.now(TZ).date().isoformat(), "demo": "демонстрац" in first and "искусственныеданные" in first}
    inquiry_data, inquiry_sources, inquiry_warnings = inquiry_fields(texts, report_date)
    report.update(inquiry_data)
    report['sources'] = inquiry_sources
    warnings.extend(inquiry_warnings)
    return {"report": report, "loans": loans, "warnings": warnings, "summary": summarize(loans)}


def validate_loans(loans) -> list[dict]:
    if not isinstance(loans, list) or len(loans) > 150:
        raise ValueError("Допускается до 150 обязательств.")
    clean, ids = [], set()
    for i, item in enumerate(loans):
        if not isinstance(item, dict):
            raise ValueError("Некорректная строка обязательства.")
        status, role, currency = item.get("status"), item.get("role"), item.get("currency")
        if status not in STATUSES or role not in ROLES or currency not in CURRENCIES:
            raise ValueError("Проверьте статус, роль и валюту договора.")
        ident = str(item.get("id", f"manual-{i}"))[:70]
        if ident in ids:
            raise ValueError("Идентификаторы обязательств должны различаться.")
        ids.add(ident)
        values = {field: number(amount(item.get(field))) for field in ["balance", "payment", "overdue_amount"]}
        days = item.get("overdue_days")
        if days in [None, ""]:
            days = None
        else:
            if isinstance(days, bool) or not re.fullmatch(r"\d{1,5}", str(days)):
                raise ValueError("Количество дней просрочки должно быть целым неотрицательным числом.")
            days = int(days)
        as_of = item.get("as_of") or None
        if as_of:
            try:
                date.fromisoformat(str(as_of))
            except ValueError as exc:
                raise ValueError("Проверьте дату сведений.") from exc
        sources = item.get("sources", {})
        if not isinstance(sources, dict):
            sources = {}
        source_fields = {*values, 'next_payment', 'credit_limit', 'start_date', 'end_date', 'max_overdue_days_history'}
        sources = {k: {"page": v.get("page"), "label": str(v.get("label", ""))[:150], "value": v.get("value"), **({'currency': v['currency']} if v.get('currency') in CURRENCIES else {})} for k, v in sources.items() if k in source_fields and isinstance(v, dict)}
        clean.append({"id": ident, "creditor": str(item.get("creditor", ""))[:120].strip() or "Кредитор не указан", "title": str(item.get("title", "Займ"))[:80], "status": status, "role": role, "currency": currency, **values, "overdue_days": days, "as_of": as_of, "page": item.get("page") if isinstance(item.get("page"), int) else None, "sources": sources, "issues": [], "edited": bool(item.get("edited", True))})
        if "next_payment" in item:
            clean[-1]['next_payment'] = number(amount(item.get('next_payment')))
            clean[-1]['payment_frequency'] = str(item.get('payment_frequency') or '')[:100] or None
        if 'payment_basis' in item:
            basis = item.get('payment_basis')
            if basis not in {None, 'reported_monthly', 'assumed_monthly', 'user_confirmed_monthly', 'user_entered_monthly'}:
                raise ValueError('Проверьте основание месячного платежа.')
            clean[-1]['payment_basis'] = basis if values['payment'] is not None else None
        if 'credit_limit' in item:
            clean[-1]['credit_limit'] = number(amount(item.get('credit_limit')))
            limit_currency = item.get('credit_limit_currency') or None
            if limit_currency is not None and limit_currency not in CURRENCIES:
                raise ValueError('Проверьте валюту кредитного лимита.')
            clean[-1]['credit_limit_currency'] = limit_currency
        for field in ['start_date', 'end_date']:
            if field not in item:
                continue
            value = item[field]
            if value in [None, '']:
                value = None
            if value is not None:
                try:
                    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                        raise ValueError()
                    date.fromisoformat(value)
                except ValueError as exc:
                    raise ValueError('Проверьте дату начала или окончания договора.') from exc
            clean[-1][field] = value
        if 'max_overdue_days_history' in item:
            value = item['max_overdue_days_history']
            if value in [None, '']:
                value = None
            elif isinstance(value, bool) or not re.fullmatch(r'\d{1,5}', str(value)):
                raise ValueError('Историческая просрочка должна быть целым неотрицательным числом дней.')
            else:
                value = int(value)
            scope = item.get('history_scope') or None
            if scope not in {None, 'since_contract_start', 'reported_maximum'}:
                raise ValueError('Некорректный период исторической просрочки.')
            clean[-1].update(max_overdue_days_history=value, history_scope=scope)
        clean[-1]['issues'] = loan_issues(clean[-1])
    return clean


def summarize(loans: list[dict]) -> dict:
    eligible = [l for l in loans if l["status"] == "active" and l["role"] in {"borrower", "co_borrower"}]
    groups = {}
    for currency in sorted({l["currency"] for l in eligible}):
        subset = [l for l in eligible if l["currency"] == currency]
        group = {"count": len(subset)}
        fields = ["balance", "payment", "overdue_amount"]
        if any("next_payment" in l for l in subset):
            fields.append("next_payment")
        for field in fields:
            known = [amount(l[field]) for l in subset if l.get(field) is not None]
            group[field] = number(sum(known, Decimal(0))) if known and currency != "UNK" else None
            group[field + "_known"] = len(known)
            group[field + "_complete"] = len(known) == len(subset) and currency != "UNK"
            if field == 'payment':
                group['payment_assumed_count'] = sum(l.get('payment_basis') == 'assumed_monthly' and l.get('payment') is not None for l in subset)
                group['payment_complete'] = group['payment_complete'] and group['payment_assumed_count'] == 0
        groups[currency] = group
    return {"total_records": len(loans), "active_count": len(eligible), "closed_count": sum(l["status"] == "closed" for l in loans), "guarantor_count": sum(l["role"] == "guarantor" for l in loans), "unclassified_count": sum(l["status"] == "unknown" or l["role"] == "unknown" for l in loans), "overdue_count": sum((l.get("overdue_amount") or 0) > 0 or (l.get("overdue_days") or 0) > 0 for l in eligible), "overdue_unknown": sum(l.get("overdue_amount") is None and l.get("overdue_days") is None for l in eligible), "currencies": groups}


def demo_pdf() -> bytes:
    """Generate a reproducible synthetic, clearly labelled report through the
    same upload/parser path. reportlab is a demo-only dependency.
    """
    from pathlib import Path
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    font = next((p for p in [Path("C:/Windows/Fonts/arial.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")] if p.exists()), None)
    if font is None:
        raise ReportError("Для создания примера нужен системный шрифт с кириллицей.")
    if "PilotDemo" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("PilotDemo", str(font)))
    stream = io.BytesIO()
    c = canvas.Canvas(stream, pagesize=(595, 842))
    today = datetime.now(TZ).date()
    date_string = today.strftime("%d.%m.%Y")
    data = [
        ("Действующие договоры", "Пример Банк А", "Займ", "Заемщик", "1250000", "65000", "0", "0"),
        ("Действующие договоры", "Пример Банк Б", "Кредитная карта", "Заемщик", "320000", "24000", "12000", "7"),
        ("Действующие договоры", "Пример Банк В", "Рассрочка", "Заемщик", "180000", None, None, None),
        ("Завершенные договоры", "Пример Банк А", "Займ", "Заемщик", "0", "18000", "0", "0"),
    ]
    for i, (section, lender, kind, role, balance, payment, overdue, days) in enumerate(data):
        if i % 2 == 0:
            if i:
                c.showPage()
            c.setFont("PilotDemo", 15)
            c.drawString(40, 800, "Персональный кредитный отчет — ДЕМОНСТРАЦИЯ")
            c.setFont("PilotDemo", 10)
            c.drawString(40, 780, "ПКБ · Искусственные данные · Не является отчетом бюро")
            c.drawString(40, 762, f"Дата формирования: {date_string}")
        y = 725 if i % 2 == 0 else 390
        lines = [section, f"Контракт {i+1}", f"Источник информации (Кредитор): {lender}", f"Вид финансирования: {kind}", f"Роль субъекта: {role}", f"Статус договора: {'Завершен' if section.startswith('Заверш') else 'Стандартные кредиты'}", f"Непогашенная сумма по кредиту: {balance} KZT", f"Сумма ежемесячного платежа: {payment + ' KZT' if payment is not None else 'Нет данных'}", f"Сумма просроченных взносов: {overdue + ' KZT' if overdue is not None else 'Нет данных'}", f"Количество дней просрочки: {days if days is not None else 'Нет данных'}", f"Информация по состоянию на: {date_string}"]
        c.setFont("PilotDemo", 11)
        for line in lines:
            c.drawString(40, y, line)
            y -= 22
    c.save()
    return stream.getvalue()
