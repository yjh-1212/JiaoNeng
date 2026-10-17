from pathlib import Path
root=Path(__file__).resolve().parents[4]
def change(file,old,new):
 p=root/file;s=p.read_text(encoding='utf-8');assert old in s,(file,old);p.write_text(s.replace(old,new),encoding='utf-8')
change('server/regional-planner.mjs',"driver_hour:45,goal:'existing'","driver_hour:45,goal:'deadline'")
change('server/regional-planner.mjs',"result={id,inputs:i,candidates","result={id,owner_id:ownerId,inputs:i,candidates")
change('client/regional-simulation.jsx',"label:'现有车数运完'","label:'按给定车数'")
change('client/regional-simulation.jsx',"<label>参与车辆 <InputNumber","<label>车辆上限 <InputNumber")
change('client/regional-simulation.jsx'," 辆</label><div className=\"regional-actions-end\">"," 辆</label>{inputs.goal!=='existing'&&<label>最晚完成 <input className=\"regional-deadline\" aria-label=\"最晚完成\" type=\"datetime-local\" value={local(inputs.deadline)} onChange={e=>{if(e.target.value)patch('deadline',new Date(e.target.value).toISOString());}}/></label>}<div className=\"regional-actions-end\">")
change('client/regional-simulation.jsx',"capability:'SIMULATION',...(result?","capability:'SIMULATION',owner_id:result?.owner_id||boundOrder?.owner_id||a.user.scopes[0],...(result?")
change('client/regional-simulation.jsx',"<Checkbox checked={stations.includes(s.id)}","<Checkbox disabled={stations.length>=12&&!stations.includes(s.id)} checked={stations.includes(s.id)}")
change('client/regional-simulation.jsx',"{result?.limitations.map(x=>", "<h3>公开重卡补能设施</h3>{catalog?.facilities.map(s=><p className=\"regional-muted\" key={s.id}>{s.name} · {s.city} · <a href={catalog.sources.find(r=>r.id===s.source_id)?.url} target=\"_blank\" rel=\"noreferrer\">查看公开依据</a></p>)}{result?.limitations.map(x=>")
print('Regional planning conditions and provenance refined')
