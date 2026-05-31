# 链上存储 (On-Chain Storage)

> Septopus World 在 Solana 上的存储模型：每块地的 PDA 模型、租金成本、所有权与交易、发布管道，以及"一切上链"愿景的落地路径。

Septopus World 的核心目标之一是**让世界数据归用户所有、且尽可能上链**。本文描述在 Solana 上如何表达一个 4096×4096（单世界 ~1677 万块地）、并允许扩展到百万级以上规模的世界，以及由此衍生的成本、并发与发布管道设计。

---

## 1. 设计原则

| 原则 | 含义 |
|------|------|
| **每块地即数字资产** | 每块地是一个独立账户，归 mint 它的用户所有，可转让、可交易。 |
| **成本分散到用户** | 账户的 rent 由 mint 者承担，协议本身不为未售出的空间付费。存储成本是 `O(已 mint 块数)`，而非 `O(世界面积)`。 |
| **链上存指针，内容上 IPFS/Arweave** | 链上账户只存所有权、状态、价格和一个内容寻址指针（CID）。真正的 3D 内容（SPP 二进制、adjunct、trigger、动画）放在去中心化存储。 |
| **自研买卖，不依赖市场标准** | 交易逻辑由合约自身的 `sell/buy/withdraw` 指令实现，不绑定 Metaplex/cNFT 市场。 |

---

## 2. 存储模型：Per-Block PDA

每一块**已被 mint** 的地，对应一个独立的 PDA 账户 `BlockData`。

### 2.1 寻址 (Seeds)

```rust
seeds = [ b"b_dt", x.to_le_bytes(), y.to_le_bytes(), world.to_le_bytes() ]
```

- **存在性即所有权起点**：账户存在（`create != 0`）⟺ 该块已被 mint。未 mint 的块不占用任何链上空间。
- **owner 不在 seeds 里**，而是账户内的可变字段。这是为交易服务的关键设计——若把 owner 编进 seeds，每次转手都要关旧账户、开新账户（地址变化）；放成字段后，地块账户**地址恒定**，转手只改 `owner` 字段。

### 2.2 账户结构 `BlockData`

| 字段 | 类型 | 说明 |
|------|------|------|
| `data` | `String` (max 200) | 内容指针，未来存 IPFS/Arweave CID（当前 mint 时初始化为 `"[]"`） |
| `owner` | `String` (max 50) | 持有者公钥的字符串形式 |
| `price` | `u64` | 挂牌售价（lamports），非挂牌时为 0 |
| `create` | `u64` | mint 时的 slot 高度 |
| `update` | `u64` | 最后更新 slot 高度 |
| `status` | `u32` | 状态枚举 `BlockStatus`：`Public=0 / Private=1 / Selling=2 / Banned=3 / Locked=4` |

> 相关空间数据格式见 [地块系统](../systems/block.md) 与 [数据管线](./pipeline.md)。

---

## 3. 为什么是 Per-PDA（而非位图 / 压缩 NFT）

设计阶段评估并否决了两种替代方案：

| 方案 | 否决原因 |
|------|----------|
| **售卖状态位图 (bitmap)** | 单 bit 只能表达"是否售出"，无法承载每块的所有权、价格、内容指针。1677 万块地的位图本身（~2MB/世界）也超出单账户的实际可写范围，且无法分摊成本到用户。 |
| **压缩 NFT (cNFT / Merkle Tree)** | cNFT 的核心优势是"海量铸造 + 市场标准（Metaplex）"，但本项目**自研买卖逻辑**，市场标准优势失效；且 cNFT 的资产数据仍需 off-chain，校验路径反而更复杂。在自研买卖 + 用户自付成本的前提下，Per-PDA 更直接。 |

**结论**：Per-PDA 是与"用户自持资产、成本分散"原则最契合的模型，且其 rent 成本（见 §4）相对 mint 成本可忽略。

---

## 4. 租金成本模型

Solana 账户需缴纳 2 年租金即获豁免（rent-exempt）。计算公式：

```
rent_exempt = (account_bytes + 128) × 3480 lamports/byte/year × 2
```

| 配置 | 账户字节 | rent (SOL) | ≈ USD (SOL@$85) |
|------|----------|------------|------------------|
| **当前 `BlockData`** | 8 + 286 = **294** | ~0.00294 | ~$0.25 |
| **瘦身后**（CID 截短至 ≤64、`owner` 改 `Pubkey(32B)`） | ~136 | ~0.00184 | ~$0.16 |
| **激进瘦身**（CID 存 32B 原始 multihash） | ~100 | ~0.00159 | ~$0.14 |

- 当前 `BlockData::INIT_SPACE` = 286（`data` 204 + `owner` 54 + 三个 u64 24 + u32 4），加 8 字节 discriminator = 294。
- **rent 由 mint 者一次性承担**，不会随时间额外扣费；账户被关闭时可退还（但当前**未实现 close 指令**，见 §7）。

> ⚠️ **mint 费用现状**：`mint()` 当前**只收取 rent + 交易费**，并未收取 `SPW_BLOCK_INIT_PRICE`。该常量值为 `10_000_000` lamports = **0.01 SOL**（源码注释误写为 0.1 SOL），目前未在 mint 流程中扣取。若要按"mint 收费"设计，需在 `mint()` 内补一笔 `system_program::transfer` 到 `SPW_RECIPIENT`。

成本估算的更完整分析见 [系统效率分析](../features/efficiency.md)。

---

## 5. 所有权与交易

交易完全由合约指令驱动，地块账户地址在转手中保持不变（§2.1）。

| 指令 | 作用 | 关键校验 |
|------|------|----------|
| `mint` | 创建地块，`owner = 调用者`，`status = Public`，`price = 0` | 块未被 mint（`create == 0`）、坐标合法 |
| `sell` | 挂牌：设 `price` + `status = Selling` | 调用者为 owner |
| `buy` | 成交：转账 `buyer → owner`，`owner = buyer`，`price = 0`，`status = Public` | **`status == Selling`** / 调用者非 owner / **`expected_price == price`**（防抢跑）/ recipient 等于当前 owner |
| `withdraw` | 撤牌：`price = 0`，`status = Public` | 调用者为 owner |

### 交易安全模型

以下守卫是为关闭所有权盗取与抢跑而设的硬性约束：

1. **`buy` 必须 `status == Selling`** —— 否则未挂牌的块（含刚 mint、price=0 的块）会被任何人以 0 SOL 夺走。
2. **`buy` / `withdraw` 成交后重置 `status = Public`** —— 否则成交后仍停留在 `Selling`(price=0) 状态，会被下一个人继续 0 SOL 夺走。
3. **`buy` 带 `expected_price` 并断言等于链上 `price`** —— 防止卖家在买单落块前抢先抬价、掏空买家钱包（无滑点保护漏洞）。
4. **`recipient` 必须等于当前 owner** —— 确保货款付给真正的卖家。
5. **`is_owner` 解析失败返回 false 而非 panic** —— 避免畸形 owner 字符串导致交易异常中止。

> 客户端调用 `buy` 时**必须传入用户当时看到的价格**作为 `expected_price`，否则会被 `PriceMismatch` 拒绝。

---

## 6. 写入并发 (Write Contention)

Per-PDA 模型天然支持并发——不同坐标的地块是不同账户，互不加锁。但当前 mint 路径存在两处人为的串行化瓶颈：

| 瓶颈 | 现状 | 影响 | 建议 |
|------|------|------|------|
| **全局 `world_list` 写锁** | `MintBlock` 中 `world_list` 标记为 `#[account(mut)]`，但 `mint()` 内只**读取**它做坐标校验 | 单一全局账户被每笔 mint 写锁定，**所有世界的所有 mint 全局串行** | 去掉 `mut`，改为只读约束 |
| **per-world 计数器写锁** | 每次 mint `world_counter.inc()` | 同一世界的并发 mint 在该计数器上串行 | 计数移到链下索引统计；或对计数器分片（sharded counter） |

修复第一项即可让不同世界、不同坐标的 mint 真正并行；第二项视吞吐需求再优化。

---

## 7. 链下索引 (Off-Chain Indexer)

Per-PDA 的代价是**没有廉价的全局视图**：链上无法低成本枚举"所有在售的块""某用户的全部块""世界已 mint 总数"。

- **解决方案**：用链下索引（如 Geyser 插件 / Helius webhook）订阅账户变更，落库后对外提供查询 API。
- **职责边界**：索引只做"读视图加速"，**不是信任源**——所有权与状态的唯一真相仍是链上 PDA。
- mint 总数等统计也应由索引承担，从而支撑 §6 中移除链上全局计数器。

此外，当前**缺少 `close_block` 指令**：地块的 rent 押金由最初 mint 者锁定，转手后原 mint 者无法取回，且永久无法回收。若要支持"销毁地块退租金"，需新增 close 指令并明确退款对象。

---

## 8. 发布管道 (Publish Pipeline)

链上 schema 与交易指令已基本就绪，但**从编辑器把内容搬上链的管道尚未实现**——这是当前最大的缺口。

### 目标链路

```
编辑产物(SPP/adjunct/trigger/动画)
  → uploadData(): 上传 IPFS/Arweave
  → CID
  → commitBlock(blockKey, CID): 调用合约 update(data=CID)
  → 交易签名
```

### 现状

| 组件 | 状态 |
|------|------|
| `IChainPublisher` 接口（`uploadData` / `commitBlock`） | 仅定义，无实现 |
| `SolanaPublisher` 实现 | 待编写 |
| `contract.js` 客户端 | 仅接了 `init`，`mint/update/buy/sell` 均未 wire |
| 合约 `update(data: String)` | 已就绪，可直接接收 CID |

落地 `SolanaPublisher`（IPFS/Arweave 上传 + 调 `update`）即可打通内容上链。

---

## 9. 程序与数据全上链 (Full On-Chain Architecture)

这是 Septopus 架构的逻辑终点：**合约（逻辑）、数据（世界状态）、代码（引擎/框架/adjunct）全部内容寻址，链上只存指针，没有任何中心服务器是必须的**。

### 9.1 分层架构：从创世引导到世界运行

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 0 · Genesis Bootstrap                                    │
│  一段极小的 HTML + JS（< 5KB），唯一职责：                      │
│    读链上 EngineRegistry PDA → 取 Loader CID → 从 IPFS 加载    │
│  这是唯一需要"某处托管"的代码，可以是 IPFS 网关、ENS、         │
│  本地文件，甚至一个二维码。                                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1 · Loader（IPFS，CID 在链上）                          │
│  职责：拉取并启动 Framework                                     │
│    链上读 FrameworkCID → IPFS fetch → 校验 hash → dynamic import│
├─────────────────────────────────────────────────────────────────┤
│  Layer 2 · Framework / Engine（IPFS，CID 在链上）              │
│  VBW、World、Block、Render、Control……引擎全部模块              │
│  按需分片加载，每个模块独立 CID，可单独升级                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3 · World Data（IPFS，CID 存在链上 BlockData.data）     │
│  Block 的 SPP 二进制内容，adjunct 数据，trigger 脚本           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4 · Custom Adjunct Code（IPFS，CID 在链上 AdjunctType） │
│  第三方 adjunct 实现，按 short 键按需加载                       │
└─────────────────────────────────────────────────────────────────┘
         ↑ 每一层的 CID 都锚定在 Solana 链上，不可篡改
         ↑ 任意一层升级 → 新 CID → 更新链上指针 → 旧版本永久可访问
```

### 9.2 动态加载机制：为什么不是 `eval`

用户加载远程 JS 有几种方式，`eval` 是最简单但最危险的：

| 方式 | 安全性 | CSP 兼容 | 推荐场景 |
|------|--------|----------|----------|
| `eval(code)` | ❌ 最差 | ❌ 需 `unsafe-eval` | 不推荐 |
| `new Function(code)()` | ⚠️ 差 | ❌ 需 `unsafe-eval` | 不推荐 |
| Blob URL + `import()` | ✅ 好 | ✅ 无需特殊 CSP | **推荐** |
| Service Worker 拦截 | ✅ 最好 | ✅ 完全兼容 | **长期目标** |

**推荐方案：Blob URL + dynamic import**

```javascript
// Loader 加载 Framework 的核心逻辑
async function loadFromIPFS(cid) {
    // 1. 从链上读 CID（已校验不可篡改）
    const code = await ipfs.cat(cid);

    // 2. 校验完整性（CID 本身就是内容的 hash）
    const hash = await crypto.subtle.digest('SHA-256', code);
    assert(toBase58(hash) === cidToHash(cid), 'Integrity check failed');

    // 3. 动态导入（不需要 eval / unsafe-eval）
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const module = await import(url);
    URL.revokeObjectURL(url);
    return module;
}
```

**长期目标：Service Worker 方案**

注册一个 Service Worker，拦截 `ipfs://` 协议请求，透明地从 IPFS 网关解析内容。这样引擎内部可以直接 `import('ipfs://bafyXXX')` 而无需任何特殊加载逻辑，浏览器行为与普通模块加载完全一致。

### 9.3 链上注册表（EngineRegistry PDA）

所有层级的 CID 统一存在一个链上注册表账户：

```rust
#[account]
pub struct EngineRegistry {
    pub loader_cid:    String,   // Layer 1: Loader
    pub framework_cid: String,   // Layer 2: Framework bundle（或分片 manifest CID）
    pub version:       u32,      // 单调递增
    pub authority:     Pubkey,   // 可更新此注册表的权限（协议治理多签）
}
// seeds = [b"engine_reg"]  全局单例
```

更新引擎 = 一笔 `update_engine_registry` 交易，立即对所有客户端生效。旧版本通过旧 CID 永久可访问（IPFS 内容不删除）。

### 9.4 "程序和数据都在链上"的完整图景

```
用户打开 Septopus（任何方式：网址/IPFS网关/本地文件/二维码）
  │
  ├─ Genesis Bootstrap 读链上 EngineRegistry
  │    → loader_cid: "bafyLoader..."
  │
  ├─ IPFS 拉取 Loader → 校验 hash → dynamic import
  │
  ├─ Loader 读链上 EngineRegistry
  │    → framework_cid: "bafyFramework..."
  │
  ├─ IPFS 拉取 Framework（VBW + World + Render + Control...）
  │    → 引擎在浏览器本地完整启动
  │
  ├─ World 读链上 BlockData.data（用户钱包地址对应的世界）
  │    → CID: "bafyWorldData..."
  │
  ├─ IPFS 拉取 Block 数据（SPP 二进制）
  │    → 解压 → Raw → STD → 3D → Three.js 渲染
  │
  └─ 遇到未知 adjunct short 键 "xx"
       → 链上 AdjunctTypeRegistry 查 CID
       → IPFS 拉取 adjunct 代码 → 校验 → sandbox → 注册 → 渲染

最终状态：
  ✅ 逻辑（合约指令）              → Solana 链上
  ✅ 状态（所有权/价格/CID指针）   → Solana 链上 PDA
  ✅ 内容（3D数据/资产/世界文件）  → IPFS（CID 锚定在链上）
  ✅ 代码（引擎/框架/adjunct）     → IPFS（CID 锚定在链上）
  ✅ 校验（任意层级的完整性）      → CID 即 hash，自校验
  ❌ 中心服务器                    → 不需要
```

### 9.5 分片与按需加载

Framework 不必是一个大 bundle，可以按模块分片：

```
framework-manifest.json（CID 在链上）
  ├─ core/vbw.js        → CID_vbw
  ├─ core/world.js      → CID_world
  ├─ render/three.js    → CID_render（最大，Three.js 依赖）
  ├─ control/fpv.js     → CID_fpv
  ├─ adjunct/wall.js    → CID_wall
  └─ ...
```

Loader 先拉取 manifest，再按需加载当前场景需要的模块。渲染一个只有 `wall` 的世界不需要加载 `fpv` 控制器。

### 9.6 信任模型总结

| 层级 | 谁能修改 | 用户如何验证 |
|------|----------|-------------|
| 合约逻辑 | Solana 部署权限（多签） | 链上代码公开，可 verify |
| EngineRegistry（引擎 CID） | authority（协议治理） | 链上记录，可审计历史 |
| IPFS 内容 | 无人（内容寻址，不可变） | CID 即 hash，自校验 |
| AdjunctType（第三方代码） | adjunct owner | GitHub 源码 + AI 审计 |
| BlockData（世界内容） | Block owner | 链上 PDA，所有权清晰 |

**关键结论**：用户不需要"信任 Septopus 服务器"——因为服务器不存在。用户信任的是：Solana 链上的合约代码（可审计）和 IPFS 的内容寻址特性（数学保证）。

---

## 相关文档

- [地块系统 (Block)](../systems/block.md) —— 空间数据单元与无缝加载
- [数据管线](./pipeline.md) —— Raw → STD → 3D 的转换链路
- [弦粒子二进制协议](../features/spp-protocol.md) —— 上链内容的二进制格式
- [系统效率分析](../features/efficiency.md) —— 存储成本与性能估算
- [动态 Adjunct](../features/dynamic-adjunct.md) —— adjunct JS 代码上 IPFS + 按需加载的完整设计
