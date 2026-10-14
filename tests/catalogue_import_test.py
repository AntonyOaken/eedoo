import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('catalogue',Path(__file__).resolve().parents[1]/'scripts/data/catalogue.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class CatalogueImport(unittest.TestCase):
 def raw(self,elements):return {'osm3s':{'timestamp_osm_base':'2026-10-05T17:00:00Z'},'elements':elements}
 def element(self,id=1,type='node',**tags):return {'id':id,'type':type,'lat':55.44,'lon':65.34,'tags':{'name':'Кафе','amenity':'cafe',**tags}}
 def test_distinct_node_way_ids_survive(self):
  snapshot,_=module.compile_snapshot(self.raw([self.element(),self.element(type='way')]),'kurgan','food');self.assertEqual(len(snapshot['places']),2)
 def test_unavailable_places_excluded_and_source_timestamp_is_not_verification(self):
  snapshot,skipped=module.compile_snapshot(self.raw([self.element(),self.element(id=2,disused='yes'),self.element(id=3,access='private')]),'kurgan','food');self.assertEqual(len(snapshot['places']),1);self.assertEqual(len(skipped),2);self.assertNotIn('checkedAt',snapshot['places'][0]);self.assertEqual(snapshot['places'][0]['dataUpdatedAt'],'2026-10-05T17:00:00Z')
 def test_partial_response_rejected(self):
  raw=self.raw([self.element()]);raw['remark']='runtime error: Query timed out';self.assertRaises(ValueError,module.compile_snapshot,raw,'kurgan','food')
 def test_abandoned_accessible_historic_ruin_is_not_closed_business(self):
  self.assertFalse(module.unavailable({'historic':'ruins','abandoned':'yes'}))
if __name__=='__main__':unittest.main()
