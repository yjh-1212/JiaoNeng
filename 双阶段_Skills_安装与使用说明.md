# 产品设计 / 产品开发 双阶段 Skills（V2.0）

## 文件
1. `01-product-design-skills.zip`：D0-D6 产品设计包，含完整原始设计 Skills、PM Skills、详细 PRD 适配和设计冻结流程。
2. `02-product-development-skills.zip`：E0-E5 产品开发包，含前端、地图、GSAP、Playwright，以及新加入的 Node.js/SQLite 后端系列 Skills。**不含部署**。

## 推荐安装（同一个已有项目）
1. 分别解压这两个包（不要直接把整个 ZIP 当 Skill 文件夹）。
2. 在设计包解压目录执行 `python install.py --project "D:\你的项目" --with-agents-rule`。
3. 在开发包解压目录执行相同命令；自动跳过共享同名 Skills，避免覆盖。
4. 到项目根目录，先运行 `python .agents/skills/product-design-stage/scripts/design_stage.py init`，使用 Codex 完成 D0-D6，**用户逐节点批准**，最后 `freeze --version V1.0` 和 `verify`。
5. 冻结成果完整后，在项目根目录运行 `python .agents/skills/product-development-stage/scripts/development_stage.py verify-baseline`，取得用户明确授权再 `init` / `authorize`。按 E0-E5 开发和验收。

## 推荐 Codex 提示语
- 设计：`调用 product-design-stage，只执行 D0-D6，读取项目可研/需规与现有资料，完善全部模块 PRD、页面规格和独立高保真 HTML 原型。每节点先自检，等待我批准；不得修改正式源码。`
- 开发：`我已确认设计基线并授权开始第二阶段。调用 product-development-stage，先运行 verify-baseline，然后按 E0-E5 逐模块真实开发。后端使用 Node+SQLite，遵循 backend-development，Playwright 打开浏览器完成验收；禁止自动部署。`

## 安装安全性与限制
- 安装器**只新增未存在的 Skills 与 workflow**。如果你之前已安装旧 `product-design-stage`，它会跳过而不是覆盖；需要手动对比升级，不要以为自动已更新。
- 仅校验文件哈希、阶段文档结构和显式记录；业务真实性、UI 美观、测试结果和审批凭据需要你人工评审。
- 开发阶段可独立安装，但必须读取第一阶段生成的冻结设计成果才能正式启动。
- 任何插件引用的未打包可选依赖（如 workshop-facilitation）会由阶段控制器中的兜底规范处理，不假装它已经安装。
- 用户提供的多阶段混合 Skill 已拆成只读参考 + 阶段限定入口，避免越界。
- 第三方来源与许可详见各包的 `THIRD_PARTY.md`。
