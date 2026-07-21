# AGENTS.md — 所有 AI 编码代理的最低守则

> 适用于在本仓库工作的任何 AI 工具（Gemini/Antigravity、Cursor、Codex 等）。
> Claude Code 另读 `CLAUDE.md`（更全，两者不冲突）。
> 逐条槽位/格式语义的**唯一权威是 `protocol/cn|en/`**——本文只是红线摘要，细节以协议为准。

## 这个仓库

Septopus World：独立 3D 虚拟世界引擎（TypeScript ECS，`engine/src`）+ 无链 PWA 客户端（`client/`，core 共享核 + desktop 7777 + mobile 7778）。文档三层：`protocol/`（规范，中英双语）→ `docs/`（参考实现）→ `docs/plan/`（过程记录）。

## 红线（违反 = 全部返工）

1. **内容 = 数据。** 世界内容只能是纯 JSON：关卡 `client/core/src/levels/*.level.json`、单块 `blocks/*.block.json`、风格包 `stylepacks/*.stylepack.json`。**禁止把内容写成 TS**，更**禁止为了让某份内容渲染出来而修改 `engine/src`**——引擎能力不够时，正确路径是提协议变更（见第 3 条），不是给引擎开侧门。

2. **资源引用走目录或 CID，内容里禁止宿主相对路径。** 贴图/模型/音频文件放 `client/desktop/public/assets/`（这是 mock IPFS 的进料目录，没问题），但内容 JSON 里**引用**它们只有两种合法形态：
   - 注册进 `client/core/src/assets/demo.manifest.json` 拿**数字 id**（首选，先例：terran 风格包 36/37/38）；
   - 内容寻址 `<cid>.<ext>`（或 a4/e1 明确允许的 `http(s):` 等带 scheme 的 URL）。
   `"/assets/xxx.png"` 这类字符串写进 block/level/stylepack = 换个宿主（链上启动、第二引擎）就断，门禁会红。

3. **槽位语义以协议为准，改格式先改协议。** 常见误区：标准 7 槽类型（a1 墙等）的 `raw[3]` 是**颜色/调色板索引（number）**，不是贴图；贴图只在 **a2 box 的 `raw[7]`**（数字 id 或 `<cid>.<ext>`）和 **a4 module 的 resourceId 三形态**。协议文件动了必须 **cn/en 双语同步**。

4. **门禁必须绿：`cd engine && yarn test:run`。** 其中两份测试专门看着上面几条：
   - `tests/unit/content-conformance.test.ts` — 校验你写的每一份内容 JSON（槽位类型、资源形态、trigger 动作集、manifest 引用完整性）；
   - `tests/unit/resource-contract.test.ts` — 钉死引擎资源缝的语义。
   **测试红了改你的内容，不许改测试或引擎来迁就内容。**

5. **Three.js 只允许在 `engine/src/render/` 内 import。** 验证：`grep -r "from 'three'" engine/src/core engine/src/plugins` 必须无输出。

6. **e2e 夹具块不许重写。** `demo.block.json`、`sandbox.block.json` 等被 `client/desktop/e2e/` 的断言依赖（例如 demo 块 spp 小屋的 `spp_hut` trigger）。展示新内容 = **加新文件**（新 block/level/stylepack），不是改造现有夹具。

7. **不要 commit / push**（提交由用户显式发起）；**不要把输出写到仓库外的私有目录**（如自家工具的 brain/ 缓存路径）——产物留在仓库约定位置或临时目录。

8. **原生浏览器对话框（alert/confirm/prompt、Basic-Auth 弹窗）禁止出现在用户路径上**，一律用页内组件（`pages.confirm()`）。

## 包管理器与验证命令

- 引擎用 **yarn**：`cd engine && yarn test:run`（vitest 全套）· `yarn build`（tsc）
- 客户端用 **npm**：`npm --prefix client/desktop run build` · e2e `cd client/desktop && npm run test:e2e`
- 开发起服：`bash deploy/dev.sh`（desktop 7777 + mobile 7778 + 各服务）
