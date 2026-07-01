# Mock IPFS — content-addressed block content

> **状态**：三期均已落地（2026-07）。把**块内容**（世界由什么 adjunct 组成、放哪）
> 收敛到和资源同一套 mock IPFS（CAS）上，和 `mock-ipfs-resource.md` **同构**。
> 资源早已收敛（CID → IpfsRouter → Provider）；本 spec 让块内容也内容寻址（`BlockCas`）。
>
> - **第一期 干净数据**：canonical block raw（定死 5 槽 + 确定性序列化 + 校验），内容寻址的前提。
> - **第二期 CAS 块管线**：`BlockCas` put/get + `world.blockCas` + import 边界校验。
> - **第三期 发布 + 异步 seam**：`publish()` 显式内容寻址；流式热路径保持同步（见下方取舍）。

## 0. 问题

块内容的「种子层」是**代码**（`scenes/*.ts` + `BlockMocks` + `buildParkourBlock` 等），
不是可寻址的数据条目。加一个场景 = 写一个 `SceneProvider` 并接进 `DesktopLoader` 重新构建，
谈不上规模化生产。目标：**块也变成 CAS 里一条按 CID 取的 authored 内容**，链路与资源统一。

但在把块塞进 CAS 之前，有个硬前提：**CID = hash(bytes)，所以同一个逻辑块必须确定性地产出同一份字节**。
现在的块数据做不到——存在 arity 漂移、包裹层不一致、分组顺序非确定。**先把这些清干净**（第一期）。

---

## 第一期 · 干净数据（本次落地）

### 1.1 现状脏点（实测）

| # | 脏点 | 位置 | 为什么阻断内容寻址 |
|---|---|---|---|
| D1 | **Arity 漂移** | `BlockMocks.MockBlockData` 产 4 元 `[elev,status,adjuncts,anim]`；`serializeBlockToRaw` 产 5 元（带 `game`）。`BlockSystem` 用 `raw[4] ?? 0` 兼容 | 同一块 authored 版 vs round-trip 版数组长度不同 → 字节不同 → **CID 不同** |
| D2 | **包裹层不一致** | `MockBlockData` 返回 `{x,y,raw}`；`SceneProvider.block()` 返回裸 `raw` | 「块」有两种形状，哈希对象不唯一 |
| D3 | **adjunct 分组顺序非确定** | `serializeBlockToRaw` 用 `Map<typeId,instances>`，遍历序 = 实体迭代序 | 同一块两次序列化字节可能不同 → **CID 漂移**，dedup 失效 |
| D4 | **无 schema / 无校验** | 块 raw、per-adjunct raw 全是位置数组 + 可选尾槽（box 7 或 8 元） | 坏数据无处拦截；CAS 边界需要「进得去的都是规范形」 |
| D5 | **authored / derived 边界靠约定** | ground plate（`ground_*`）自动加、序列化时 skip；SPP 展开产物只留 b6 源行 | canonical「authored 块」必须**只含 authored 内容**，否则派生件被烘进 CID |

### 1.2 Canonical Block Raw（定死）

**固定 5 槽，永远等长**（`game` 槽恒在，缺省 `0`）：

```
BlockRaw = [
  elevation : number,            // [0] 块基准高度
  status    : number,            // [1] 块状态（1 = active）
  adjuncts  : AdjunctGroup[],    // [2] [[typeId, instances[]], ...]，authored only
  animations: AnimationClip[],   // [3] 块级共享动画库
  game      : number,            // [4] game-zone 门控位（0 = 不可玩），恒在
]

AdjunctGroup = [typeId: number, instances: InstanceRaw[]]
```

- **不再有 4 元块**。`normalizeBlockRaw` 把任何 3~5 元输入补齐成规范 5 槽（`status→1`、`anim→[]`、`game→0`）。
- **块 = 裸 `BlockRaw`**，不带 `{x,y}` 包裹。坐标是「块在哪」的寻址键（外部），不进块内容本身，因此**不进 CID**（同一份内容可复用到多个坐标）。
- **只含 authored 内容**：`ground_*` 派生地板、`derivedFrom` 的 SPP 展开产物**不进** canonical raw（沿用 `serializeBlockToRaw` 既有 skip 规则，提升为契约）。
- **per-adjunct InstanceRaw 的规范形由各 adjunct 的 `attribute.serialize/deserialize` 定义**（已是既有契约、已稳定）。本期只定死**块信封**；per-adjunct 逐槽规范化沿用 adjunct 定义，不在本期展开。

### 1.3 确定性序列化（CID 的前提）

`canonicalBlockBytes(raw): Uint8Array` —— 同一逻辑块 → 同一份字节：

1. `normalizeBlockRaw(raw)` 先规范到 5 槽。
2. **adjunct 分组按 `typeId` 升序排**（消除 D3 的 Map 遍历序）。
3. **组内 instance 顺序保持 authored 序**（instance 下标可能被 trigger/动画按 index 引用，**不可重排**）——
   因此产出端（`serializeBlockToRaw`）必须以**稳定序**产 instance（按 `adjunctId`/创建序，而非实体迭代序），本期一并修。
4. 规范 JSON（无空白、键序稳定；数值走 `Number` 归一，避免 `-0`/浮点表述差异）→ UTF-8 bytes。
5. bytes 即 CAS 的 ingest 输入：`ipfs.put(bytes) → CID`。

> 采用**规范 JSON**（非 CollapseCodec 二进制）作第一期的 canonical 字节：块 raw 是可变长嵌套结构，
> JSON 规范化最简单、可读、可测；CollapseCodec（L2 二进制）是 SPP cell 层的编码，与块信封是两件事，
> 不在本期强绑。二进制块编码若日后需要（省流量），是**换 `canonicalBlockBytes` 的实现**、CID 契约不变。

### 1.4 校验

`validateBlockRaw(raw)` —— 在 CAS 边界与 import 边界拦坏数据，`throw ProtocolError`（`code: 'BLOCK_RAW'`）：

- 是数组、长度 ≤ 5；`elevation/status/game` 为 number 或缺省；`adjuncts` 每项是 `[number, array]`；`animations` 是数组。
- 宽进严出：`normalizeBlockRaw` 负责补缺省（宽），`validateBlockRaw` 负责拒结构性错误（严）。

### 1.5 落点（第一期代码）

- `core/protocol/BlockRaw.ts`（新）——`BlockRaw` 类型、`CANONICAL_BLOCK_ARITY = 5`、
  `normalizeBlockRaw`、`validateBlockRaw`、`canonicalBlockBytes`。纯函数、core 内、无 Three/无 IO。
- `core/utils/BlockSerializer.ts`——`serializeBlockToRaw` 产出走 `normalizeBlockRaw` + **稳定 instance 序**（修 D3）。
- `core/mocks/BlockMocks.ts`——`MockBlockData` 产 5 槽 canonical（补 `game=0`，修 D1）；返回形状对齐（修 D2，或在 `sceneBlock` 统一解包）。
- 测试：normalize 幂等 + arity 补齐；validate 拒坏结构；`canonicalBytes` 确定性（同逻辑块 → 同字节 → 同 CID）；round-trip 稳定（authored → normalize → serialize → normalize 不漂）。

---

## 第二期 · CAS 块管线（已落地）

块内容 ↔ CID 的桥，和资源共用同一个 `IpfsRouter`：

- `core/services/BlockCas.ts`：`put(raw)` = `canonicalBlockBytes` → `ipfs.put` → **CID**（本地 authored 内容，宽 producing）；
  `get(cid)` = `ipfs.get`（验哈希）→ `JSON.parse` → `validateBlockRaw`（严）→ `normalizeBlockRaw`（读回不可信存储）。
  写宽读严的非对称，与资源侧 `IpfsRouter.get` 校验哈希同构。
- `world.blockCas`（对称 `world.ipfs`）+ `Engine.blockCas`；`MemoryCasProvider` 是块与资源共用的 mock 后端。
- 「世界 = 坐标 → blockId(CID)」是一层轻索引（`LocalDataSource` 的 manifest），与块内容分离；**坐标不进 CID**（同内容可复用多坐标 → 同 CID）。
- `ExportService.importWorld` 在 import 边界 `validateBlockRaw`（拒坏结构、跳过而非污染存储）。

## 第三期 · 发布到 CAS + 异步 seam（已落地）

**关键取舍：流式热路径保持同步**。`LocalDataSource.blockAt/view` 同步服务 canonical raw（种子 + draft overlay），
**不**在热路径上把每个代码生成的 mock 种子 eager 塞进 CAS —— 那样对 mock 无运行时收益（种子就在手边），
且异步化会把逐块 `injectBlock` 推迟成 boot 后一次性爆发（stall）。内容寻址是**显式、离热路径**的操作：

- `LocalDataSource.publish(x,y)`：把当前有效块（含本地编辑）ingest 进 CAS → CID，记进 manifest。
  = 第三期「发布块到 CAS」primitive，客户端经 `DesktopLoader.publishBlock(x,y)` 暴露。
- `DraftStore` overlay 原样不动（本地编辑仍是 working copy，publish 才是进 CAS 的显式一步）。
- **seam 已 async-ready**：`IDataSource.view()` 仍是 `Promise`、`BlockCas.get` 已就位；
  当种子本身变成**真·CAS 内容**（非代码生成器）时，`blockAt` 改为 `await blockCas.get(cid)` 即可，届时热路径才真正异步。
- 编辑器 UI 的 module 资源选择器 +「发布」按钮属 React 层，非本数据收敛范围（primitive 已备）。

> 为什么不 eager routing：mock 种子是程序生成、已在内存，塞进 CAS 再取回是纯开销；真正的价值在
> **publish（把 authored/edited 内容内容寻址、可分享）** 和**未来种子即 CAS 内容**。二者都已就绪。

## 迁移路径

`MemoryCasProvider`（现在，块与资源共用） ──swap──▶ 本地 gateway ──swap──▶ 真 IPFS / OSS。
与资源侧同一后端、同一 CID 契约，一次换 provider 两者都迁。

## 与 F 系列的关系（正交）

本 spec 解决**块内容怎么存、怎么产、怎么规模化**（生产效率）；**不**让世界变「活」。
产出的块会不会动（NPC/定时/战斗）取决于块 raw 能否表达那些行为 —— 那是 F 系列（表达力）。两条线分开推。
