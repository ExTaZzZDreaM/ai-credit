import io
import math
import unittest
from copy import deepcopy

from pypdf import PdfWriter
from credit_report import ReportError, amount, demo_pdf, extract_report, parse_pages, summarize, validate_loans


def page(*blocks):
    return "ПКБ · Персональный кредитный отчет\nДата формирования: 25.11.2026\n" + "\n".join(blocks)


def contract(n=1, status="Стандартные кредиты", section="Действующие договоры", role="Заемщик", currency="KZT", balance="100000", payment="10000", extra=""):
    return f"""{section}
Контракт {n}
Источник информации (Кредитор): Тест Банк {n}
Вид финансирования: Займ
Роль субъекта: {role}
Статус договора: {status}
Непогашенная сумма по кредиту: {balance} {currency}
Сумма периодического платежа: {payment + ' ' + currency if payment else 'Нет данных'}
Сумма просроченных взносов: 0 {currency}
Количество дней просрочки: 0
Информация по состоянию на: 24.11.2026
{extra}"""


class ArithmeticTests(unittest.TestCase):
    def test_demo_pdf_uses_real_extraction(self):
        result = extract_report(demo_pdf())
        self.assertTrue(result["report"]["demo"])
        self.assertEqual(len(result["loans"]), 4)
        self.assertEqual(result["summary"]["active_count"], 3)
        self.assertEqual(result["summary"]["closed_count"], 1)
        kzt = result["summary"]["currencies"]["KZT"]
        self.assertEqual(kzt["balance"], 1750000)
        self.assertEqual(kzt["payment"], 89000)
        self.assertFalse(kzt["payment_complete"])
        self.assertEqual(result["summary"]["overdue_count"], 1)
        self.assertEqual(result["loans"][1]["creditor"], "Пример Банк Б")

    def test_closed_and_guarantees_are_not_added(self):
        result = parse_pages([page(contract(), contract(2, section="Завершенные договоры", status="Завершен", balance="0"), contract(3, role="Поручитель"))])
        self.assertEqual(result["summary"]["currencies"]["KZT"]["payment"], 10000)
        self.assertEqual(result["summary"]["active_count"], 1)
        self.assertEqual(result["summary"]["guarantor_count"], 1)

    def test_missing_payment_is_not_zero(self):
        result = parse_pages([page(contract(payment=""))])
        group = result["summary"]["currencies"]["KZT"]
        self.assertIsNone(group["payment"])
        self.assertFalse(group["payment_complete"])
        self.assertEqual(group["payment_known"], 0)

    def test_zero_payment_is_known(self):
        result = parse_pages([page(contract(payment="0"))])
        group = result["summary"]["currencies"]["KZT"]
        self.assertEqual(group["payment"], 0)
        self.assertEqual(group["payment_known"], 1)
        self.assertFalse(group["payment_complete"])  # Period is still an assumption.

    def test_periodic_pkb_payment_does_not_confirm_monthly_frequency(self):
        result = parse_pages([page(contract())])
        loan = result['loans'][0]
        self.assertEqual(loan['payment'], 10000)
        self.assertEqual(loan['payment_basis'], 'assumed_monthly')
        self.assertFalse(result['summary']['currencies']['KZT']['payment_complete'])
        checked = validate_loans(result['loans'])
        self.assertEqual(checked[0]['payment_basis'], 'assumed_monthly')
        checked[0]['payment_basis'] = 'user_confirmed_monthly'
        self.assertTrue(summarize(validate_loans(checked))['currencies']['KZT']['payment_complete'])
        self.assertEqual(checked[0]['sources']['payment']['value'], 10000)

    def test_explicit_monthly_pkb_payment_is_not_an_assumption(self):
        text = contract().replace('Сумма периодического платежа:', 'Сумма ежемесячного платежа:')
        result = parse_pages([page(text)])
        self.assertEqual(result['loans'][0]['payment_basis'], 'reported_monthly')
        self.assertTrue(result['summary']['currencies']['KZT']['payment_complete'])

    def test_unknown_currency_amounts_are_not_added(self):
        loans = parse_pages([page(contract(), contract(2))])['loans']
        for loan in loans:
            loan['currency'] = 'UNK'
        group = summarize(loans)['currencies']['UNK']
        for field in ['balance', 'payment', 'overdue_amount']:
            self.assertIsNone(group[field])
            self.assertFalse(group[field + '_complete'])
        self.assertEqual(group['balance_known'], 2)

    def test_currency_separation(self):
        result = parse_pages([page(contract(), contract(2,currency="USD",balance="500",payment="30"))])
        self.assertEqual(result["summary"]["currencies"]["KZT"]["balance"],100000)
        self.assertEqual(result["summary"]["currencies"]["USD"]["balance"],500)

    def test_historical_arrears_are_not_current(self):
        text = contract(extra="Максимальное количество дней просрочки с начала действия договора: 120\nСумма просроченных взносов: 90000 KZT\nКоличество дней просрочки: 90")
        result = parse_pages([page(text)])
        self.assertEqual(result["summary"]["overdue_count"],0)
        self.assertEqual(result["loans"][0]["overdue_days"],0)

    def test_card_limit_is_not_balance(self):
        text=contract().replace("Непогашенная сумма по кредиту: 100000 KZT", "Сумма кредитного лимита: 1000000 KZT")
        result=parse_pages([page(text)])
        self.assertIsNone(result["loans"][0]["balance"])

    def test_number_does_not_eat_following_date(self):
        text=contract().replace("Количество дней просрочки: 0", "Количество дней просрочки: 15\n01.03.2021")
        result=parse_pages([page(text)])
        self.assertEqual(result["loans"][0]["overdue_days"],15)

    def test_unknown_role_excluded(self):
        result=parse_pages([page(contract(role="Не указана"))])
        self.assertEqual(result["summary"]["active_count"],0)
        self.assertEqual(result["summary"]["unclassified_count"],1)

    def test_money_precision(self):
        result=parse_pages([page(contract(balance="1 234 567,89",payment="1 000,55"),contract(2,balance="0,11",payment="0,45"))])
        self.assertEqual(result["summary"]["currencies"]["KZT"]["balance"],1234568)
        self.assertEqual(result["summary"]["currencies"]["KZT"]["payment"],1001)

    def test_report_date_not_glued_to_id(self):
        result=parse_pages(["ПКБ кредитный отчет ID XXX123-908 4 апреля 2024 года\n"+contract()])
        self.assertEqual(result["report"]["report_date"],"2024-04-04")

    def test_contract_continues_on_next_page_with_source_page(self):
        first=page("Действующие договора\nКонтракт 1\nВид финансирования: Займ\nРоль субъекта: Заёмщик\nОбщая сумма кредита/валюта: 150000 KZT")
        second="""ID субъекта XXXX
Дата выдачи: 25.11.2026
Источник информации (Кредитор): Тест Банк
БИН источника информации: 000000000000
Фаза договора: Действующий
Непогашенная сумма по кредиту: 120000 KZT
Сумма периодического платежа: 12500 KZT
Информация по состоянию на: 18.11.2026
Сумма просроченных взносов: 0 KZT
Количество дней просрочки: 0
Максимальное количество дней просрочки: 99
Сумма просроченных взносов: 99999 KZT"""
        result=parse_pages([first,second])
        self.assertEqual(len(result['loans']),1)
        loan=result['loans'][0]
        self.assertEqual(loan['creditor'],'Тест Банк')
        self.assertEqual(loan['role'],'borrower')
        self.assertEqual(loan['page'],1)
        self.assertEqual(loan['sources']['balance']['page'],2)
        self.assertEqual(loan['as_of'],'2026-11-18')
        self.assertEqual(result['summary']['currencies']['KZT']['payment'],12500)
        self.assertEqual(result['summary']['overdue_count'],0)

    def test_phase_and_section_carry_across_pages(self):
        first=page(contract(section='Завершенные договора').replace('Статус договора:', 'Фаза договора: Погашен\nСтатус договора:'))
        second=contract(n=2,section='').replace('Статус договора:', 'Фаза договора: Погашен\nСтатус договора:')
        result=parse_pages([first,second])
        self.assertEqual(result['summary']['closed_count'],2)
        self.assertEqual(result['summary']['active_count'],0)
        self.assertEqual(result['summary']['currencies'],{})

    def test_application_rows_are_not_contracts(self):
        application=page('Кредитная заявка № 1\nКредитор: Тест Банк\nСумма периодического платежа выданного займа: 999999 KZT')
        result=parse_pages([application,page(contract(payment='1500'))])
        self.assertEqual(len(result['loans']),1)
        self.assertEqual(result['summary']['currencies']['KZT']['payment'],1500)

    def test_native_summary_count_and_issue_date(self):
        first='ПКБ кредитный отчет\nДата выдачи: 25.11.2026 11:00:00\nОбщая информация\nДействующие\nдоговора\nЗаёмщик 2 (KZT) 0 200000 KZT'
        result=parse_pages([first,page(contract())])
        self.assertEqual(result['report']['report_date'],'2026-11-25')
        self.assertEqual(result['report']['declared_active'],2)
        self.assertTrue(any(w.get('code')=='contract_count_mismatch' for w in result['warnings']))

    def test_standard_credit_classification_does_not_mean_active(self):
        result=parse_pages([page(contract(section=''))])
        self.assertEqual(result['loans'][0]['status'],'unknown')
        self.assertEqual(result['summary']['active_count'],0)

    def test_empty_report_is_distinct_from_unrecognized(self):
        result=parse_pages([page("Субъект не имеет действующих договоров")])
        self.assertEqual(result["loans"],[])
        self.assertEqual(result["summary"]["active_count"],0)
        with self.assertRaises(ReportError):
            parse_pages([page("Здесь неизвестный макет без распознанных полей")])

    def test_user_corrections_recalculate_and_keep_provenance(self):
        result=parse_pages([page(contract(payment=""))])
        loans=deepcopy(result["loans"])
        loans[0]["payment"]="12 500,50"
        loans[0]["edited"]=True
        validated=validate_loans(loans)
        self.assertEqual(summarize(validated)["currencies"]["KZT"]["payment"],12500.5)
        self.assertTrue(validated[0]["edited"])
        self.assertIn("balance",validated[0]["sources"])

    def test_reject_non_finite_or_negative_amounts(self):
        for value in ["NaN","Infinity",-1,True,float('nan'),float('inf'),"1e999"]:
            with self.subTest(value=str(value)):
                with self.assertRaises(ValueError):amount(value)

    def test_reject_invalid_enum_and_duplicate_rows(self):
        loans=parse_pages([page(contract())])["loans"]
        loans[0]["status"]="approved"
        with self.assertRaises(ValueError):validate_loans(loans)
        loans[0]["status"]="active"
        with self.assertRaises(ValueError):validate_loans(loans+loans)

    def test_bad_pdf_and_encrypted_file(self):
        with self.assertRaises(ReportError):extract_report(b"not a pdf")
        writer=PdfWriter();writer.add_blank_page(width=595,height=842);writer.encrypt("secret")
        data=io.BytesIO();writer.write(data)
        with self.assertRaisesRegex(ReportError,"паролем"):
            extract_report(data.getvalue())

    def test_image_only_pdf(self):
        writer=PdfWriter();writer.add_blank_page(width=595,height=842)
        data=io.BytesIO();writer.write(data)
        with self.assertRaisesRegex(ReportError,"не найден текст"):
            extract_report(data.getvalue())


if __name__=="__main__":
    unittest.main()
