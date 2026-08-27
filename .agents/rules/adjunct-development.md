# 附属物（Adjunct）与玩法开发规则

## 核心原则：世界地块优先（Block-First），禁止随意开辟 `?level=xxx`

1. **内容必须落在世界的 Block 里**：
   - 附属物（Adjunct）及玩法原型必须作为**独立地块**（`client/core/src/blocks/<name>.block.json`）开发，或放置在世界/中枢/画廊的具体坐标地块中。
   - **禁止为每一个新玩法/测试单独新增 `?level=<name>` 页面路由与专属关卡分支**。随意开辟 `?level=xxx` 会绕过世界的地块流式加载（Streaming）、LOD、跨地块联动与传送机制，导致与虚拟世界主干架构产生严重漂移。

2. **测试与验证方式**：
   - 单元/场景测试：直接将 Block 数据注入世界（`engine.injectBlock` 或通过统一的 World/SceneProvider 装载），在连续世界坐标系中进行仿真与断言。
   - 本地可视化验证：地块挂载在世界中（如通过传送门中枢 `worldHubScene`、画廊 `gallery` 或默认世界坐标），玩家在统一世界中行走、交互与触发。

3. **数据格式规范**：
   - 地块数据必须为标准 5 槽 Block Raw：`[elevation, status, adjuncts, gameSettingId, gameFlag]`。
   - 触发器联动使用块相对寻址（`adj_~_~_{type}_{idx}`），确保地块可随意放置到任意坐标而机关不失效。
