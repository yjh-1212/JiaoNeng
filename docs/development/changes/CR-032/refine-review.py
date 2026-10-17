from pathlib import Path
p=Path(__file__).with_name('browser-review.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("live=process.argv.includes('--live'),out=", "live=process.argv.includes('--live'),focused=process.argv.includes('--focused'),prefix=local?(focused?'local-final-':'local-'):'',out=")
s=s.replace("(local?'local-':'')",'prefix').replace('of routes){','of (focused?[]:routes)){')
s=s.replace('async function scan(name){const text=await p.evaluate','async function scan(name,page=p){const text=await page.evaluate')
needle="await p.locator('.ant-drawer-close:visible').click();"
assert needle in s
s=s.replace(needle,"""if(focused&&solution.facilities.length){await p.locator('.regional-station-list input[type=checkbox]').first().check();const rerouted=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/regional-scenarios/solve',{timeout:180000});await p.getByRole('button',{name:'按所选补能点重算路线',exact:true}).click();const r2=await rerouted;const chosen=await r2.json();assert(r2.ok(),JSON.stringify(chosen));assert.equal(chosen.inputs.station_ids.length,1);assert(chosen.candidates.every(c=>c.metrics.charging_stops.length===1));await p.waitForFunction(()=>!document.querySelector('.regional-result-strip')?.textContent.includes('正在分析路线'),{timeout:80000});log('选择真实补能地点后重新计算经过该地点的道路');}else await p.locator('.ant-drawer-close:visible').click();""")
needle=' assert.deepEqual(errors,[]);'
assert needle in s
s=s.replace(needle,""" const driver=await p.context().newPage();driver.on('pageerror',e=>errors.push(e.message));await driver.setViewportSize({width:390,height:844});await driver.goto(base+'/driver');await driver.locator('.phone-nav').waitFor();for(const [route,title] of [['m-tasks','我的任务'],['m-energy','补能安排'],['m-profile','我的']]){await driver.evaluate(r=>location.hash=r,route);await driver.getByRole('heading',{name:title,exact:true}).waitFor();await scan('driver '+route,driver);}await driver.screenshot({path:out+prefix+'driver-profile.png',fullPage:true});await driver.close();log('司机端三个页面数据与文案检查');
 assert.deepEqual(errors,[]);""")
p.write_text(s,encoding='utf-8');print('Focused final review and driver checks ready')
