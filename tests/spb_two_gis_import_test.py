import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('spb_2gis',Path(__file__).resolve().parents[1]/'scripts/import-spb-2gis.py')
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ImportTests(unittest.TestCase):
    def test_existing_fields_are_replaced(self):
        original={'name':'Старое имя','openingHours':'24/7','website':'https://old.example','photo':{'url':'old'}}
        f={'id':'1','url':'https://2gis.ru/spb/firm/1','checkedAt':'2026-10-06','name':'Новое имя','lat':59.94,'lon':30.31,'category':'Музей','openingHours':'Mo-Su 10:00-18:00','website':'https://new.example','photo':{'url':'new'}}
        patch=m.make_patch(f,original)
        for field in ['name','openingHours','website','photo']: self.assertEqual(patch[field],f[field])
        self.assertEqual(patch['hoursSource'],f['url'])
        self.assertIn(original['name'],patch['aliases'])
        self.assertEqual(original['photo']['url'],'old')

    def test_matching_does_not_merge_nearby_different_places_or_generic_buildings(self):
        f={'name':'Музей истории','lat':59.94,'lon':30.31}
        nearby=[{'id':'a',**f},{'id':'b',**f,'name':'Музей транспорта'},{'id':'c',**f,'lat':59.96}]
        self.assertEqual([p['id'] for p,d in m.identity_matches(f,nearby)],['a'])
        self.assertEqual(m.identity_matches({**f,'name':'Доходный дом'},[{**nearby[0],'name':'Доходный дом'}]),[])

    def test_observed_type_overrides_mixed_search_category(self):
        self.assertEqual(m.category_for({'category':'Парк','text':'Мариинский Театр\nТеатр\n4.9'}),'Достопримечательность')
        self.assertEqual(m.category_for({'category':'Парк','text':'Музей истории\nМузей\n4.9'}),'Музей')
        self.assertEqual(m.category_for({'category':'Музей','text':'Собор\nСобор\n4.9'}),'Храм')

    def test_observed_commercial_rubric_excludes_museum_search_ad(self):
        c={'name':'Музей','url':'https://2gis.ru/spb/firm/1','text':'Музей\nКомпания','category':'Музей','coordinates':{'lat':59.94,'lon':30.31}}
        with self.assertRaisesRegex(ValueError,'Commercial venue'):
            m.observed_facts(c,{**c,'rubricNames':['Продажа чая']},'2026-10-06',Path('/tmp'))

    def test_multiple_intervals_and_closed_days_are_preserved(self):
        text='Пн — Пт\n09:00–12:00, 13:00–18:00\nСб\n10:00–16:00\nВс\nВыходной'
        self.assertEqual(m.parse_hours(text),'Mo 09:00-12:00,13:00-18:00; Tu 09:00-12:00,13:00-18:00; We 09:00-12:00,13:00-18:00; Th 09:00-12:00,13:00-18:00; Fr 09:00-12:00,13:00-18:00; Sa 10:00-16:00; Su off')
        self.assertIsNone(m.parse_hours('Сегодня c 10:00 до 18:00'))
        self.assertIsNone(m.parse_hours('Пн\n10:00–18:00'))

    def test_multiline_card_address_takes_precedence_over_search(self):
        c={'name':'Дом','url':'https://2gis.ru/spb/geo/1','text':'Дом\nСтарая улица, 1, Санкт-Петербург','category':'Достопримечательность','coordinates':{'lat':59.94,'lon':30.31}}
        o={**c,'text':'Дом\nНовая улица, 29\nЧкаловское, Петроградский район, Санкт-Петербург'}
        self.assertEqual(m.observed_facts(c,o,'2026-10-07',Path('/tmp'))['address'],'Новая улица, 29, Санкт-Петербург')
        o['text']='Дом\nЖилой дом'
        self.assertEqual(m.observed_facts(c,o,'2026-10-07',Path('/tmp'))['address'],'Старая улица, 1, Санкт-Петербург')

if __name__=='__main__':unittest.main()
