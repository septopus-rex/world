# Septopus World

Solana 链上 3D 虚拟世界引擎,**已从链强耦合架构剥离为独立的 3D 创作引擎**:新的 TypeScript ECS 引擎(`engine/src`)+ 无链 PWA 客户端(`client/desktop`)为唯一运行时;**链是可选的发布插件,默认不装**。

> 链剥离已完成(2026-06,审计确认),详见 `docs/plan/STANDALONE_ENGINE_ROADMAP.md`。
> `chain/`(Solana 合约)与旧 `app/`(链耦合前端)已移出 git 追踪、封存在磁盘;旧 JS 引擎已归档到 `engine/backup/`。

## 项目结构

```
world/
├── engine/                  # 3D 引擎(TypeScript ECS,核心)
│   ├── src/
│   │   ├── Engine.ts            # 引擎外观:new Engine(container, services) + bootWorld/start/step/injectBlock
│   │   ├── core/
│   │   │   ├── World.ts             # ECS 世界 + 系统编排 + 主循环
│   │   │   ├── systems/             # 16 个系统(Physics/Trigger/Block/Edit/VisualSync/Minimap…)
│   │   │   ├── components/          # ECS 组件
│   │   │   ├── services/            # DataSource·DraftStorage·AdjunctSandbox·AdjunctLoader·AdjunctRegistry·IChainPublisher
│   │   │   ├── protocol/            # CollapseCodec(SPP 二进制编解码)
│   │   │   ├── factories/ utils/(Coords) types/
│   │   ├── render/              # Three.js 渲染层(RenderEngine/MeshFactory/RenderPipeline)
│   │   └── plugins/adjunct/     # adjunct 定义(box/wall/cone/sphere/water/light/trigger + _shared)
│   ├── tests/               # vitest:unit / systems / integration / scenarios(见 tests/README.md)
│   └── backup/              # 旧 JS 引擎(septopus/,已归档;gitignore)
├── client/desktop/          # React + Vite PWA — 无链 3D 客户端(替代旧 app/)
├── deploy/                  # dev.sh / build.sh:启动/构建 client/desktop
├── docs/                    # 架构与计划文档
├── chain/                   # Solana 合约(已移出 git 追踪,本地存档;含 chain/docs、chain/deploy)
└── app/                     # 旧链耦合前端(已移出 git 追踪,本地存档)
```

## 常用命令

```bash
# 客户端(桌面 3D PWA)—— 用 npm
cd client/desktop && npm install && npm run dev    # http://127.0.0.1:7777
cd client/desktop && npm run build                 # 静态 PWA → dist/
bash deploy/dev.sh                                 # 等价启动器
bash deploy/build.sh                               # 等价构建

# 引擎 —— 用 yarn(有 yarn.lock)
cd engine && yarn install
cd engine && yarn test                             # vitest(watch)
cd engine && yarn test:run                         # 跑一次
cd engine && yarn build                            # tsc
```

## 核心概念

- **Block**: 世界的基本单元,4096×4096 网格,每个 Block 16×16 米。
- **Adjunct**: 附属物,附着在 Block 上的 3D 对象(墙/水/灯光/触发器等)。
- **ECS**: `World` 持有 registry + 系统;状态即数据(便于 headless 测试)。
- **数据流**: `IDataSource`(本地 mock/草稿,可换链) → Raw → STD(`CollapseCodec`)→ RenderData → Three.js。
- **坐标系**: Septopus(X东 Y北 Z上) ↔ Engine/Three(X右 Y上 Z前,北 = −Z);转换见 `core/utils/Coords.ts`。
- **链可选**: 通过 `IChainPublisher` 注入发布;纯模式零 `@solana` 依赖。

## 关键入口

- `engine/src/Engine.ts` — 引擎外观;`bootWorld()`、`start()`(rAF 循环)、`step(dt)`(确定性逐帧)、`injectBlock()`、`setEditMode()`。渲染器可经 `services.renderer` 注入(测试用 NullRenderEngine)。
- `engine/src/core/World.ts` — ECS 世界、系统编排、主循环。
- `client/desktop/src/lib/DesktopLoader.ts` — 客户端数据装载器(实现 `IDataSource`,目前喂本地 mock)。
- `client/desktop/src/App.tsx` — React 前端入口。

## 编辑 / Adjunct

- 编辑经 `EditSystem`(select / move / set / delete / undo)→ `DraftStorage`(localStorage 草稿)。
- adjunct 按链 type-id 注册于 `core/services/AdjunctRegistry.ts`:`a1` wall · `a2` box · `a3` light · `a6` cone · `a7` ball(sphere) · `b8` trigger。**module(a4)/stop(b4) 尚未迁移**。
- 动态/链上加载的 adjunct 代码经 `AdjunctSandbox`(Web Worker 沙箱 + 静态 `validateCode` 过滤)+ `AdjunctLoader`(已迁 TS,**暂未接入运行时**,随链相关功能启用)。

## 测试

- `engine/tests/`(vitest,node 环境):`unit/`(CollapseCodec、Coords、adjunct transforms/sandbox/registry)、`integration/`(headless-boot)、`systems/`·`scenarios/`(部分 `todo`)。**务必读 `engine/tests/README.md` 的"局限性"**(无 GPU/浏览器、确定性、scenarios 待补等)。
- 真 WebGL / 像素 / 输入(L4)用 Playwright,在 `client/desktop/e2e/`(未搭)。

## 文档索引

- `docs/plan/STANDALONE_ENGINE_ROADMAP.md` — 开发路线图(链剥离记录 + 后续 P1–P5)。
- `docs/plan/specs/phase0-engine-consolidation.md` — 引擎收敛规格。
- `docs/architecture/{overview,ecs,coordinate,pipeline,performance}.md`、`docs/systems/*.md`、`docs/features/spp*.md`(弦粒子 SPP)。
- `chain/docs/`(已随链归档)— 链上存储 / 全链 roadmap。

## 开发注意事项

- 引擎是 **TypeScript ECS**(`engine/src`)。旧 JS 引擎(VBW、`Septo.launch`、`world.js`、`framework.js`)**已归档到 `engine/backup/`,不要再以它为准**。
- 链已解耦:`engine` 与 `client/desktop` 均无 `@solana` 依赖。合约在 `chain/`(本地存档,Solana Devnet:`4uJZCdH5RjJrSiRxVSkYqy3MUWBCFR3BxLXUcoKQkEr2`)。
- 包管理器分包:**engine 用 yarn,client/desktop 用 npm**。
- 仿真循环:`World` 构造不自动启动;生产端调 `Engine.start()`(rAF),测试用 `Engine.step(dt)` 确定性步进。
- **提交策略:仅在用户明确要求时提交 git,不主动提交。**
