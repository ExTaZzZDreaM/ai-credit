import unittest
from copy import deepcopy
from datetime import date, timedelta

from credit_report import parse_pages, summarize, validate_loans
from pkb_enrichment import inquiry_fields
from test_report import page, contract


def journal(rows):
    return 'Информация о произведенных запросах и мониторинге кредитной истории\nКем осуществлен запрос\nВид кредитного отчета\nДата запроса\n'+'\n'.join(rows)


class PkbEnrichmentTests(unittest.TestCase):
    def test_limit_is_separate_from_balance_and_has_currency(self):
        r=parse_pages([page(contract(balance='12000',extra='Сумма кредитного лимита: 50 000,50 KZT'))])
        l=r['loans'][0]
        self.assertEqual(l['credit_limit'],50000.5)
        self.assertEqual(l['credit_limit_currency'],'KZT')
        self.assertEqual(r['summary']['currencies']['KZT']['balance'],12000)
        self.assertEqual(l['sources']['credit_limit']['currency'],'KZT')
        self.assertEqual(l['sources']['credit_limit']['page'],1)

    def test_zero_limit_and_mixed_currency_are_explicit(self):
        r=parse_pages([page(contract(extra='Сумма кредитного лимита: 0 USD'))])
        self.assertEqual(r['loans'][0]['credit_limit'],0)
        self.assertEqual(r['loans'][0]['credit_limit_currency'],'USD')
        self.assertTrue(any('лимита' in issue for issue in r['loans'][0]['issues']))
        self.assertEqual(r['loans'][0]['currency'],'KZT')

    def test_dates_and_historical_maximum_continue_across_pages(self):
        first=page(contract(extra='Дата начала срока действия договора: 01.03.2020'))
        second='''Дата окончания срока действия договора: 15.04.2030
Максимальное количество дней просрочки с начала действия договора
95 Сумма просроченных взносов: 90000
Количество дней просрочки: 90'''
        r=parse_pages([first,second]);l=r['loans'][0]
        self.assertEqual((l['start_date'],l['end_date']),('2020-03-01','2030-04-15'))
        self.assertEqual(l['max_overdue_days_history'],95)
        self.assertEqual(l['history_scope'],'since_contract_start')
        self.assertEqual(l['sources']['end_date']['page'],2)
        self.assertEqual(l['sources']['max_overdue_days_history']['page'],2)
        self.assertEqual(l['overdue_days'],0)
        self.assertEqual(l['overdue_amount'],0)
        self.assertEqual(r['summary']['overdue_count'],0)

    def test_split_history_caption_does_not_become_current_arrears(self):
        text=contract().replace('Сумма просроченных взносов: 0 KZT','').replace('Количество дней просрочки: 0','')
        r=parse_pages([page(text),'Максимальное количество дней 60 Сумма просроченных взносов: 50000 KZT','просрочки с начала действия договора\nМаксимальная сумма просроченных взносов с начала действия договора 50000'])
        l=r['loans'][0]
        self.assertEqual(l['max_overdue_days_history'],60)
        self.assertEqual(l['sources']['max_overdue_days_history']['page'],2)
        self.assertIsNone(l['overdue_amount'])
        self.assertIsNone(l['overdue_days'])

    def test_closed_history_stays_closed_and_end_date_is_scheduled(self):
        r=parse_pages([page(contract(section='Завершенные договоры',status='Завершен',extra='Дата окончания срока действия договора: 31.12.2025\nДата фактического завершения: 01.01.2025\nМаксимальное количество дней просрочки с начала действия договора: 30'))])
        self.assertEqual(r['loans'][0]['end_date'],'2025-12-31')
        self.assertEqual(r['loans'][0]['max_overdue_days_history'],30)
        self.assertEqual(r['summary']['active_count'],0)
        self.assertEqual(r['summary']['currencies'],{})

    def test_missing_history_and_dates_are_not_inferred(self):
        r=parse_pages([page(contract(extra='Дата окончания срока действия договора: 31.02.2030\nПлатежная дисциплина за 24 месяца\nДни просрочки 0 0 90'))])
        l=r['loans'][0]
        self.assertIsNone(l['credit_limit'])
        self.assertIsNone(l['start_date'])
        self.assertIsNone(l['end_date'])
        self.assertIsNone(l['max_overdue_days_history'])
        self.assertNotIn('max_overdue_days_history',l['sources'])

    def test_explicit_historical_zero_is_known(self):
        r=parse_pages([page(contract(extra='Максимальное количество дней просрочки с начала действия договора: 0'))])
        self.assertEqual(r['loans'][0]['max_overdue_days_history'],0)

    def test_query_windows_boundaries_duplicates_and_report_date(self):
        ref=date(2026,11,25)
        rows=[f'Тест Банк Кредитный отчет - расширенный {(ref-timedelta(days=days)).strftime("%d.%m.%Y")}' for days in [0,0,29,30,89,90,-1]]
        fields,sources,warnings=inquiry_fields([journal(rows)],ref.isoformat())
        self.assertEqual(fields['inquiries_30d'],3)
        self.assertEqual(fields['inquiries_90d'],5)
        self.assertEqual(sources['inquiries_30d']['window_start'],'2026-10-27')
        self.assertEqual(sources['inquiries_90d']['window_start'],'2026-08-28')
        self.assertTrue(warnings) # Date after issue date was excluded.

    def test_query_types_continuation_page_and_applications_are_distinct(self):
        first='Кредитная заявка № 1\nДата заявки: 25.11.2026\n'+journal(['Тест Банк Кредитный отчет - расширенный 25.11.2026'])
        second='ID субъекта TEST\nДата выдачи: 25.11.2026 11:00:00\nПортал Персональный кредитный отчет 20.11.2026\nТест Банк Мониторинг кредитной истории 19.11.2026\nВнимание!\nКредитный отчет рекламный пример 18.11.2026'
        f,s,_=inquiry_fields([first,second],'2026-11-25')
        self.assertEqual(f['inquiries_30d'],3)
        self.assertEqual(f['inquiries_by_kind']['30d'],{'credit_report':1,'personal_report':1,'monitoring':1})
        self.assertEqual(s['inquiries_30d']['pages'],[1,2])
        self.assertEqual([e['page'] for e in f['inquiry_events']],[1,2,2])
        self.assertFalse(any('кредитор' in e or 'requester' in e for e in f['inquiry_events']))

    def test_absent_unknown_and_explicit_empty_journal(self):
        for text in ['Кредитные заявки 0','Информация о произведенных запросах кредитной истории\nНеизвестный макет']:
            f,_,_=inquiry_fields([text],'2026-11-25')
            self.assertIsNone(f['inquiries_30d'])
            self.assertIsNone(f['inquiries_90d'])
        f,_,_=inquiry_fields([journal(['Запросы отсутствуют'])],'2026-11-25')
        self.assertEqual((f['inquiries_30d'],f['inquiries_90d']),(0,0))

    def test_invalid_or_missing_reference_date_does_not_guess(self):
        for rows,reference in [(['Банк Кредитный отчет 32.11.2026'],'2026-11-25'),(['Банк Кредитный отчет 25.11.2026'],None)]:
            f,_,w=inquiry_fields([journal(rows)],reference)
            self.assertIsNone(f['inquiries_30d'])
            self.assertTrue(w)

    def test_new_fields_survive_edits_and_preserve_original_sources(self):
        r=parse_pages([page(contract(extra='Сумма кредитного лимита: 50000 KZT\nДата окончания срока действия договора: 01.01.2030\nМаксимальное количество дней просрочки с начала действия договора: 0'))])
        loans=deepcopy(r['loans']);loans[0].update(credit_limit='60000,50',end_date='2031-01-01',max_overdue_days_history='30',edited=True)
        l=validate_loans(loans)[0]
        self.assertEqual((l['credit_limit'],l['end_date'],l['max_overdue_days_history']),(60000.5,'2031-01-01',30))
        self.assertEqual(l['sources']['credit_limit']['value'],50000)
        self.assertEqual(l['sources']['end_date']['value'],'2030-01-01')
        self.assertEqual(l['sources']['credit_limit']['currency'],'KZT')
        self.assertEqual(summarize([l])['overdue_count'],0)

    def test_new_field_validation_rejects_invalid_values(self):
        original=parse_pages([page(contract())])['loans']
        for field,value in [('credit_limit',-1),('credit_limit',True),('max_overdue_days_history',1.5),('max_overdue_days_history',True),('end_date','2030-02-31'),('start_date','20300101'),('history_scope','made-up'),('credit_limit_currency','BAD')]:
            loans=deepcopy(original);loans[0][field]=value
            with self.subTest(field=field,value=value):
                with self.assertRaises(ValueError):validate_loans(loans)


if __name__=='__main__':unittest.main()
