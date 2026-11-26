"""Optional PKB fields with source pages; unknown values are never zero.

Inquiry windows use calendar dates relative to the report's issue date,
including that date. Counts describe rows of the supplied inquiry journal,
not applications, credit decisions, unique lenders or full bureau coverage.
"""
import re
from bisect import bisect_right
from datetime import date, timedelta

from credit_report import compact, find_money, iso_date


def contract_fields(raw, page_breaks):
    text = compact(raw)
    fields = {"credit_limit": None, "credit_limit_currency": None, "start_date": None, "end_date": None, "max_overdue_days_history": None, "history_scope": None}
    sources = {}

    def cite(field, label, value, pos, **extra):
        page = next((n for offset, n in reversed(page_breaks) if offset <= pos), page_breaks[0][1])
        sources[field] = {"page": page, "label": label, "value": value, **extra}

    limit, currency, label, pos = find_money(text, ["Сумма кредитного лимита"])
    if limit is not None:
        fields.update(credit_limit=limit, credit_limit_currency=currency)
        cite("credit_limit", label, limit, pos, currency=currency)
    for field, labels in [
        ("start_date", ["Дата начала срока действия договора", "Дата начала действия договора"]),
        ("end_date", ["Дата окончания срока действия договора", "Дата окончания действия договора"]),
    ]:
        for label in labels:
            match = re.search(re.escape(compact(label)) + r"[:：]?(\d{1,2}\.\d{2}\.\d{4})(?!\d)", text)
            value = iso_date(match[1]) if match else None
            if value:
                fields[field] = value
                cite(field, label, value, match.start())
                break
    match = re.search(r"Максимальное\s+количество\s+дней\s+просрочки(?:\s+с\s+начала\s+действия\s+договора)?\s*[:：]?\s*(\d{1,5})(?=\s|$)", raw, re.I)
    label = "Максимальное количество дней просрочки"
    if not match:
        # A table caption can continue on the following page after its value.
        # Require the adjacent historical-amount heading to identify the row.
        match = re.search(r"Максимальное\s+количество\s+дней\s*[:：]?\s*(\d{1,5})\s+Сумма\s+просроченных\s+взносов", raw, re.I)
        label = "Максимальное количество дней (блок истории просрочек)"
    if match:
        fields["max_overdue_days_history"] = int(match[1])
        fields["history_scope"] = "since_contract_start" if re.search(r"просрочки\s+с\s+начала\s+действия\s+договора", raw, re.I) else "reported_maximum"
        cite("max_overdue_days_history", label, int(match[1]), len(compact(raw[:match.start(1)])))
    return fields, sources


def inquiry_fields(texts, report_date):
    raw = "\n".join(texts)
    offsets, offset = [], 0
    for text in texts:
        offsets.append(offset)
        offset += len(text) + 1
    fields = {"inquiries_30d": None, "inquiries_90d": None, "inquiries_reference_date": report_date, "inquiries_scope": "provided_journal", "inquiry_events": None, "inquiries_by_kind": None}
    sources, warnings = {}, []
    heading = re.search(r"Информация\s+о\s+произведенных\s+запросах(?:\s+и\s+мониторинге)?\s+кредитной\s+истории|Сведения\s+о\s+запросах\s+кредитной\s+истории", raw, re.I)
    if not heading:
        return fields, sources, warnings
    start = heading.end()
    stop = re.search(r"(?im)^[ \t]*(?:Внимание!|Раздел\s+[3-9][.\s]|Плейсхолдер)", raw[start:])
    journal = raw[start:start + stop.start()] if stop else raw[start:]
    header = re.search(r"Дата\s+запроса", journal, re.I)
    body_start = header.end() if header else 0
    body = journal[body_start:]
    explicitly_empty = bool(re.search(r"(?:запросы|запросов)[^.\n]{0,35}(?:отсутствуют|не\s+найден[оы])|нет\s+(?:сведений\s+о\s+)?запросов", body, re.I))
    events, previous_end, invalid = [], 0, False
    for match in re.finditer(r"(?m)(?<![\d.])(\d{2}\.\d{2}\.\d{4})[ \t\r]*$", body):
        line_start = max(body.rfind('\n', 0, match.start()), body.rfind('\r', 0, match.start())) + 1
        line = body[line_start:match.end()]
        if re.search(r"дата\s+(?:выдачи|формирования)|\bID\b|страница", line, re.I):
            previous_end = match.end()
            continue
        row = compact(body[previous_end:match.start()])
        previous_end = match.end()
        if "персональныйкредитныйотчет" in row:
            kind = "personal_report"
        elif "кредитныйотчет" in row:
            kind = "credit_report"
        elif "мониторинг" in row:
            kind = "monitoring"
        else:
            # Dates in explanatory text are not evidence of a journal row.
            continue
        event_date = iso_date(match[1])
        if not event_date:
            invalid = True
            continue
        page = bisect_right(offsets, start + body_start + match.start(1))
        events.append({"date": event_date, "kind": kind, "page": page})
    if invalid:
        fields["inquiry_events"] = events
        warnings.append({"level": "warning", "text": "В журнале запросов есть нераспознанная дата. Количество запросов за 30 и 90 дней не рассчитано."})
        return fields, sources, warnings
    if not events and not explicitly_empty:
        return fields, sources, warnings
    fields["inquiry_events"] = events
    if not report_date:
        warnings.append({"level": "warning", "text": "Журнал запросов найден, но дата отчёта не определена. Количество запросов за 30 и 90 дней не рассчитано."})
        return fields, sources, warnings
    reference = date.fromisoformat(report_date)
    fields["inquiries_by_kind"] = {}
    for days in [30, 90]:
        window_start = (reference - timedelta(days=days - 1)).isoformat()
        selected = [event for event in events if window_start <= event["date"] <= report_date]
        key = f"inquiries_{days}d"
        fields[key] = len(selected)
        fields["inquiries_by_kind"][f"{days}d"] = {kind: sum(e["kind"] == kind for e in selected) for kind in ["credit_report", "personal_report", "monitoring"]}
        pages = sorted({e["page"] for e in selected}) or sorted({e["page"] for e in events}) or [bisect_right(offsets, heading.start())]
        sources[key] = {"pages": pages, "label": f"Записи журнала запросов за {days} календарных дней", "value": len(selected), "reference_date": report_date, "window_start": window_start, "window_end": report_date, "includes_report_day": True}
    if any(e["date"] > report_date for e in events):
        warnings.append({"level": "warning", "text": "В журнале есть запросы позднее даты выдачи отчёта. Такие записи не включены в расчёт за 30 и 90 дней."})
    return fields, sources, warnings
