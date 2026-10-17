<!-- PRODUCT-TWO-PHASE:BEGIN -->
## AI 项目双阶段执行协议（设计/开发严格隔离）
1. 默认阶段为**产品设计**：读取 `.agents/skills/product-design-stage/SKILL.md`，不得修改正式源码、数据库、接口和部署配置；原型只放 `prototypes/design-preview/`。
2. 设计阶段 D0-D6 输出需求分析、流程/菜单、详细 PRD、UI 设计、交互原型、验收标准。每个节点都需用户明确确认；冻结后建立 `docs/design/07-baseline/design-baseline.json`。
3. **只有用户明确发出开始开发指令，且冻结设计基线校验通过**，才允许切换到开发阶段。使用 `.agents/skills/product-development-stage/SKILL.md`，运行 `development_stage.py authorize` 登记实际批准依据。冻结文件本身的 `development_authorized:false` 不是授权；绝不自行改成 true。
4. 开发阶段以设计基线为唯一业务设计依据，按 E0-E5 完成技术规划、Node/SQLite 后端、前端、联调、Playwright 浏览器验收；不得绕过前端/API/数据库真实联动。
5. 设计变更必须先登记 CR 并取得确认；不得直接更改冻结 PRD/原型。非真实数据须明确标注样例、模拟或待核实。
6. 两阶段 Skill 可以共享少量 UI/测试专业技能，但均须遵守当前阶段的写入边界。
7. 本项目**暂不配置部署交付阶段**；不自动创建 Render、Docker、CI/CD 发布任务或生产发布。
<!-- PRODUCT-TWO-PHASE:END -->

