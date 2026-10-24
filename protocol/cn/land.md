# Septopus 地块产权注册表（Land Registry）（规范）

> **规范级（Normative）**。定义**混合链架构**下「地块产权与链上内容指针」的协议契约：
> **世界发布走比特币锚（[boot-chain.md](boot-chain.md)），地块产权与市场走世界配置指定的
> 产权注册表（v1 = Solana `septopus_land` 合约）**。两层各司其职、互不越界。

## 1. 混合架构：为什么拆成两层

| 层 | 载体 | 频率 | 回答的问题 |
|---|---|---|---|
| **世界根** | 比特币锚 + IPFS（[boot-chain.md](boot-chain.md)） | 低频（发版级） | 这个世界叫什么、跑哪份客户端代码、用哪份世界配置与基础关卡、日历时钟走哪条链 |
| **地块产权** | 产权注册表合约（本文，v1 = Solana） | 高频（秒级/亚美分级） | 坐标 `[x, y]` 归谁、是否在售、所有人在这块地上发布了哪个内容 CID |

**分工红线（规范）**：

1. **产权合约不承载世界定义**。世界几何（`world.range`/`block`/`diff`）、出生点、模块白名单、客户端代码一律以比特币锚指向的 `septopus.world.config` 为唯一权威；合约中的 `range` 只是铸造边界镜像，不得覆盖世界配置。
2. **信任单向流动（比特币锚 → 产权合约）**。客户端只在 `septopus.world.config` 显式声明了 `land` 段时才连接该合约；合约本身不能自封为某个世界的权威，更不能反向修改世界代码或配置。
3. **链上只存 32 字节内容摘要，不存地块 JSON**。地块完整数据住在内容寻址存储（IPFS），链上只记录其 `CIDv1(raw, sha2-256)` 的 32 字节 sha2-256 摘要。
4. **纯本地构建零链依赖**。未注入链插件（或世界配置无 `land` 段）时，客户端按既有无链模式运行，所有地块可自由本地编辑。

## 2. 世界配置中的 `land` 声明（规范）

`septopus.world.config`（及本地 `*.world.json`）可包含可选顶层字段 `land`：

```json
{
  "land": {
    "chain": "solana",
    "cluster": "localnet",
    "program": "BchyjzrcoUdsuLH8fdbx1GSDj95cf3nvcAKeKsmC9ye5",
    "world": "septopus"
  }
}
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `chain` | `"solana"` | 产权注册表所在链标识 |
| `cluster` | `"localnet"` \| `"devnet"` \| `"mainnet-beta"` | 网络簇；客户端可由环境变量覆盖 RPC URL |
| `rpc` | `string`（可选） | 显式 RPC 端点 |
| `program` | `string` | 合约地址（Solana Base58 公钥） |
| `world` | `string`（1..32 字节） | 合约内的世界键，须与比特币锚的 `name` 一致 |

## 3. 内容 CID ↔ 32 字节摘要（规范）

Septopus 的内容 CID 固定为 **CIDv1 · raw (`0x55`) · sha2-256 (`0x12`, 长度 `0x20`)**，小写无填充 base32 编码（`bafk…`）。前 4 字节 `[0x01, 0x55, 0x12, 0x20]` 由协议固定，故链上账户仅存储后 32 字节 sha2-256 摘要 `content: [u8; 32]`：

- **编码上链**：校验 `cid` 前缀为 `[0x01, 0x55, 0x12, 0x20]`，取后 32 字节写入合约；
- **解码读回**：全零 `[0u8; 32]` 表示「未发布链上内容」；非零则冠以 `[0x01, 0x55, 0x12, 0x20]` 后 base32 编码，逐比特还原 `bafk…` CID；
- **校验**：客户端经 `IpfsRouter.get(cid)` 拉取字节时自动重算 sha2-256 比对 CID，网关无法伪造内容。

## 4. 地块状态与内容解析优先级（规范）

每个坐标 `[x, y]`（`1 ≤ x ≤ range[0]`, `1 ≤ y ≤ range[1]`）在合约中处于以下四种状态之一：

| 状态 | 含义 | 谁可进入 Edit 模式 |
|---|---|---|
| `unminted`（PDA 不存在） | 无主地块 | 无人（须先铸造认领；纯无链构建除外） |
| `owned`（`status = 0`） | 归 `owner` 所有 | 仅当前连接的钱包 `== owner` |
| `listed`（`status = 1`） | 挂单在售（标价 `price`） | 无人（挂单期间冻结 `set_content`，防偷梁换柱；撤单后恢复） |
| `banned`（`status = 2`） | 被世界权威封禁 | 无人 |

**内容解析优先级（客户端读取块 `[x, y]` 时）**：

1. **本地草稿（DraftStore）**：所有者在本地未发布的编辑工作副本；
2. **链上已发布内容**：若地块状态为 `owned` 或 `listed` 且 `cid != null`，从 CAS/IPFS 拉取 `cid` 对应的规范化 `BlockRaw`；
3. **封禁降级**：若状态为 `banned`，忽略链上 `cid`，回退到种子/默认地面；
4. **关卡种子 / fallback**：无链上内容（`unminted` 或 `cid == null`）时，保持世界原有的关卡文档与 `fallback` 地面。

## 5. Solana 参考合约（`septopus_land`）

### 5.1 PDA 派生

- **世界账户**：`seeds = ["world", world.as_bytes()]`
- **地块账户**：`seeds = ["block", world_pda.as_ref(), x.to_le_bytes(), y.to_le_bytes()]`

每个世界拥有独立的 PDA 命名空间，多世界并行互不冻结（修复旧合约仅允许操作最新世界的缺陷）。

### 5.2 账户布局

- `World`：`authority: Pubkey` · `treasury: Pubkey` · `name: String(≤32)` · `range_x: u32` · `range_y: u32` · `mint_price: u64` · `minted: u64` · `frozen: bool` · `bump: u8`
- `Block`：`world: Pubkey` · `x: u32` · `y: u32` · `owner: Pubkey` · `content: [u8; 32]` · `price: u64` · `status: u8` · `revision: u32` · `minted_slot: u64` · `updated_slot: u64` · `bump: u8`

### 5.3 指令集

| 指令 | 签名者 | 语义 |
|---|---|---|
| `init_world(name, range_x, range_y, mint_price)` | `authority` | 创建世界产权表 |
| `update_world(mint_price?, frozen?, treasury?)` | `authority` | 调整铸造价/冻结开关/金库 |
| `mint_block(x, y)` | `payer` | 校验 `1..=range`，向 `treasury` 支付 `mint_price`，初始化 `Block` PDA 归 `payer` 所有 |
| `set_content(x, y, content: [u8; 32])` | `owner` | 要求非 `listed` 且非 `banned`；写入 32 字节摘要并递增 `revision` |
| `list_block(x, y, price)` | `owner` | 要求 `price > 0` 且非 `banned`；状态置 `listed` |
| `delist_block(x, y)` | `owner` | 要求当前为 `listed`；状态恢复 `owned`、`price = 0` |
| `buy_block(x, y, expected_price)` | `buyer` | 校验 `status == listed`、`price == expected_price`（防抢跑改价）、`buyer != owner`、`seller == owner`；原子转账并过户、自动下架 |
| `transfer_block(x, y, new_owner)` | `owner` | 赠与过户并清除挂单 |
| `moderate_block(x, y, banned)` | `authority` | 世界领主封禁/解封违规地块 |

---

*协议版本：v0.1（2026-10 新增）。变更须 cn/en 双语同步并记入根 CHANGELOG。*
