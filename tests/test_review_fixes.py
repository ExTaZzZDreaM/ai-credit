import ast
import unittest
from copy import deepcopy
from pathlib import Path

from credit_report import detect_bureau, parse_pages, validate_loans
from gkb_report import parse_gkb_rows
from test_gkb import HEADER, row
from test_report import contract, page

ROOT = Path(__file__).resolve().parent.parent


class IssuesSurviveRecalculation(unittest.TestCase):
    def test_pkb_issues_kept_after_save(self):
        r = parse_pages([page(contract(role="Не указана", payment=""))])
        before = r["loans"][0]["issues"]
        self.assertIn("Уточните свою роль в договоре.", before)
        self.assertIn("Не найден регулярный платёж.", before)
        after = validate_loans(deepcopy(r["loans"]))[0]["issues"]
        self.assertEqual(after, before)

    def test_edit_clears_only_resolved_issue(self):
        r = parse_pages([page(contract(role="Не указана", payment=""))])
        loans = deepcopy(r["loans"])
        loans[0].update(payment="5000", payment_basis="user_entered_monthly")
        issues = validate_loans(loans)[0]["issues"]
        self.assertNotIn("Не найден регулярный платёж.", issues)
        self.assertIn("Уточните свою роль в договоре.", issues)

    def test_unknown_status_and_future_date_kept(self):
        block = contract(section="").replace("24.11.2026", "01.01.2099")
        loan = validate_loans(parse_pages([page(block)])["loans"])[0]
        self.assertIn("Не определён статус договора.", loan["issues"])
        self.assertIn("Дата сведений находится в будущем.", loan["issues"])

    def test_gkb_issues_kept_after_save(self):
        rows = [(1, row()), (1, row("TEST-B", frequency="Раз в две недели", payment="4 000,00"))]
        r = parse_gkb_rows([HEADER], rows, {}, "r.pdf")
        before = r["loans"][1]["issues"]
        self.assertTrue(any(i.startswith("Предстоящий платёж: 4 000 KZT.") for i in before))
        self.assertEqual(validate_loans(deepcopy(r["loans"]))[1]["issues"], before)

    def test_gkb_assumed_monthly_text_kept(self):
        r = parse_gkb_rows([HEADER], [(1, row(frequency="Нет данных"))], {}, "r.pdf")
        before = r["loans"][0]["issues"]
        self.assertTrue(any("Периодичность в ГКБ не указана" in i for i in before))
        self.assertEqual(validate_loans(deepcopy(r["loans"]))[0]["issues"], before)


class ReportDate(unittest.TestCase):
    def test_labelled_date_wins_over_earlier_unlabelled_date(self):
        first = "ПКБ кредитный отчет\nДоговор от 3 марта 2021\nДата формирования: 25.11.2026\n" + contract()
        self.assertEqual(parse_pages([first])["report"]["report_date"], "2026-11-25")

    def test_labelled_month_name_date(self):
        first = "ПКБ кредитный отчет\nЗаём от 3 марта 2021\nДата выдачи отчёта: 4 апреля 2024 года\n" + contract()
        self.assertEqual(parse_pages([first])["report"]["report_date"], "2024-04-04")


class BureauDetection(unittest.TestCase):
    def test_pkb_report_mentioning_state_bureau(self):
        text = page(contract()) + "\nСведения также передаются в Государственное кредитное бюро."
        self.assertEqual(detect_bureau([text]), "ПКБ")
        self.assertEqual(parse_pages([text])["report"]["bureau"], "ПКБ")

    def test_glued_words_are_not_an_abbreviation(self):
        text = "Кредитный отчет\nДолг к банку\n" + contract()
        self.assertEqual(detect_bureau([text]), "ПКБ")

    def test_gkb_header(self):
        self.assertEqual(detect_bureau([HEADER]), "ГКБ")


class NoUnusedPdfDependency(unittest.TestCase):
    def test_runtime_does_not_import_pypdf(self):
        for name in ["app.py", "credit_report.py", "gkb_report.py", "pkb_enrichment.py", "pdf_input.py"]:
            tree = ast.parse((ROOT / name).read_text(encoding="utf-8"))
            modules = {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
            modules |= {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)}
            self.assertNotIn("pypdf", modules, name)


if __name__ == "__main__":
    unittest.main()
