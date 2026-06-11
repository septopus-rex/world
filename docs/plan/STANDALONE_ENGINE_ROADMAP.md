# 独立创作引擎开发路线图（Standalone Engine Roadmap）

> **状态**：链剥离已完成 ✅（2026-06，5 路审计确认）。本文档驱动**后续开发**。
> **定位**：`engine/src`（TS ECS 引擎）+ `client/desktop`（无链 PWA）为唯一运行时;**链是可选的发布插件,不是主线**。
> **历史**：链剥离的决策与实施过程见文末「附录 A · 链剥离记录」。原全链方案见 `chain/docs/ONCHAIN_ROADMAP.md`(已随链归档)。

---

## 0. 现状（已达成）

链剥离已经是**架构事实 + 出厂事实**,而非设想:

- `client/desktop` 纯 3D PWA,替代旧 `app/`。依赖只有 react/react-dom/three,构建产物零 `@solana`/anchor/web3(实测 `npm run build` + grep 验证)。
- `app/`、`chain/`(含合约 + 钱包装配)已移出 git 追踪,封存在磁盘;`deploy/` 瘦身为无链客户端启动器,链上栈归档到 `chain/deploy/`;链相关文档归档到 `chain/docs/`。
- 零钱包 / validator / RPC / IPFS / 网络即可 build + run。

**引擎里已经成形的解耦接缝**(后续各 Phase 直接复用):

| 接缝 | 文件 | 现状 |
|---|---|---|
| 读数据 | `engine/src/core/services/DataSource.ts`（`IDataSource`） | 接口;`DesktopLoader` 实现为本地 mock |
| 本地草稿 | `engine/src/core/services/DraftStore.ts` | **IndexedDB**(write-behind 缓存,P1 已完成) |
| SPP 序列化 | `engine/src/core/protocol/CollapseCodec.ts` | STD ↔ SPP 二进制 |
| 触发器执行 | `engine/src/core/systems/TriggerSystem.ts` | 引擎内执行,`contract` 动作分支未做 |
| 上链发布（可选） | `engine/src/core/services/IChainPublisher.ts` | 纯接口,`Engine.publisher?` 声明但从不消费 |

---

## 1. 目标架构：本地优先,链可选

```
                 ┌──────────────────────────────────────────┐
                 │  Engine (engine/src)  World·ECS·Render·    │
                 │  EditSystem·TriggerSystem·CollapseCodec    │
                 └───────────────┬──────────────────────────┘
                                 │ 仅依赖接口
     ┌───────────────┬──────────┼───────────┬────────────────┐
     ▼               ▼          ▼           ▼                ▼
 IDataSource   IResourceResolver  IActuator   DraftStore     IChainPublisher
  (读区块)       (贴图/模型 URL)  (trigger)  (IDB 持久化)   (可选上链·P4)
     │               │          │           │                │
 Local/Mock      OSS/IPFS    LocalActuator  IndexedDB       (空,默认不装)
  (默认)          (P3)        (P2)          (P1)            └ 可选插件
```

切换由依赖注入决定,引擎核心不写散落的 `if(chain)`。**纯模式 = 默认装配,链 = 日后可选叠加。**

---

## 2. Phase 总览

| Phase | 目标 | 关键产物 | 状态 |
|---|---|---|---|
| **P1** | **本地优先持久化 + 导出** | `DraftStore`(IndexedDB)、`ExportService`、JSON round-trip | **已完成**(2026-06;草稿覆盖在 BlockSystem 层,独立 LocalDataSource 暂不需要) |
| **P2** | Trigger 本地 actuator | `IActuator` + `LocalActuator`,trigger `contract` 分支 | **主体已完成**(2026-06;`contract` 分支留待 P4) |
| **P3** | 资源走 OSS / IPFS | `IResourceResolver` + OSS/IPFS 后端 | 待开始 |
| **P4** | **可选**链插件 | `SolanaPublisher implements IChainPublisher`,选中 block 发布 | 待开始（可选/最后） |
| **P5** | 引擎收敛 + 双构建 | 消除双引擎(纳入 `specs/phase0-engine-consolidation.md`)、纯/含链两个打包目标 | 待开始 |

> P4（链）刻意排在最后且明确「可选」——呼应审计结论:链现在是 design seam,不是主线。

---

## 3. P1 · 本地优先持久化 + 导出（详细设计）

### 3.1 存储分工

| 数据 | 存储 | 理由 |
|---|---|---|
| `spp_player_state`、UI 偏好等**小而热**状态 | **localStorage** | 启动同步读、移动频繁写,进 IDB 是徒增异步复杂度 |
| block / world 草稿、导入模型/贴图等**内容 + 资产** | **IndexedDB** | 容量(GB 级)、异步不卡渲染、原生存 Blob/ArrayBuffer(SPP 二进制/模型直接塞)、可建索引 |

`DraftStorage` 现用 localStorage(~5MB、同步、只能字符串),对累积大量编辑 block + 资产的创作工具会撑爆且卡 rAF。换 IndexedDB。

### 3.2 DraftStore over `idb`（对齐 qr 范式）

qr 每个 client 都用 `idb` + `src/utils/db.js`,直接照搬范式。

```
DB: "septopus"  (version 1)
├── store "drafts"   keyPath: "blockKey" (`${worldId}:${bx}_${by}`)   index: byWorld(worldId), byTime(timestamp)
│      value: BlockDraft { version, timestamp, worldId, blockKey, raw }
├── store "assets"   keyPath: "id"        // 导入的模型/贴图,value: Blob/ArrayBuffer + meta
└── store "worlds"   keyPath: "worldId"   // world 级元信息
```

### 3.3 同步读 vs 异步 IDB —— write-behind 内存缓存（关键）

`BlockSystem` / `EditSystem` 现在**同步**读草稿(localStorage 同步),而 IndexedDB 是**异步**的。直接换会把 block 加载路径变异步,牵连一片。解法:

1. **启动 hydrate**:进 world 时一次性 `await` 把该 world 的所有草稿读进内存 `Map<blockKey, BlockDraft>`。
2. **同步读**:引擎热路径仍从 Map 同步取(不卡 rAF)。
3. **write-behind**:编辑写入先更 Map、再异步落 IDB(失败重试/标脏)。

```
EditSystem.save ──→ Map(内存,同步源)──异步落盘──→ IndexedDB(DraftStore)
                       ↑ 启动 hydrate ────────────────┘
BlockSystem.load ──同步──→ Map 命中则用草稿,否则 mock
```

### 3.4 LocalDataSource

把 `DesktopLoader.fetchBlock` 升级:**先查草稿 Map,无则 `fetchMockBlock`**。这就接通了「本地编辑可持久化、刷新仍在」。

### 3.5 ExportService（导出 / 导入）

导出不是支线:它和「上链发布」是**同一条序列化缝**(`CollapseCodec`),build 一次两用。

| 格式 | 内容 | 用途 | 优先级 |
|---|---|---|---|
| `.json` | `BlockDraft[]` + world 元信息 | 备份 / 分享 / 可 diff | **先做** |
| SPP 二进制 | `CollapseCodec.encode(raw)` | 紧凑 / 规范 / 即上链格式 | 随 P4 |
| `.septworld`(zip) | 草稿 + 引用的模型/贴图(assets store) | 完整可移植 | 后置 |

配套 `import`,实现 round-trip:分享世界、恢复备份、把草稿喂给 P4 发布。

### 3.6 验收

- 无钱包下编辑一个 block、刷新页面,改动仍在(IDB 持久化生效)。
- 导出 `.json` → 清缓存 → 导入 → 世界还原。
- 编辑大量 block 时渲染不卡(写入走 write-behind,不阻塞 rAF)。

---

## 4. P2 · Trigger 本地 actuator —— 主体已完成（2026-06）

让 trigger 保留「指向链上合约」的指针,但纯模式用本地逻辑模拟。

**已落地**（与背包 P0–P2 同批,规格见 `specs/inventory-local-first.md`）:
- `IActuator { execute(action, ctx) }` + `LocalActuator`(`core/services/Actuator.ts`),
  经 `WorldDeps.actuator` / `EngineServices.actuator` 注入,缺省本地实现。
- `TriggerSystem` 不再自持动作执行逻辑——`_fireNode` 统一走 `world.actuator.execute`。
- 动作面: `adjunct`(moveZ/rotateY) · `flag` · `bag`(give/take,仅 Game 模式) · `system`(log)。
- 配套: b5 item adjunct + `ItemSystem` 原子拾取/丢弃、`ItemRegistry` seed 推导、
  JSONLogic `inventory.*` 条件、背包 IndexedDB 持久化(DraftStore meta 通道)。

**待 P4**: `'contract'` 动作类型(携带 `contractId`)→ `ChainActuator`(包 publisher)。
接链时只换注入的 actuator,trigger 内容零改。

---

## 5. P3 · 资源走 OSS / IPFS

- `IResourceResolver { texture(id), module(id) }` → 返回可 fetch 的 URL;渲染层不变。
- 后端可换:`OSSResourceResolver`(位置寻址、可变,纯本地/开发期)/ `IPFSResourceResolver`(CID 内容寻址,上链存证,对接 `IChainPublisher.uploadData`)。
- IPFS 在「按 URL 取不可变 blob」这个用途上等价于 OSS,故抽象成同一接口。

---

## 6. P4（可选）链插件 + P5 引擎收敛

**P4 · 可选链插件**:`SolanaPublisher implements IChainPublisher`(`uploadData` 走 IPFS pin,`commitBlock` 走合约 `update_block`)。接通「提交选中 block」:`DraftStore → CollapseCodec.encode → publisher.uploadData → commitBlock → 删草稿`。纯模式 `publisher=null` 时该入口隐藏。链实现住在(已封存的)`app/`/`chain/` 或独立适配器,**不进 `client/desktop`**。

**P5 · 引擎收敛 + 双构建**:消除「新 TS / 旧 JS」双引擎,以 `engine/src` 为唯一运行时,清掉 `engine/src/septopus/` 死 mock 树(审计指出的 ~49 个 inert .js,`git grep solana` 的来源);详见 `specs/phase0-engine-consolidation.md`。产出纯/含链两个打包目标(纯包 tree-shake 掉链依赖)。

---

## 7. 风险 / 待定

1. **CollapseCodec 一致性**:本地 STD ↔ SPP 二进制必须同一套编解码;需补 round-trip 单测(导出/导入、上链/拉回不丢信息)作为 P1/P4 前置。
2. **LocalActuator 模拟边界**:链上合约可能含经济/所有权状态,本地只能近似;需明确「可模拟 / 仅占位」并在 UI 标 `simulated`。
3. **资源 ID 双向映射**:`RESOURCE_ID ↔ OSS key ↔ IPFS CID` 需一张 `resources.manifest.json` 作单一事实源。
4. **草稿与链数据冲突**(P4 后):同一 block 本地有草稿、链上也更新,以谁为准?默认「本地草稿优先 + 标脏」,上链成功才清。

---

## 附录 A · 链剥离记录（历史）

> 本节是已完成里程碑的存档,不再驱动开发。

**结论**(2026-06 审计):git 追踪的出货项目在依赖、源码、产物、构建/运行四轴均无硬链耦合;对抗审计也未找到残留硬耦合。残留均不承重:`IChainPublisher` 可选接口(声明未消费)、`engine/src/septopus/` 死 mock 树(无真 `@solana` 导入、无被追踪的 importer)、`app/`+`chain/` 封存在磁盘(untracked)、文档/注释提及。

**做了什么**:
1. 发现引擎本就把链收敛在 `IDataSource`(读)/`IChainPublisher`(写)/`DraftStorage`(本地)三接口之后,编辑链路纯内存——「纯 3D 创作」是对既有结构的打包,不是重写。
2. 建 `client/desktop`(无链 PWA,`DesktopLoader` = `SandboxLoader` 去链版)替代 `app/`。
3. `git rm --cached app chain` + `.gitignore`,封存链代码到磁盘。
4. `deploy/` 瘦身为客户端启动器,链上栈归档 `chain/deploy/`;链文档归档 `chain/docs/`。

---

## 附录 B · 关键文件索引

| 角色 | 文件 |
|---|---|
| 读接缝 | `engine/src/core/services/DataSource.ts` |
| 本地草稿(P1 已改 IDB) | `engine/src/core/services/DraftStore.ts` + `IdbDraftBackend.ts` |
| SPP 编解码 | `engine/src/core/protocol/CollapseCodec.ts` |
| 触发器执行(P2) | `engine/src/core/systems/TriggerSystem.ts` |
| 编辑流水线 | `engine/src/core/systems/EditSystem.ts` |
| 客户端数据装载器 | `client/desktop/src/lib/DesktopLoader.ts` |
| 上链发布接口(P4 可选) | `engine/src/core/services/IChainPublisher.ts` |
| 引擎收敛规格(P5) | `docs/plan/specs/phase0-engine-consolidation.md` |
| 新增(P1) | `services/DraftStore.ts`(idb)、`services/LocalDataSource.ts`、`services/ExportService.ts`、`client/desktop/src/lib/db.ts` |
| 新增(P2/P3/P4) | `services/IActuator.ts`、`services/IResourceResolver.ts`、`services/SolanaPublisher.ts` |
