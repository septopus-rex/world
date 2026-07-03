# Mock IPFS — content-addressed resource layer

> **状态**：**已落地（2026-06）**——落点：`engine/src/core/services/ipfs/{IpfsRouter,Cid,MemoryCasProvider}.ts` + `ResourceManager.resolveUrl` + 单测 `tests/unit/ipfs.test.ts`。落地 `PLAYABLE_CHECKLIST` 的 **G5 资源管线** 第一步、
> 呼应 ROADMAP **P3 `IResourceResolver`**。把现在写死的 `DEMO_MODELS` / `DEMO_TEXTURE`
> 路径换成**内容寻址（CID）** + 一个可插拔的 **Router → Provider** 取数链。
> 设计与真 IPFS 同构，mock = 一个本地 Provider，日后换真 IPFS/OSS 是**换后端**而非改调用点。

## 0. 问题

资源（模型 / 贴图 / 音频 / 头像）现在经 `IDataSource.module()/texture()` 返回
`{ type, format, raw }`，其中 `raw` 是写死的路径（`/assets/checker.png`、`/assets/fox.glb`）。
后果：内容绑死在 demo 路径上、不可寻址、出不了本机、也喂不动程序化内容（iNFT/SPP）。

目标：**所有资源数据都通过新的 IPFS 层按 CID 获取**，去掉路径硬编码。

## 1. 架构（与真 IPFS 同构）

```
resource id ──module()/texture()──▶ { type, format, raw = CID }
CID ──▶ IpfsRouter ──▶ Provider ──▶ bytes ──▶ (blob: URL) ──▶ Three loader
                         ├─ MemoryCasProvider   (现在 · 可写 · 无后端)
                         ├─ 本地 gateway         (要测网络才加)
                         └─ 真 IPFS / OSS        (P3 · 换/加即可)
```

| 层 | 真 IPFS 对应 | 落点 |
|---|---|---|
| **CID** | content address | `module()/texture()` 返回的 `raw` |
| **Router** | content routing（DHT / delegated） | `engine/src/core/services/ipfs/IpfsRouter.ts` |
| **Provider** | peer / gateway / pinning | `MemoryCasProvider`（首发）；后续 gateway/真 IPFS |
| **bytes** | Bitswap / gateway 取回 | provider 返回的 `Uint8Array` → blob URL |

## 2. CID 方案（载荷性约束，先定死）

- **CID = 内容哈希**：`'bafy' + base32(sha256(bytes))`（小写，无填充）。
  - 选 `bafy` 前缀以**复用** `ResourceManager.resolveUrl` 既有的 CID 分支，并贴近真 CIDv1。
- **全 provider 同一套**：同一内容在任何 provider 上算出**同一个 CID**。否则换 provider 即路由错位 → 全量重新编址（唯一的真成本）。
- **可校验**：`hash(bytes) === cid`，Router 取回后校验（白送防篡改，真 IPFS 的保证）。

## 3. 契约（就两件事：路由 + 读写）

### Provider
```ts
interface IpfsProvider {
  readonly name: string;
  get(cid: string): Promise<Uint8Array | null>;   // null = miss → Router 落到下一个
  put?(bytes: Uint8Array): Promise<string>;        // 可选「能力」：可写 provider 才实现，返回 cid
}
```
- **read 通用**（所有 provider 实现 `get`）；**write 是能力**（只读 gateway 不实现 `put`）。
- `get` 能返回 **miss（null）**，于是不必单独加 `has(cid)` —— 仍只有 2 个 op。

### Router
```ts
class IpfsRouter {
  constructor(providers: IpfsProvider[]);
  get(cid): Promise<Uint8Array>;        // 按序问 provider，命中即返 + 校验 hash；都没有 → throw
  put(bytes): Promise<string>;          // 写到第一个可写 provider，返回 cid
  ingest(bytes): Promise<string>;       // = put（语义别名：把内容收进 CAS）
  toObjectUrl(cid): Promise<string>;    // get → Blob → createObjectURL（缓存）；无 DOM 时退回 data: URL
  addProvider(p): void;                 // 注册更多 provider（gateway / 真 IPFS）
}
```
- **路由 = 内容路由（谁有）**：按序 `get`、命中即返。**不是**按 CID 前缀挑 provider（那会把「位置」编进「身份」）。
- Router 保持**薄**：有序 provider + 逐个试 + 校验。**不做** DHT / 策略 / bitswap / pin / list / gc（YAGNI）。

## 4. 集成

- **World** 拥有路由器：`this.ipfs = new IpfsRouter([new MemoryCasProvider()])`（默认带一个可写 CAS，引擎自足）；
  构造 `ResourceManager` 时传 `ipfsRouter: this.ipfs`。暴露 `world.ipfs`。
- **ResourceManager.resolveUrl** 变 `async`：
  - `http/data/blob/file:` → 原样
  - **是 CID** → `ipfsRouter` 在 → `await router.toObjectUrl(cid)`；否则退 `ipfsGateway + cid`
  - 否则 → 当相对路径（dev/local；保持现有测试不破）
  - `getModel/getTexture/getAudioUrl` 三处 `await resolveUrl(...)`。
- **Engine** 暴露 `get ipfs(): IpfsRouter | null`（= `world.ipfs`），供宿主 `put`/注册 provider。

## 5. 去硬编码（客户端）

- `demoScene.ts`：`DEMO_MODELS`（id→路径）废弃，改为**资产清单** `DEMO_ASSETS`
  `[{ id, type, format, src, repeat? }]` —— 这是 **CAS 的播种源**（= `ipfs add ./file`），是内容、不是解析路径。
- `DesktopLoader`：**懒播种** —— `module()/texture()` 首次被问到某 id 时，`fetch(src) → engine.ipfs.put(bytes) → cid`，
  缓存进 `catalog: id → { type, format, raw: cid, repeat? }`，返回 cid 记录。
  - `module()` 服务 `type ∈ {module, avatar, audio}`；`texture()` 服务 `type == texture`。
  - 资源字节自此**只经 Router/Provider 取**，`module()/texture()` 不再吐路径。
  - `moduleCatalog`（编辑器模型选择器）从 `DEMO_ASSETS` 派生（`type==module`）。

## 6. 迁移路径

`MemoryCasProvider`（现在） ──swap──▶ 本地 gateway provider ──swap──▶ 真 IPFS / OSS（P3）。
三者共用同一 **CID 方案** + 同一 **get 契约** + 同一 **Router**；加/换后端 = `addProvider` / 调换次序。
A↔B↔真 IPFS 互换是**配置级**——前提是第 2、3 节两条不变式守住。

## 7. 层边界

- IPFS 子系统住 `engine/src/core/services/ipfs/`，**不 import three**（合规：core 层）。
- 仅用浏览器/标准 API：`crypto.subtle`（CID）、`Blob`/`URL.createObjectURL`（`toObjectUrl`，无 DOM 退 data: URL）。
  与 `DraftStore` 用 IndexedDB 同类——核心服务可用浏览器 API，禁的只是 three。

## 8. 测试

- **headless 单测**（`engine/tests/unit/ipfs.test.ts`）：
  CID 确定性（同字节同 cid）、put→get round-trip、校验（篡改字节被拒）、Router 落空→下一个 provider、
  `put` 仅可写 provider、`get` miss 语义。纯逻辑、无浏览器。
- **e2e（回归即验证）**：现有 `boot-and-render` / `avatar` 跑通 = demo 模型/贴图/头像**经 IPFS 层**渲染成功
  （avatar.glb、checker.png 等本来就在这些用例里）。无需新 e2e 即可证明「去硬编码 + 走 IPFS」端到端成立。
- 注：`toObjectUrl` 用 `createObjectURL`（浏览器），headless 不测像素；字节/CID 逻辑全 headless 覆盖。

## 9. 明确不做（YAGNI）

`pin/unpin`、`list/enumerate`、`delete/gc`、`stat`、流式、DHT/bitswap/真路由策略。要了就是在造迷你 IPFS。
