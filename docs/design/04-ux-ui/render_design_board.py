"""Render a static D4 layout review board, not an interactive D5 prototype."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
OUT=Path(__file__).resolve().parent
im=Image.new('RGB',(1600,1280),'#F6F7F9'); d=ImageDraw.Draw(im)
fonts={n:ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',n) for n in [12,13,14,15,16,18,20,22,24,30]}
def txt(x,y,s,n=14,c='#20242C'):d.text((x,y),s,font=fonts[n],fill=c)
def box(x,y,w,h,fill='#FFFFFF',outline='#E2E5EA',r=8):d.rounded_rectangle((x,y,x+w,y+h),radius=r,fill=fill,outline=outline,width=1)
def line(points,color='#E2E5EA',width=1):d.line(points,fill=color,width=width)
def btn(x,y,w,label,primary=False):
    box(x,y,w,36,'#B42336' if primary else '#FFFFFF','#B42336' if primary else '#7B8798',6)
    tw=d.textbbox((0,0),label,font=fonts[14])[2];txt(x+(w-tw)/2,y+7,label,14,'#FFFFFF' if primary else '#20242C')
txt(32,24,'交能融合智能体平台 · D4 版式审阅',30)
txt(32,70,'静态设计示意｜界面结构、密度与视觉方向待确认；全部对象及线路为示意，不代表真实运行数据。',16,'#525B6A')
txt(32,118,'管理端 / 交能推演',20)
txt(1238,118,'司机 H5 / 当前任务',20)

# Desktop specimen, scaled review composition.
box(32,158,1168,900,r=12)
box(33,159,184,898,'#FFFFFF','#E2E5EA',12)
txt(48,178,'交能融合',20,'#B42336');txt(48,209,'智能体平台',13,'#606A79')
nav=[('运营总览',False),('运输调度',False),('运输订单',False),('交能推演',True),('运输任务',False),('运力管理',False),('补能与能源',False),('运行保障',False),('规划决策',False),('经营管理',False),('系统管理',False)]
yy=260
for label,active in nav:
    if active:box(42,yy-4,164,37,'#FFF1F2','#FFF1F2',6)
    txt(58 if label in ['运输订单','交能推演','运输任务','运力管理'] else 48,yy,label,15,'#B42336' if active else '#525B6A')
    yy+=44
line([(217,159),(217,1057)])
txt(237,177,'交能推演',22);txt(884,180,'智能助手',14,'#B42336');txt(1010,180,'管理员 · 演示',14,'#525B6A')
line([(217,218),(1198,218)])
txt(237,236,'运输调度 / 交能推演',13,'#606A79')
txt(237,267,'示例运输订单',18)
box(391,266,75,26,'#F0F2F5','#F0F2F5',4);txt(401,269,'条件测算',12,'#525B6A')
txt(237,298,'上方运输与补能条件 · 下方结果工作区',13,'#525B6A');txt(1032,270,'历史版本',13,'#525B6A')

box(237,334,943,234);txt(253,346,'运输与补能条件',18)
txt(933,350,'来源 / 版本可核对',13,'#606A79')
for x,label,value in [(253,'订单来源','已确认订单 · 示例'),(483,'装货位置','核验实际装货点'),(713,'卸货位置','核验实际卸货点'),(943,'要求完成时间','引用订单时间窗')]:
    txt(x,382,label,13,'#525B6A');box(x,404,212,36,'#FFFFFF','#7B8798',6);txt(x+10,412,value,12,'#525B6A')
for x,label,value in [(253,'候选运力范围','授权车辆及司机'),(483,'场站与能源边界','引用有效版本'),(713,'初始 SOC 情景','引用车辆值 / 显式覆盖')]:
    txt(x,453,label,13,'#525B6A');box(x,475,212,36,'#FFFFFF','#7B8798',6);txt(x+10,483,value,12,'#525B6A')
txt(253,532,'已引用订单货物、运量及装卸时窗；修改条件后须重新推演。',12,'#606A79')
txt(943,457,'当前：已展示示例结果',12,'#606A79')
btn(943,490,212,'调整条件重算',False)

box(237,584,544,430,'#FFFFFF');box(238,585,542,279,'#F0F2F5','#F0F2F5',8)
txt(253,599,'路径与补能节点',16)
txt(253,626,'示意连线，非实际路网规划',12,'#606A79')
for pts in [[(260,697),(448,657),(757,720)],[(261,807),(491,717),(759,784)],[(344,858),(434,719),(670,656)]]:line(pts,'#DFE3E9',6)
route=[(296,778),(403,727),(552,759),(719,690)]
for a,b in zip(route,route[1:]):
    import math
    dist=math.dist(a,b)
    for start in range(0,int(dist),12):
        end=min(start+7,dist)
        line([(a[0]+(b[0]-a[0])*start/dist,a[1]+(b[1]-a[1])*start/dist),(a[0]+(b[0]-a[0])*end/dist,a[1]+(b[1]-a[1])*end/dist)],'#245DA8',3)
for (x,y),label,shape in [(route[0],'装货点','square'),(route[1],'补能站','circle'),(route[-1],'卸货点','square')]:
    if shape=='circle':d.ellipse((x-7,y-7,x+7,y+7),fill='#18704A',outline='#FFFFFF',width=2)
    else:d.rectangle((x-7,y-7,x+7,y+7),fill='#245DA8',outline='#FFFFFF',width=2)
    txt(x-22,y+14,label,12)
txt(253,834,'□ 装卸点    ● 补能站    ┄ 选中方案计划线',12,'#525B6A')
txt(253,881,'运输与补能时序',16)
txt(253,918,'计划段',12,'#606A79');line([(320,927),(755,927)],'#E2E5EA',1)
for x,w,fill,label in [(320,108,'#DFEAF8','装货'),(440,108,'#DDEFE6','补能'),(560,182,'#DFEAF8','卸货 / 返程')]:
    box(x,914,w,27,fill,fill,4);txt(x+8,918,label,12)
txt(253,966,'实际 / 核验值：执行后按来源反馈，当前不填假实际值',12,'#606A79')

box(797,584,383,430);txt(813,600,'候选方案',18)
txt(813,631,'选择方案后，左图与时序同步更新',13,'#525B6A')
for x,label,selected in [(813,'示例方案 A',True),(995,'示例方案 B',False)]:
    box(x,666,169,125,'#FFFFFF','#245DA8' if selected else '#E2E5EA',6)
    txt(x+12,678,label,16);txt(x+12,711,'预计费用 / 预计等待',12,'#525B6A')
    txt(x+12,741,'范围与条件可查看',12,'#606A79')
    txt(x+12,766,'当前选择' if selected else '查看方案',12,'#245DA8')
txt(813,811,'选中方案详情',16)
txt(813,844,'时效、电量安全、资源约束逐项核对',13,'#525B6A')
txt(813,875,'装卸 → 运输 → 补能 → 返程',13,'#525B6A')
txt(813,906,'费用范围 / 缺项 / 来源与版本',13,'#606A79')
txt(813,937,'展开方案对比',13,'#245DA8')
btn(813,966,351,'核对并确认方案',True)

# H5 specimen, 320px-wide reading area.
box(1238,158,330,750,'#FFFFFF','#C9CFD7',22)
txt(1256,181,'我的任务',22);txt(1500,186,'演示',13,'#606A79')
txt(1256,226,'待接收   执行中   待核验   历史',13,'#525B6A')
line([(1329,256),(1379,256)],'#B42336',3)
box(1254,276,298,214)
txt(1270,292,'示例任务 · 多车次短倒',18)
box(1270,325,67,25,'#DFEAF8','#DFEAF8',4);txt(1280,328,'执行中',12,'#245DA8')
txt(1270,371,'装货点 → 卸货点',16)
txt(1270,407,'当前车辆 / 计划时间',14,'#525B6A')
txt(1270,447,'任务计划量       已核验交付量',13,'#525B6A')
txt(1256,514,'当前车次',18)
box(1254,550,298,149,'#F6F7F9')
txt(1270,565,'装货 → 运输 → 卸货',15)
txt(1270,605,'报告量与核验量分别记录',14,'#525B6A')
txt(1270,646,'补录须确认实际发生时间',13,'#606A79')
txt(1256,722,'异常反馈',14,'#245DA8');txt(1433,722,'补能安排',14,'#245DA8')
btn(1254,770,298,'反馈当前车次',True)
line([(1239,830),(1567,830)])
txt(1275,855,'任务',16,'#B42336');txt(1385,855,'补能',16,'#525B6A');txt(1490,855,'我的',16,'#525B6A')

txt(32,1090,'统一表达',20)
txt(32,1129,'计划 / 预计',16,'#245DA8');txt(207,1129,'执行 / 实际',16,'#20242C');txt(382,1129,'核验 / 确认',16,'#18704A');txt(557,1129,'未知 / 待核实',16,'#8A5300')
txt(32,1177,'交能推演采用辽粮上下布局；详情、车次、记录、版本仍在所属工作区内。',16,'#525B6A')
txt(32,1213,'本图仅用于 D4 版式确认；可点击的全部页面及状态将在 D5 制作并验证。',14,'#606A79')
im.save(OUT/'design-board.png')
print('Saved static D4 design-board.png (1600x1280)')
