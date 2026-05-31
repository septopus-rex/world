# Septopus 全链实施方案 (On-Chain Roadmap)

> 目标：让 **逻辑（合约）+ 状态（所有权/指针）+ 内容（3D 数据）+ 代码（引擎/框架/adjunct）** 全部内容寻址，链上只存指针，无任何中心服务器是必须的。
>
> 本文是落地路线图，描述当前基线、目标架构、分阶段任务与未决问题。架构原理见 [docs/architecture/onchain-storage.md §9](docs/architecture/onchain-storage.md)，动态 adjunct 设计见 [docs/features/dynamic-adjunct.md](docs/features/dynamic-adjunct.md)。

---

## 0. 当前现状总览

### 0.1 三层完成度矩阵

| 层 | 组件 | 状态 | 说明 |
|----|------|------|------|
| **合约** | mint/update/sell/buy/withdraw block | ✅ 已实现 | 地块全生命周期 |
| | resource (add/approve/ban/recover) | 🟡 部分 | 缺 update_resource、计数器未自增、权限检查缺失 |
| | adjunct_world（世界附件配置） | 🟡 部分 | 存元数据，无权限校验 |
| | **AdjunctType（动态 adjunct 注册）** | ❌ 缺失 | 全链关键，待新增 |
| | **EngineRegistry（引擎 CID 注册）** | ❌ 缺失 | 全链关键，待新增 |
| **引擎** | 新 TS 引擎（ECS, `engine/src/`） | ✅ 主线 | `Engine.ts` + `core/World.ts`，app 实际使用 |
| | `IDataSource` 数据源抽象 | ✅ 已实现 | world/view/module/texture |
| | `IChainPublisher` 发布接口 | 🟡 仅接口 | `core/services/IChainPublisher.ts` 定义存在，无实现 |
| | Raw→STD→3D 管线 | 🟡 部分 | 多数 adjunct 完整，water/sample 为空壳 |
| | **动态加载 / 沙箱（新引擎）** | ❌ 缺失 | 旧引擎有原型可移植（见 0.2） |
| **客户端** | 读链（block/world info） | ✅ 已实现 | `app/src/lib/contract.js` |
| | 写链（mint/update/sell/buy/withdraw） | ✅ 已 wire | 同上，actions 对象 |
| | IPFS 读写（get/add/isCID） | ✅ 已实现 | `app/src/lib/ipfs.js` |
| | **编辑→序列化→IPFS→update 闭环** | ❌ 缺失 | 发布管道核心缺口 |
| | 引擎加载方式 | 🟡 源码 import | `import Engine from '../../engine/src/Engine'`，非链上加载 |

### 0.2 两套引擎的现实（必须先决策）

引擎目录里存在两套代码：

| | 新 TS 引擎 `engine/src/` | 旧 JS 引擎 `engine/src/septopus/` |
|---|---|---|
| 架构 | ECS（ECSRegistry/SystemManager/World） | VBW 框架 + 静态 adjunct |
| 入口 | `Engine.ts` | `app.js` (`Septo.launch`) |
| app 是否使用 | ✅ 是 | ❌ 否 |
| 文档对应 | `docs/architecture/ecs.md` 等 | `CLAUDE.md` 描述的结构 |
| 动态加载/沙箱 | ❌ 无 | ✅ **有原型**：`security/adjunct-loader.js`、`adjunct-sandbox.js`、`sandbox-worker.js`、`core/adjunct-manager.js` |

> **决策 D0（已定）**：以**新 TS 引擎为唯一主线**。把旧引擎 `security/` 下的沙箱/loader 原型**迁移/重写**到新引擎的 `core/services/` 体系，迁移完成后**废弃整个旧引擎** `engine/src/septopus/`。详见 [Phase 0](#phase-0--引擎收敛与迁移)。

---

## 1. 目标架构（分层引导）

```
Layer 0 · Genesis Bootstrap  (<5KB HTML+JS, 唯一需托管)
   读链 EngineRegistry → loader_cid
Layer 1 · Loader             (IPFS, CID 在链上)
   读链 framework_cid → 拉取 Framework
Layer 2 · Framework/Engine   (IPFS, CID 在链上, 可分片)
   ECS 引擎全部模块
Layer 3 · World Data         (IPFS, CID 在 BlockData.data)
   SPP 二进制 / adjunct 数据 / trigger
Layer 4 · Custom Adjunct     (IPFS, CID 在 AdjunctType)
   第三方 adjunct 代码, 按 short 键按需加载
        ↑ 每层 CID 锚定 Solana, CID 即 hash 自校验
```

加载方式：**Blob URL + dynamic import()**（非 eval，无需 `unsafe-eval` CSP），长期目标 Service Worker 拦截 `ipfs://`。

---

## 1.5 存储抽象层 (StorageRouter) — 决策 D1（已定）

**不绑定任何单一存储后端**。引入 `StorageRouter` + 可插拔 `StorageAdapter`，让发布管道、引擎加载、adjunct 加载都只依赖统一接口，后端（IPFS / Arweave / 其他）可自由切换或并存。

```typescript
interface StorageAdapter {
  name: string;                            // "ipfs" | "arweave" | ...
  put(data: Uint8Array): Promise<string>;  // 返回 URI（如 ipfs://CID, ar://TXID）
  get(uri: string): Promise<Uint8Array>;
  exists(uri: string): Promise<boolean>;
  canHandle(uri: string): boolean;         // 按 URI scheme 路由
}

interface StorageRouter {
  register(adapter: StorageAdapter): void;
  put(data, opts?: { prefer?: string }): Promise<string>; // 写入首选后端
  get(uri: string): Promise<Uint8Array>;                   // 按 scheme 自动路由读取
}
```

- **写入**：按策略选后端——内容/数据倾向 IPFS（可变、易 pin），引擎/adjunct 代码倾向 Arweave（一次付费永久）。具体策略由调用方 `prefer` 指定。
- **读取**：URI 自带 scheme（`ipfs://` / `ar://`），Router 自动分发到对应 adapter。
- **现状**：`app/src/lib/ipfs.js`（get/add/isCID）可作为首个 `IpfsAdapter` 重构进来；Arweave adapter 新增。
- **校验**：CID 类后端天然自校验（CID 即 hash）；Arweave 需额外存 hash 做完整性校验。

> 这一层是所有"上链"动作的公共底座，应在 Phase 1 与发布管道一起落地。

---

## 1.6 代码与资源的分工 — 决策 D-RES（建议：分离注册，统一存储）

世界里有三类东西，混在一起会让安全模型和治理失焦。建议**链上注册/治理分离，存储层统一**：

| | adjunct 代码 | world 资源（贴图/模型/音频） | world 数据（Block 内容） |
|---|---|---|---|
| 性质 | 可执行逻辑 | 被动素材 | 实例参数 |
| 链上账户 | `AdjunctType`（新增） | `ResourceData`（**已存在**） | `BlockData.data`（已存在） |
| 安全需求 | 沙箱 + AI 审计 + GitHub 溯源 | 仅格式/大小校验 | 所有权校验 |
| 治理 | 版本/举报/ban | 违规走 complain 机制 | owner 自治 |
| 复用粒度 | 按 short 键全局 | 按 URI 引用 | 按坐标 |
| 存储后端 | StorageRouter（倾向 Arweave） | StorageRouter（倾向 IPFS） | StorageRouter（倾向 IPFS） |

**为什么分离（而非合并）：**

1. **安全模型根本不同**——代码必须沙箱执行+逻辑审计；资源只是被加载的字节，最多做格式白名单+大小限制。合并会迫使资源走重型审计，或给代码开后门。
2. **合约已分家**——`ResourceData` + `add/approve/ban/recover_resource` 已实现管资源；`AdjunctType` 新增管代码。顺势而为，无需推倒。
3. **治理诉求不同**——恶意代码要能 ban 并阻止加载；违规贴图走既有 `complain` 流程即可。

**如何关联：** adjunct 代码在渲染时**引用**资源，而非内嵌。沙箱 `adjunctAPI.createGLTF(uri)` / `loadTexture(uri)` 接收资源 URI，由引擎主线程经 StorageRouter 拉取（资源不在沙箱内加载，避免沙箱碰网络）。即 **adjunct = 逻辑 + 资源引用**，资源 = 被引用的素材。

> 结论：统一的 StorageRouter 底座 + 分离的链上注册（AdjunctType / ResourceData）与治理。这也回答了"分开还是合并"——**存储合并，注册与治理分离**。

---

## 2. 实施阶段

依赖顺序：Phase 0（引擎收敛）先把运行时统一到新引擎；Phase 1（发布管道 + StorageRouter）是一切的地基——内容上链、引擎上链、adjunct 上链共用同一条 `序列化 → StorageRouter.put → URI → 链上注册` 流程。

### Phase 0 · 引擎收敛与迁移

**目标**：消除双引擎，确立新 TS 引擎为唯一运行时。

| 任务 | 落点 | 状态 |
|------|------|------|
| 确认新 TS 引擎为唯一运行时（app 已用） | `engine/src/Engine.ts` | ✅ 现状 |
| 迁移沙箱原型 → 新引擎 | 旧 `septopus/security/{adjunct-loader,adjunct-sandbox,sandbox-worker}.js`、`core/adjunct-manager.js` → 新 `core/services/` | 🟡 有原型 |
| 评估旧引擎可复用部分（`io/api_*`、raw_std 转换逻辑） | 按需迁移 | ❌ |
| 补全空壳 transform（`adjunct_water`、`adjunct_sample` 的 std_3d） | 新引擎对应 adjunct | ❌ |
| **废弃** `engine/src/septopus/` | 删除/归档 | ❌ |
| 更新 `CLAUDE.md` 引擎结构描述（当前写的是旧引擎） | `CLAUDE.md` | ❌ |

**验收**：仓库内只剩一套引擎；app 功能不回退；CLAUDE.md 与实际结构一致。

> 沙箱原型的迁移是 Phase 3（动态 adjunct）的前置，可在此先把骨架搬过来。

---

### Phase 1 · 发布管道闭环（地基）

**目标**：编辑器产物能完整写到链上并读回渲染。

| 任务 | 落点 | 状态 |
|------|------|------|
| `StorageRouter` + `IpfsAdapter`（§1.5，重构现有 `ipfs.js`） | `engine/src/core/services/` 或 `app/src/lib/` | 🟡 有 IPFS 雏形 |
| 实现 `SolanaPublisher`（`IChainPublisher` 的实现） | `engine/src/core/services/` | 🟡 仅接口 |
| 编辑模式 → 数据序列化（SPP/JSON） | app + engine | 🟡 |
| 序列化产物 → `StorageRouter.put()` → URI | 复用 IpfsAdapter | ✅ 复用 |
| URI → `actions.update_block(uri, x, y, world)` | `contract.js` 已 wire | ✅ 复用 |
| 读回链路：`data` 是 URI → `StorageRouter.get()` → 渲染 | `SandboxLoader.fetchBlock` 已就绪 | ✅ 复用 |
| **编辑缓存层**：改动暂存本地 dirty set，不即时上链 | app 编辑器状态 | ❌ |
| **批量发布**：一次性序列化+上传+签名提交所有 dirty Block | publisher + 钱包 | ❌ |

**编辑→发布模型（决策 D-SIGN，已定）**：编辑期所有改动只写**本地缓存**（dirty set，可配 localStorage 持久化防丢），不逐块签名。点"发布"时统一：批量序列化 → 批量 `StorageRouter.put` → **一次性/批量签名**提交。

> ⚠️ Solana 单交易大小（~1232B）与账户数有限，"一次签名更新多个 Block"需用 **versioned transaction + Address Lookup Table**，或分批打包。大型世界（数千 Block）需分批提交并显示进度——这点在实现时确认上限。

**验收**：编辑器连续改多个 Block（不弹签名）→ 点发布一次签名 → 刷新页面全部从链上+存储还原。

**依赖**：Phase 0 完成；本地 IPFS 节点（`deploy/dev.sh` 已启动 Kubo）。

---

### Phase 2 · 引擎上链（EngineRegistry）

**目标**：引擎 bundle 从 IPFS 加载，CID 钉在链上。

| 任务 | 落点 | 状态 |
|------|------|------|
| 合约新增 `EngineRegistry` PDA（seeds `engine_reg`，单例） | `chain/programs/septopus/src/` | ❌ |
| 合约指令 `update_engine_registry`（authority 校验） | 同上 | ❌ |
| `ArweaveAdapter`（§1.5 第二个 adapter，永久存储） | StorageRouter | ❌ |
| 引擎构建产物 → `StorageRouter.put({prefer:'arweave'})` → URI | 构建脚本 | ❌ |
| **Loader**（Layer 1）：读链 URI → `StorageRouter.get` → Blob URL + dynamic import | 新建 `loader/` | ❌ |
| **Genesis Bootstrap**（Layer 0）：<5KB 引导页 | 新建 | ❌ |
| 完整性校验：`sha256(bundle) == cidToHash(cid)` | Loader 内 | ❌ |

**验收**：清空本地服务器托管的引擎，仅保留 Genesis 引导页，引擎仍能从 IPFS 完整拉起并渲染世界。

**关键风险**：bundle 体积（几百 KB~MB），用 Arweave 永久存储更合适；引导问题（总需第一段代码读链）。

---

### Phase 3 · 动态 Adjunct（AdjunctType + 沙箱）

**目标**：第三方 adjunct 代码上 IPFS，引擎遇未知 short 键按需加载并沙箱执行。

| 任务 | 落点 | 状态 |
|------|------|------|
| 合约 `AdjunctType` PDA（含 `github`/`source_cid`/`ipfs`/`version`/`status`） | `chain/` | ❌ |
| 合约指令 `register/update/deprecate_adjunct_type` + 保留键校验 | `chain/` | ❌ |
| 合约 `report_adjunct` 举报 + 状态机 | `chain/` | ❌ |
| **移植沙箱**：旧引擎 `security/adjunct-{loader,sandbox}.js`、`sandbox-worker.js` → 新引擎 | `engine/src/core/services/` | 🟡 有原型 |
| `DynamicAdjunctLoader`：链上查 CID → IPFS → 校验 → sandbox → 注册 | 新引擎 | ❌ |
| `adjunctAPI` 受限接口（createBox/emitEvent/getParam/引用资源 URI…） | 沙箱 runner | ❌ |
| 资源（texture/glTF）由主线程经 StorageRouter 加载，**不进沙箱**（§1.6） | 新引擎 | ❌ |
| `menu`/`task` 回调隔离策略（menu 主线程，需限制） | 新引擎 | ❌ |
| 加载失败的占位渲染（Fallback Box） | 新引擎 | ❌ |

**验收**：发布一个自定义 adjunct 到 IPFS+链上 → 在世界引用其 short 键 → 引擎自动加载沙箱执行并渲染。

**安全门**：见 Phase 4。

---

### Phase 4 · 安全审计体系

**目标**：公开可审计 + AI 辅助分析 + 链上可信声明的多层防护。

| 任务 | 落点 | 状态 |
|------|------|------|
| 注册强制要求 GitHub 地址 + 源码 CID | 合约 + CLI | ❌ |
| 可复现构建验证：`build(source_cid) hash == bundle_cid` | CI 工具 | ❌ |
| AI 静态分析规则集（纯函数检查/validator 完整性/禁止 API/原型污染） | CI + Claude API | ❌ |
| GitHub Actions：PR → AI 分析 → PASS 才允许链上注册 | `.github/` | ❌ |
| 社区举报 → 治理状态机（Active→Reported→Banned） | 合约（Phase 3 含 report） | ❌ |
| adjunct 详情页：GitHub/安全评分/举报入口 | app 编辑器 | ❌ |

**验收**：恶意 adjunct（空 validator、未声明事件、外部 I/O）在 AI 分析阶段被拒；已注册 adjunct 可被举报并 ban。

---

### Phase 5 · 合约健壮性补强（贯穿）

可与上述阶段并行，修复调研发现的现存缺陷：

| 缺陷 | 落点 | 优先级 |
|------|------|--------|
| `adjunct_world` / `approve_resource` 缺管理员签名校验 | `chain/` | 高（安全） |
| `add_resource` 未调用计数器自增 | `chain/` | 中 |
| 缺 `update_resource`（创建后无法改 ipfs/owner） | `chain/` | 中 |
| 全局 `world_list` 写锁导致所有 mint 串行（去 `mut`） | `chain/` | 中（性能） |
| per-world 计数器写锁（移链下索引或分片） | `chain/` | 低 |
| 缺 `close_block`（租金无法回收） | `chain/` | 低 |
| `mint()` 未收取 `SPW_BLOCK_INIT_PRICE` | `chain/` | 业务决策 |
| `ComplainResource` 核心逻辑被注释 | `chain/` | 低 |

---

### Phase 6 · 链下索引 + 零服务器入口

| 任务 | 状态 |
|------|------|
| 链下索引（Geyser/Helius webhook）：在售块、用户持有、mint 总数 | ❌ |
| Service Worker 拦截 `ipfs://`（替代 Blob URL） | ❌ |
| 零服务器入口：用户侧 IPFS 节点 / 网关 / ENS | ❌ |
| Framework 分片加载（manifest + 按需模块 CID） | ❌ |

---

## 3. 依赖关系图

```
Phase 1 (发布管道) ──┬──> Phase 2 (引擎上链)
                     ├──> Phase 3 (动态 adjunct) ──> Phase 4 (安全审计)
                     │
Phase 5 (合约补强) ──┘ (并行, 但权限校验应在 Phase 3/4 前)
                              │
                              v
                       Phase 6 (索引+零服务器)
```

**最小可演示全链路径**：Phase 1 → Phase 2。完成后即可证明"程序+数据都从链上拉起"。

---

## 4. 决策记录与未决问题

**已定：**

| # | 问题 | 决策 |
|---|------|------|
| D0 | 两套引擎如何收敛 | ✅ 新 TS 引擎为唯一主线，迁移旧沙箱原型后**废弃旧引擎**（Phase 0） |
| D1 | 存储后端选型 | ✅ 不绑定单一后端，`StorageRouter` + 可插拔 adapter（IPFS/Arweave/…），按内容类型选 prefer（§1.5） |
| D-RES | adjunct 代码与资源分开还是合并 | ✅ **存储统一、注册与治理分离**：代码→AdjunctType+沙箱+审计，资源→ResourceData+格式校验，代码引用资源 URI（§1.6） |
| D-SIGN | 编辑发布的签名方式 | ✅ 编辑期改动本地缓存，发布时**批量序列化+上传+一次性/批量签名**（Phase 1） |

**未决（需决策）：**

| # | 问题 | 选项 |
|---|------|------|
| D2 | Genesis 引导页托管在哪 | IPFS 网关 / ENS / 静态 CDN / 二维码 —— 这是唯一的"信任根" |
| D3 | AI 审计是强制门还是建议 | 强制（注册前必过）vs 软门（记录评分，用户自判） |
| D4 | EngineRegistry authority | 单签 / 多签 / DAO 治理 |
| D5 | 引擎分片粒度 | 单 bundle / 按模块 / 按场景需求 |
| D6 | mint 是否收费 | 现状不收 `SPW_BLOCK_INIT_PRICE`，是否启用 |
| D7 | trigger 执行模型 | 动态加载+沙箱 / 内建受限 DSL —— **待定，实际开发中处理** |

---

## 5. 遗漏检查清单（待 review）

写完初稿后自检，以下是可能遗漏、需要你确认是否纳入的点：

已被决策覆盖（保留备查）：

- [x] ~~钱包签名 UX~~ → D-SIGN：编辑缓存 + 批量一次性签名
- [x] ~~Arweave 集成~~ → D1：StorageRouter + ArweaveAdapter
- [x] ~~资源 vs 代码~~ → D-RES：存储统一、注册治理分离
- [x] ~~trigger 脚本~~ → D7：待定，开发中处理

仍需确认：

- [ ] **版本兼容**：引擎升级后，旧 URI 的 Block 数据是否保证向后兼容？SPP 协议版本号机制是否就绪？
- [ ] **内容不可用兜底**：IPFS 未 pin / 网关全挂时的降级策略（多网关回退？Arweave 镜像？）。
- [ ] **批量签名上限**：versioned tx + LUT 一次能更新多少 Block，超限的分批 UX。
- [ ] **Genesis 信任根**：Layer 0 始终是单点，是否接受？或用 ENS+IPFS 缓解（关联 D2）。
- [ ] **沙箱性能**：每个动态 adjunct 一个 Worker，复杂世界几十种 adjunct 的开销？是否需 Worker 池。
- [ ] **测试策略**：localnet 已通，但全链路（链→存储→引擎→渲染）端到端自动化测试缺失。
- [ ] **成本上限**：发布一个完整世界（数千 Block）的链上 rent + 交易费 + 存储费总估算。
- [ ] **多链数据源**：旧引擎 `io/` 有 bitcoin/sui API，新架构是否保留多链能力（关联 Phase 0 迁移评估）。
- [ ] **authority 安全**：恶意引擎 URI 被注册到 EngineRegistry 的防护（关联 D4，这是全链最高风险点）。

---

## 6. 参考文档

- [链上存储架构](docs/architecture/onchain-storage.md) —— PDA 模型、发布管道、全链架构 §9
- [动态 Adjunct 详细设计](docs/features/dynamic-adjunct.md) —— 加载/沙箱/安全审计完整规格
- [附属物系统](docs/systems/adjunct.md) —— adjunct 注册机制、动态 adjunct §5
- [数据管线](docs/architecture/pipeline.md) —— Raw→STD→3D
- [SPP 二进制协议](docs/features/spp-protocol.md) —— 上链内容格式
- [CLAUDE.md](CLAUDE.md) —— 项目结构与核心概念（注：描述的是旧引擎结构）
