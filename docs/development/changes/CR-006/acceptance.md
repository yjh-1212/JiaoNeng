# CR-006验收

已移除历史版本入口、保留后台数据，按辽粮Planning.vue形成上方条件卡＋下方地图/方案工作区。桌面横排、窄屏纵排，候选方案与来源、确认流程保留。CR-007用户追加道路路线与去掉示意指令后，覆盖原示意切换约定，联合验收证据见CR-007/browser-check.json及solve-road-result.png。

根因排查：高德web_map/get_tile曾返回INVALID_USER_DOMAIN/10006，画布/complete事件存在并不代表底图成功。应用Referrer-Policy:same-origin导致跨站无来源。调整为strict-origin-when-cross-origin后，瓦片接口info=OK，截图明确显示道路地名；保留nosniff与登录校验。

已按用户指令继续本地实施，无部署。地图Skill额外遥测请求被自动审批拒绝，未发送，未绕过。
