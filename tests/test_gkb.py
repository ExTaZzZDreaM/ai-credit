import io
import unittest

from credit_report import ReportError, demo_pdf, extract_report, summarize, validate_loans
from gkb_report import parse_gkb_rows
from pdf_input import pdf_payload


HEADER = "Государственное кредитное бюро\nКраткая форма\nДата и время выдачи: 25.11.2026 12:00\n2 ДЕЙСТВУЮЩИЕ ДОГОВОРЫ\n3 ЗАВЕРШЕННЫЕ ДОГОВОРЫ"


def row(ref="TEST-A", frequency="Ежемесячные платежи - 30 дней", role="Заёмщик", currency="KZT", balance="10000", payment="3000", overdue="0", penalty="0", days="0"):
    return [None,"Тест Банк",ref,currency,role,"18.11.2026",payment,frequency,balance,overdue,penalty,days,"Нет"]


def der(tag, content):
    size = len(content)
    length = bytes([size]) if size < 128 else bytes([128 + (size.bit_length()+7)//8]) + size.to_bytes((size.bit_length()+7)//8,"big")
    return bytes([tag]) + length + content


def container(pdf):
    # Structurally valid CMS test fixture, with no verified signer or certificate.
    content = der(0x30,der(6,bytes.fromhex("2a864886f70d010701"))+der(0xa0,der(4,pdf)))
    signed = der(0x30,der(2,b'\x01')+der(0x31,b'')+content+der(0x31,b''))
    return der(0x30,der(6,bytes.fromhex("2a864886f70d010702"))+der(0xa0,signed))


def sample_pdf():
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import ParagraphStyle
    demo_pdf()  # Register the bundled Cyrillic-capable demo font.
    style=ParagraphStyle('test',fontName='PilotDemo',fontSize=12,leading=16)
    output=io.BytesIO()
    doc=SimpleDocTemplate(output,pagesize=(1600,900),leftMargin=30,rightMargin=30,topMargin=30,bottomMargin=30)
    table=Table([
        ['№:','Кредитор:','Номер договора:','Валюта:','Роль субъекта:','Учетная дата:','Сумма предстоящего платежа:','Периодичность платежа','Общая задолженность:','Просроченная задолженность:','Пеня/штраф:','Количество дней просрочки:','Обеспечение:'],
        row(),row('TEST-B',frequency='Нет данных',balance='20000',payment='4000')
    ],colWidths=[25,150,100,60,90,90,140,260,110,130,80,140,80])
    table.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'PilotDemo'),('FONTSIZE',(0,0),(-1,-1),8),('GRID',(0,0),(-1,-1),.5,'black'),('BOTTOMPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),12)]))
    doc.build([Paragraph(HEADER.replace('\n','<br/>'),style),Spacer(1,25),table])
    return output.getvalue()


class GkbTests(unittest.TestCase):
    def parse(self,rows=None,totals=None,header=HEADER):
        return parse_gkb_rows([header], rows if rows is not None else [(1,row()),(2,row('TEST-B',frequency='Нет данных',balance='20000',payment='4000'))], totals or {}, 'synthetic-gkb.pdf')

    def test_missing_frequency_is_an_explicit_monthly_assumption(self):
        r=self.parse(totals={'KZT':30000})
        g=r['summary']['currencies']['KZT']
        self.assertEqual(g['balance'],30000)
        self.assertEqual(g['next_payment'],7000)
        self.assertEqual(g['payment'],7000)
        self.assertEqual(g['payment_known'],2)
        self.assertEqual(g['payment_assumed_count'],1)
        self.assertFalse(g['payment_complete'])
        self.assertEqual(r['loans'][1]['payment'],4000)
        self.assertEqual(r['loans'][1]['payment_basis'],'assumed_monthly')
        self.assertIn('предположена',r['loans'][1]['sources']['payment']['label'])
        self.assertEqual(r['loans'][1]['sources']['next_payment']['page'],2)
        self.assertEqual(r['report']['declared_closed'],3)
        self.assertFalse(r['report']['closed_details_available'])
        self.assertEqual(r['summary']['closed_count'],0)

    def test_fortnightly_and_final_payment_are_not_monthly(self):
        for frequency in ['Платежи 1 раз в две недели - 15 дней','В день истечения срока кредитного договора']:
            r=self.parse([(1,row(frequency=frequency))])
            self.assertIsNone(r['loans'][0]['payment'])
            self.assertEqual(r['loans'][0]['next_payment'],3000)

    def test_currency_roles_and_nonzero_columns(self):
        r=self.parse([(1,row(overdue='500',penalty='100',days='7')),(1,row('GUAR',role='Поручитель',balance='900000')),(2,row('USD',currency='USD',balance='500',payment='40'))])
        self.assertEqual(r['summary']['currencies']['KZT']['balance'],10000)
        self.assertEqual(r['summary']['currencies']['USD']['balance'],500)
        self.assertEqual(r['summary']['guarantor_count'],1)
        self.assertEqual(r['summary']['overdue_count'],1)
        self.assertEqual(r['loans'][0]['overdue_amount'],500)
        self.assertEqual(r['loans'][0]['overdue_days'],7)

    def test_missing_zero_and_invalid_amounts(self):
        r=self.parse([(1,row(payment='0',balance='Нет данных')),(2,row('B',payment='bad'))])
        self.assertEqual(r['loans'][0]['payment'],0)
        self.assertIsNone(r['loans'][0]['balance'])
        self.assertIsNone(r['loans'][1]['next_payment'])

    def test_count_total_mismatch_and_duplicate(self):
        r=self.parse([(1,row()),(2,row())],totals={'KZT':999})
        self.assertEqual(len(r['loans']),1)
        codes=[w.get('code') for w in r['warnings']]
        self.assertIn('contract_count_mismatch',codes)
        self.assertIn('balance_total_mismatch',codes)

    def test_edits_preserve_original_next_payment(self):
        r=self.parse();loans=r['loans'];loans[1]['payment']=4500
        clean=validate_loans(loans)
        self.assertEqual(clean[1]['next_payment'],4000)
        self.assertIn('next_payment',clean[1]['sources'])
        self.assertEqual(summarize(clean)['currencies']['KZT']['payment'],7500)
        self.assertEqual(summarize(clean)['currencies']['KZT']['next_payment'],7000)

    def test_monthly_confirmation_clears_assumption_and_preserves_source(self):
        r=self.parse();r['loans'][1]['payment_basis']='user_confirmed_monthly'
        clean=validate_loans(r['loans']);g=summarize(clean)['currencies']['KZT']
        self.assertTrue(g['payment_complete'])
        self.assertEqual(g['payment_assumed_count'],0)
        self.assertEqual(clean[1]['next_payment'],4000)
        self.assertIn('предположена',clean[1]['sources']['payment']['label'])

    def test_empty_and_unknown_layout(self):
        self.assertEqual(self.parse([],header=HEADER.replace('2 ДЕЙСТВУЮЩИЕ','0 ДЕЙСТВУЮЩИЕ'))['loans'],[])
        with self.assertRaises(ReportError):self.parse([])
        with self.assertRaises(ReportError):self.parse(header='Неизвестный макет')

    def test_actual_pdf_and_signed_envelope_use_same_pipeline(self):
        pdf=sample_pdf()
        for data,signed in [(pdf,False),(container(pdf),True)]:
            r=extract_report(data)
            self.assertEqual(r['report']['bureau'],'ГКБ')
            self.assertEqual(r['report']['report_date'],'2026-11-25')
            self.assertEqual(r['report']['declared_active'],2)
            self.assertEqual(r['summary']['currencies']['KZT']['balance'],30000)
            self.assertEqual(r['summary']['currencies']['KZT']['payment'],7000)
            self.assertEqual(r['report']['input_container'],'cms_signed_data' if signed else 'pdf')

    def test_container_requires_exact_content_and_bounds(self):
        pdf=b'%PDF-test'
        self.assertEqual(pdf_payload(container(pdf)),(pdf,True))
        for data in [b'random-prefix'+pdf,container(pdf)[:-1],container(pdf)+b'junk',container(b'not PDF'),container(pdf).replace(bytes.fromhex('2a864886f70d010702'),bytes.fromhex('2a864886f70d010703'),1)]:
            with self.assertRaises(ValueError):pdf_payload(data)


if __name__=='__main__':unittest.main()
