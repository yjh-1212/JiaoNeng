// Historical generated records remain in place. Operational reads exclude them at SQL scope.
const sourceTables=['demands','orders','vehicles','drivers','stations','devices','tasks','trips','simulations','charging','sessions','costs','alerts','records','telemetry'];
export function installDataVisibility(db){
 db.exec("CREATE TABLE IF NOT EXISTS data_visibility(resource TEXT NOT NULL,id TEXT NOT NULL,classification TEXT NOT NULL,PRIMARY KEY(resource,id))");
 db.exec("CREATE TABLE IF NOT EXISTS operational_records(resource TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(resource,id)); CREATE TABLE IF NOT EXISTS data_view_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
 for(const table of sourceTables){
  const cols=db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name);
  const condition=cols.includes('source')?"source IN('SIMULATED','MANUAL_SIMULATION','DRIVER_MANUAL_SIMULATION','DERIVED_SIMULATION','REFERENCE_PARAMETER')":"0";
  db.exec(`INSERT OR IGNORE INTO data_visibility(resource,id,classification) SELECT ${table==='records'?'resource':"'"+table+"'"},id,'CALCULATION_ONLY' FROM ${table} WHERE (${condition}) AND NOT EXISTS(SELECT 1 FROM operational_records op WHERE op.resource=${table==='records'?'records.resource':"'"+table+"'"} AND op.id=${table}.id)`);
 }
 if(!db.prepare("SELECT 1 FROM data_view_state WHERE key='installed'").get()){
  db.exec("INSERT OR IGNORE INTO data_visibility SELECT 'agent-conversations',id,'CALCULATION_ONLY' FROM agent_conversations");
  db.prepare("INSERT INTO data_view_state VALUES('installed',?)").run(new Date().toISOString());
 }
}
export function visibilityClause(user,resource,table){
 if(user.data_view!=='operational')return '';
 return ` AND NOT EXISTS(SELECT 1 FROM data_visibility dv WHERE dv.resource='${resource}' AND dv.id=${table}.id)`;
}
