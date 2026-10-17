export const provinces=['甘肃省','陕西省','宁夏回族自治区','青海省','四川省','内蒙古自治区','新疆维吾尔自治区'];
export const gansuCities=['兰州市','嘉峪关市','金昌市','白银市','天水市','武威市','张掖市','平凉市','酒泉市','庆阳市','定西市','陇南市','临夏回族自治州','甘南藏族自治州'];
export const regionalPresets=[
 {id:'qy-xa',origin:'甘肃省庆阳市',destination:'陕西省西安市',cargo:'煤炭',quantity:600,label:'庆阳 → 西安'},
 {id:'lz-xn',origin:'甘肃省兰州市',destination:'青海省西宁市',cargo:'钢材',quantity:300,label:'兰州 → 西宁'},
 {id:'pl-lz',origin:'甘肃省平凉市',destination:'甘肃省兰州市',cargo:'煤炭',quantity:900,label:'平凉 → 兰州'},
 {id:'ww-zy',origin:'甘肃省武威市',destination:'甘肃省张掖市',cargo:'水泥',quantity:450,label:'武威 → 张掖'},
 {id:'zw-wh',origin:'宁夏回族自治区中卫市',destination:'内蒙古自治区乌海市',cargo:'煤炭',quantity:600,label:'中卫 → 乌海'},
 {id:'ts-bj',origin:'甘肃省天水市',destination:'陕西省宝鸡市',cargo:'砂石骨料',quantity:300,label:'天水 → 宝鸡'},
 {id:'ln-gy',origin:'甘肃省陇南市',destination:'四川省广元市',cargo:'矿石',quantity:450,label:'陇南 → 广元'},
 {id:'jq-hm',origin:'甘肃省酒泉市',destination:'新疆维吾尔自治区哈密市',cargo:'钢材',quantity:300,label:'酒泉 → 哈密'},
];
export const publicSources=[
 {id:'GS-REGION',title:'甘肃及相邻省区概况',publisher:'甘肃一带一路网',url:'https://ydyl.gansu.gov.cn/enggsydyl/gsmp/',published_at:null,fetched_at:'2026-10-17',facts:'甘肃与陕西、四川、青海、新疆、内蒙古、宁夏相邻。'},
 {id:'NX-G110',title:'宁夏首条新能源重卡换电干线贯通',publisher:'宁夏回族自治区交通运输厅',url:'https://jtt.nx.gov.cn/xwzx/jtyw/202503/t20250321_4862598_wap.html',published_at:'2025-03-21',fetched_at:'2026-10-17',facts:'中卫至乌海G110约350公里沿线建成5座重卡充换电站；公开报道不代表当前可用工位。'},
 {id:'GS-YAX',title:'甘肃交通运输信息第9期：音凹峡重卡换电站投用',publisher:'甘肃省交通运输厅',url:'https://jtys.gansu.gov.cn/jtys/c106399/202511/174242344/files/f3d36d4df0ba4ea6accebfad05da24f5.pdf',published_at:'2025',fetched_at:'2026-10-17',facts:'G215音凹峡服务区重卡换电站，报道介绍约5分钟换电；当前适配与营业情况待核验。'},
 {id:'SX-BAOJI',title:'宝鸡首座重卡充换电站投用',publisher:'陕西省人民政府',url:'https://www.shaanxi.gov.cn/xw/ldx/ds/202408/t20240812_2433311_wap.html',published_at:'2024-08-12',fetched_at:'2026-10-17',facts:'报道披露重卡充换电设施建设及作业能力，不能作为当前预约或排队依据。'},
 {id:'CATL-TX',title:'天行重型商用车系列电池发布',publisher:'宁德时代',url:'https://www.catl.com/news/8162.html',published_at:'2024-11-25',fetched_at:'2026-10-17',facts:'公开产品包含600kWh超充版和1000kWh长续航版；实际车辆与工况应单独核验。'},
 {id:'AMAP-ROAD',title:'路径规划2.0',publisher:'高德开放平台',url:'https://lbs.amap.com/api/webservice/guide/api/newroute',published_at:null,fetched_at:'2026-10-17',facts:'支持道路几何及推荐、高速优先、少收费等策略；通用驾车结果不是货车通行许可。'},
];
export const publicFacilities=[
 {id:'PUB-ZW',name:'中卫工业园区充换电站',city:'宁夏中卫',source_id:'NX-G110',mode:'充换电'},
 {id:'PUB-ZN',name:'中宁石空充换电站',city:'宁夏中宁',source_id:'NX-G110',mode:'充换电'},
 {id:'PUB-QTX',name:'青铜峡工业园区充换电站',city:'宁夏青铜峡',source_id:'NX-G110',mode:'充换电'},
 {id:'PUB-DWK',name:'大武口德美斯物流园充换电站',city:'宁夏石嘴山',source_id:'NX-G110',mode:'充换电'},
 {id:'PUB-HN',name:'惠农G110国道1号重卡充换电站',city:'宁夏石嘴山',source_id:'NX-G110',mode:'充换电'},
 {id:'PUB-YAX',name:'音凹峡服务区重卡换电站',city:'甘肃酒泉',source_id:'GS-YAX',mode:'换电'},
];
