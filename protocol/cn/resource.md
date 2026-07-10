# Septopus 资源协议 (Resource Protocol)

> **修订(2026-07-08)**:与 [envelope 封套与内容寻址](envelope.md) 对齐——**分工**:
> envelope 管「内容长什么样」(文档形状/CID/版本纪律),本文管「内容怎么被目录化、
> 谁拥有、怎么获取」(整数 id→CID 注册表、所有权、获取流程)。CID 一律为
> envelope §1 的真 CIDv1(`bafk…`;v0 `Qm…` 只读兼容)。链上注册表是**可选的
> 发布/所有权层**(链已解耦,见根 CLAUDE);local-first 阶段其等价物 = 资产清单 +
> 网关名字索引(envelope §5——注册表即"链上的、带所有权的名字索引")。

**资源 (Resource)** 是 Septopus 引擎中所有外部数据的统一抽象。贴图、3D 模型、游戏配置、文本内容、音效、合约 IDL 等，均通过同一个资源体系进行寻址和获取。

## 1. 存储架构 (Storage Architecture)

资源采用**链上注册 + IPFS 存储**的两层架构：

```
Solana (链上)                            IPFS (内容层)
┌────────────────────────┐              ┌─────────────────────────┐
│  Resource Registry     │              │                         │
│  ┌──────────────────┐  │   CID 引用    │  { index, type, format, │
│  │ ID: 2            │──│─────────────→│    raw: 实际数据 }       │
│  │ CID: "Qm..."     │  │              │                         │
│  │ owner: "Hx3f..." │  │              │  texture: PNG/JPG blob  │
│  │ size: 102400     │  │              │  module:  GLB/FBX blob  │
│  │ checksum: "ab.." │  │              │  game:    JSON config   │
│  └──────────────────┘  │              │  text:    多语言 JSON    │
│                        │              │  audio:   MP3/OGG blob  │
│  Block Raw Data        │              │                         │
│  [elev, status,        │              └─────────────────────────┘
│   adjuncts,            │
│   game_resource_id]    │
└────────────────────────┘
```

**链上（Solana PDA）存储：**
- 世界配置、Block 所有权、Block raw 数据（结构化小数据）
- **Resource Registry** — 资源 ID 到 IPFS CID 的映射表

**IPFS 存储：**
- 所有资源的实际内容（不论大小，统一走 IPFS）

## 2. 资源类型 (Resource Types)

| 类型 | 标识 | 典型格式 | 描述 |
|---|---|---|---|
| `texture` | 贴图 | png, jpg | 2D 图片，用于附属物表面材质 |
| `module` | 模型 | glb, fbx | 3D 模型文件 |
| `game` | 游戏配置 | json | Game Mode 启动配置（详见 [game.md](./game.md)） |
| `text` | 文本 | json | 多语言文本，供触发器 UI 动作引用 |
| `audio` | 音效 | mp3, ogg | 3D 空间音效 |
| `avatar` | 虚拟形象 | glb | 玩家虚拟形象模型 |
| `idl` | 合约接口 | json | 智能合约 IDL 定义 |
| `wasm` | 游戏逻辑 | wasm | WebAssembly 模块，用于 Game Mode L4 权威计算 |

## 3. 链上注册表 (On-Chain Registry)

每个资源在 Solana 上对应一个 PDA 账户，存储元数据：

```json
{
    "id": 999,
    "type": "game",
    "cid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "owner": "Hx3fLYV2Fu7Ewx59PYPofEPJobKxGHru1gUCn5SAMPLE",
    "size": 1024,
    "checksum": "sha256:a1b2c3d4e5f6..."
}
```

| 字段 | 类型 | 描述 |
|---|---|---|
| `id` | `number` | 资源 ID，全局唯一自增 |
| `type` | `string` | 资源类型标识 |
| `cid` | `string` | IPFS 内容标识符 |
| `owner` | `string` | 资源上传者的钱包地址 |
| `size` | `number` | 内容大小（字节） |
| `checksum` | `string` | 内容校验和。**注(2026-07-08)**:CIDv1 下冗余——CID 本身即 sha256,读取方按 envelope §1 重哈希校验;字段仅为 v0 `Qm…` 遗留兼容保留 |

## 4. IPFS 内容格式(2026-07-08 修订)

> **旧的 `{index, type, format, raw}` 统一包裹格式已废弃**。它把二进制媒体 base64
> 进 JSON 再寻址,导致 CID 算在包裹上而非媒体字节上——同一张贴图与外界 IPFS 内容
> **永不同 CID**(丢失互操作性),且 base64 使体积膨胀 ~33%。实现不得再产出;
> 读取方**可以**识读存量旧包裹。

现行规范(与 [envelope.md](envelope.md) §2/§3 一致):

- **二进制媒体**(texture/module/audio/avatar/wasm…):**原字节直接入 CAS**——
  CID 就是媒体字节的 CID,与任何 IPFS 参与者互操作;`type`/`format` 等元数据
  **不包裹进内容**,而是挂在注册表条目(§3)/名字索引上。
- **Septopus 原生 JSON 文档**(game 配置、text 多语言表、关卡/块/风格包/模块):
  按 envelope §2 统一封套 `{format:"septopus.<kind>", version, meta, payload}`。

**text 示例**(封套形):

```json
{
  "format": "septopus.text",
  "version": 1,
  "meta": { "name": "greetings" },
  "entries": { "zh-CN": ["你好", "欢迎"], "en-US": ["Hello", "Welcome"] }
}
```

**texture/module 示例**:无包裹——PNG/GLB 文件字节本身,`bafk(bytes)` 即其 CID。

## 5. 获取流程 (Fetch Flow)

```
引擎需要 resource #999
    │
    ├→ 1. 查链上 Registry: id=999 → cid="Qm..."
    ├→ 2. 校验本地缓存（IndexedDB/内存）是否已有该 CID
    │      ├→ 有：直接使用，跳到步骤 5
    │      └→ 无：继续
    ├→ 3. 从 IPFS 网关获取内容: gateway/ipfs/Qm...
    ├→ 4. 重哈希比对 CID(envelope §1 完整性;v0 遗留才用 checksum)
    └→ 5. 二进制→按注册表 type 交加载器;JSON→验封套拆 payload(envelope §2)
```

资源加载特性：
- **去重**：同一 CID 只下载一次，全局缓存
- **异步**：不阻塞主渲染循环
- **降级**：加载失败使用默认占位（默认颜色/默认几何体）
- **CDN 加速**：生产环境可在 IPFS 网关前加 CDN 缓存层

## 6. 资源引用 (Resource References)

其他协议通过**整数 ID** 引用资源，引擎运行时解析为 CID 并从 IPFS 获取：

| 引用位置 | 引用方式 | 示例 |
|---|---|---|
| 附属物贴图 | `a2 box raw[7]` = 贴图 id/CID（见 [texture.md](texture.md)；`raw[3]` 是颜色索引） | `raw[7] = 7` → 贴图 #7 |
| 附属物模型 | `a4 module raw[3]` = resource ID | `raw[3] = 27` → 模型 #27 |
| Block 可玩标记/外部 app id | `block raw[4]`(见 [block.md](block.md) §3) | `raw[4] = 42` → 外部游戏 #42 |
| 触发器 UI 文本 | 动作参数中的 resource ID | `system.ui.dialog(18)` → 文本 #18 |

## 7. 更新机制 (Update Mechanism)

资源更新时：
1. 上传新内容到 IPFS → 获得新 CID
2. 更新链上 Registry 的 `cid`、`size`、`checksum` 字段
3. 客户端检测到 CID 变化 → 重新从 IPFS 获取

旧 CID 的内容在 IPFS 上自然失活（无 pin 则被 GC），链上历史可追溯。

## 8. 与其他协议的关系

```
Resource Protocol (注册 + IPFS 内容)
    │
    ├── texture → Adjunct Protocol (材质引用)
    ├── module  → Adjunct Protocol (模型引用)
    ├── game    → Game Mode Protocol (游戏配置)
    ├── text    → Trigger Protocol (UI 文本)
    ├── audio   → Adjunct Protocol (空间音效)
    ├── avatar  → Player Protocol (虚拟形象)
    ├── idl     → Framework Protocol (合约接口)
    └── wasm    → Game Mode Protocol (游戏逻辑模块)
```
