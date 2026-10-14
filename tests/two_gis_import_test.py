import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('two_gis',Path(__file__).resolve().parents[1]/'scripts/import-kurgan-2gis.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ScheduleTests(unittest.TestCase):
    def test_weekdays_with_breaks_and_weekend(self):
        value=module.parse_hours('Пн — Пт\n09:00–17:00\nПерерыв 12:00–12:30\nСб — Вс\nВыходной')
        self.assertEqual(value,'Mo 09:00-12:00,12:30-17:00; Tu 09:00-12:00,12:30-17:00; We 09:00-12:00,12:30-17:00; Th 09:00-12:00,12:30-17:00; Fr 09:00-12:00,12:30-17:00; Sa off; Su off')
    def test_only_today_and_partial_week_are_not_weekly_hours(self):
        self.assertIsNone(module.parse_hours('Открыто\nСегодня c 09:00 до 18:00'))
        self.assertIsNone(module.parse_hours('Понедельник\n10:00–18:00'))
    def test_daily_break_and_nbsp(self):
        self.assertEqual(module.parse_hours('Ежедневно\xa0с\xa010:00\xa0до\xa018:00, обед\xa0c\xa013:00\xa0до\xa014:00'),'Mo-Su 10:00-13:00,14:00-18:00')

if __name__=='__main__':unittest.main()
