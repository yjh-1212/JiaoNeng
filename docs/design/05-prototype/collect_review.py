"""Collect prototype evidence without changing approved D0-D4 artifacts."""
import csv,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
def rows(rel):
 with (ROOT/rel).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def csv_write(name,values):
 with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(values[0]));w.writeheader();w.writerows(values)
pages=rows('docs/design/04-ux-ui/page-inventory.csv');functions=rows('docs/design/03-prd/feature-catalog.csv');trace=rows('docs/design/03-prd/traceability.csv')
html=(ROOT/'prototypes/design-preview/index.html').read_text(encoding='utf-8')
nav=['# D5 原型导航索引','','状态：已制作待用户确认。独立HTML内嵌真实组件运行时，可直接双击打开，无后端，无正式源码改动。所有业务数据/计算/身份/操作为模拟。','','入口：`prototypes/design-preview/index.html`；浏览器地址hash选择具体页面；默认总览。交能推演为辽粮上下布局。建议先按[演示路径](walkthrough.md)走运输闭环，再审阅其余模块。','','| 页面ID | 页面 | 导航位置 | 独立原型入口 |','|---|---|---|---|']
for p in pages:nav.append(f"| {p['page_id']} | {p['page_name']} | {p['nav_group']} | [打开](../../../{p['prototype_ref']}) |")
nav+=['','7个管理端一级入口、18个二级菜单；运营总览直接进入。详情/记录/核验/车次均为内部交互，不添加菜单。司机底部任务/补能/我的，登录及个人信息为通用入口。','','顶部“演示”入口收纳状态、权限、主题、司机H5和重置评审工具；正常页面不展示解释横条。导航采用顶部一级菜单及下拉二级菜单，下方为业务内容。表格搜索/状态筛选/分页、表单必填/边界提示、模态关闭保护、详情面板、地图图层/选中/缩放、同一数据的跨页状态均可演示。','','高德底图仅在选择本地配置后请求官方JSAPI，本轮外部加载失败；默认示意图可离线。DeepSeek未连接。真实接口、数据库、权限安全、事务原子性和算法精度不由本原型证明。']
(OUT/'navigation.md').write_text('\n'.join(nav)+'\n',encoding='utf-8')
feature_cov=[]
for f in functions:
 p=next(p for p in pages if p['page_id']==f['page_id'])
 feature_cov.append(dict(feature_id=f['feature_id'],req_id=f['req_id'],module_id=f['module_id'],feature_name=f['feature_name'],page_id=f['page_id'],prototype_ref=p['prototype_ref'],interaction=f['actions'],verification='已提供界面/本地模拟交互；自动化实际执行范围见evidence/test-results.json与module-tests.json',production_status='未开发；真实数据/算法/API不在原型验收范围'))
csv_write('feature-coverage.csv',feature_cov)
csv_write('requirement-coverage.csv',[dict(req_id=t['req_id'],module_id=t['module_id'],page_id=t['page_id'],prototype_ref=t['prototype_ref'],acceptance_id=t['acceptance_id'],coverage='界面与模拟交互可追踪；实际验收证据按测试报告，不等于生产通过') for t in trace])
state=json.loads((ROOT/'docs/design/design-state.json').read_text(encoding='utf-8'))
hash_checks=[]
for stage,a in state['approvals'].items():
 hash_checks.append(dict(stage=stage,result=all((ROOT/p).exists() and hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in a['file_hashes'].items())))
core=json.loads((OUT/'evidence/test-results.json').read_text(encoding='utf-8'));modules=json.loads((OUT/'evidence/module-tests.json').read_text(encoding='utf-8'));maps=json.loads((OUT/'evidence/map-test.json').read_text(encoding='utf-8'))
revision=json.loads((OUT/'evidence/revision-002-checks.json').read_text(encoding='utf-8'))
result=dict(stage='D5',status='PASS_WITH_EXTERNAL_LIMITATION',pages=len(pages),features=len(functions),requirements=len(trace),anchors_match=all(f'id="{p["page_id"].lower()}"' in html for p in pages),core_browser_checks=len(core['checks']),module_browser_checks=len(modules['checks']),core_status=core['status'],module_status=modules['status'],runtime_errors=core['errors']+modules['errors'],approved_hash_checks=hash_checks,map_status=maps['status'],map_limit='高德外部加载失败，默认示意图已验证；真实路线未验证',html_sha256=hashlib.sha256((ROOT/'prototypes/design-preview/index.html').read_bytes()).hexdigest(),approval='D5未登记批准；待用户明确确认',source_boundary='只有docs/design及prototypes/design-preview设计成果；没有正式源码/API/数据库/部署写入')
result.update(visual_revision='002',revision_browser_checks=len(revision['checks']),revision_status=revision['status'])
assert revision['status']=='PASS'
assert result['anchors_match'] and core['status']=='PASS' and modules['status']=='PASS' and not result['runtime_errors'] and all(x['result'] for x in hash_checks)
assert not list((ROOT/'prototypes/design-preview').rglob('amap-config.js')), '不允许交付目录遗留地图凭证配置'
assert not (ROOT/'prototypes/design-preview/runtime-src/node_modules').exists(), '构建依赖应隔离到临时缓存，不封存到设计基线'
(OUT/'self-check-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
text=f'''# D5 自检与交付说明

状态：原型自检通过，保留外部地图加载限制；待用户确认D5，未进入D6或正式开发。日期：2026-10-13。

完成26个独立页面入口，47个功能与57项需求可追踪。按用户反馈修订002采用顶部横向导航＋下方内容；全站标题无解释副文案，演示控制收进小入口。交能推演按用户指定上条件/下结果布局。独立HTML内嵌真实LobeHub/antd/React运行时，可双击打开；可切换浅色/深色和H5。

浏览器核心检查{len(core['checks'])}项、其他模块检查{len(modules['checks'])}项通过，JavaScript运行错误为0。覆盖全部页面打开、派单全批冲突、司机本人执行与凭证必填、退回补充、核验后总览同步、只读权限、查询恢复、AI回业务页、主题、多尺寸，以及补能/能源/规划/费用更正/资产/置换/质量/预警/账号/参数。布局精简专项检查见[revision-002-checks.json](evidence/revision-002-checks.json)。详细证据见[evidence/test-results.json](evidence/test-results.json)、[module-tests.json](evidence/module-tests.json)。

已实际查看全部页面截图联系表、交能推演明暗主题与司机手机详情，修复深色导航及控件可读性、手机空态、固定导航被toast遮挡、来源过期禁提交、缺测断线、参数待核实禁启用等问题。D0—D4已批准文件哈希全部一致。

## 外部与真实性边界

高德JSAPI本轮加载失败，未确定原因；不能因官方资源HTTP200或存在Key就称地图成功。已验证错误提示和业务示意图降级，详见[地图检查](evidence/map-test.json)。坐标、节点和线路均为模拟；没有真实道路可行性、实时车辆或设备联动。凭证仅通过文件选择进入浏览器内存，不在HTML或localStorage，不封存进设计基线。DeepSeek未读取未连接，对话为模拟。

原型只证明界面和模拟流程可审阅，不证明生产权限、后端事务、性能、RPO/RTO、预测精度、优化收益或数据接入可用。P-001—P-020仍按D3事实待核实；真实服务验收留后续开发。界面、假设、来源和限制在原型中可见。

## 本次交付

- [独立HTML](../../../prototypes/design-preview/index.html)与隔离源文件、组件版本记录；HTML可单文件分享，不需传构建依赖。
- [原型导航](navigation.md)、[演示路径](walkthrough.md)。
- [功能映射](feature-coverage.csv)、[需求映射](requirement-coverage.csv)、[完整自检结果](self-check-results.json)。

请确认D5原型后进入D6评审与冻结准备。依据product-design-stage“用户明确批准后才能登记审批”，本轮不代替用户批准，不自动开发。
'''
(OUT/'self-check.md').write_text(text,encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
