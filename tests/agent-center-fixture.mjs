import { scenarioDefaults, scenarioCommand, prepareScenario } from '../server/scenarios.mjs';
import { transaction } from '../server/db.mjs';
// Real solver and persisted scene; only the road provider is an explicit isolated test double.
export async function agentScene(f) {
  const user={id:'U-ADMIN',role:'admin',scopes:['ORG-N','ORG-S'],operations:['*']};
  const defaults=scenarioDefaults(f.db,user,'orders','O013');
  const saved=transaction(f.db,()=>scenarioCommand(f.db,user,'scenario.save',null,{
    source_resource:'orders',source_id:'O013',inputs:{...defaults.inputs,goal:'existing',resource_mode:'reference',vehicle_count:2,vehicle_limit:6,station_ids:[],include_external:false,initial_soc:95}
  }));
  const payload={expected_version:saved.scenario.version};
  const prepared=await prepareScenario(f.db,user,saved.id,payload,async([a,z])=>({coordinates:[a,[(a[0]+z[0])/2+.001,(a[1]+z[1])/2+.001],z],distance_m:1000,source:'TEST_ROAD'}));
  return transaction(f.db,()=>scenarioCommand(f.db,user,'scenario.run',saved.id,payload,prepared)).scenario;
}
