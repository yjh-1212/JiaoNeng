from pathlib import Path
root=Path(__file__).resolve().parents[4]
def change(file,old,new):
 p=root/file;s=p.read_text(encoding='utf-8');assert old in s,(file,old);p.write_text(s.replace(old,new),encoding='utf-8')
change('server/regional-engine.mjs','duration_minutes:Math.round(single.elapsed*60)','one_way_minutes:Math.round(loadedHours*60),duration_minutes:Math.round(single.elapsed*60)')
change('server/regional-engine.mjs','arrival_soc:round(arrivalSoc),on_time:','single_trip_arrival_soc:round(arrivalSoc),arrival_soc:single.journeys>1?null:round(arrivalSoc),on_time:')
change('server/regional-engine.mjs','dispatch_ready:!needs&&energetic&&single.finish<=+new Date(i.deadline)','dispatch_ready:false')
change('client/regional-simulation.jsx','format(c.route.duration_s/3600)','format(c.metrics.one_way_minutes/60)')
change('docs/development/changes/CR-032/current-data-review.mjs','Later concurrent scenario.save/run operations appended records/audit/command results; no rollback or restoration performed.','This review saved public regional route calculations as additional records; original rows remain preserved. No rollback or restoration performed.')
print('Single-trip reference, replenishment requirements and data evidence clarified')
