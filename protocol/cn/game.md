# Septopus 游戏模式协议 (Game Mode Protocol)

**游戏模式 (Game Mode)** 是 Septopus 引擎的特殊运行态，为创作者提供受控的游戏运行环境。进入游戏模式后，引擎切换到沙盒状态：预加载所需资源、激活完整的触发器权限、并隔离外部数据访问，确保流畅性与安全性。

游戏模式支持单人和多人场景。多人模式通过 WebRTC P2P 实现，无需中心服务器；高级游戏逻辑可通过可选的 WASM 模块实现权威计算。

## 1. 存储位置 (Storage)

游戏配置作为**资源 (Resource)** 存储在链上，与贴图 (texture)、3D 模型 (module) 属于同一个资源体系。资源的统一存储格式和寻址方式详见 [资源协议 (Resource Protocol)](./resource.md)。

**Block raw 数据中的引用：**

```
Block Raw: [ elevation, status, adjuncts, game_setting_resource_id ]
                                           ↑ index 3
```

- `raw[3]` 存储的是一个 **resource ID**（整数），指向链上的游戏配置资源
- 如果 `raw[3]` 不存在或为空，则该 block 没有游戏配置
- 引擎通过 `resource(id)` API 获取完整的游戏配置数据

**资源获取流程：**

```
Block raw[3] = 999 → resource(999) → { type: "game", format: "json", raw: { ... } }
```

## 2. 游戏配置数据结构 (Game Setting)

通过 resource API 获取到的完整游戏配置：

```json
{
    "type": "game",
    "format": "json",
    "raw": {
        "game": "parkour",
        "baseurl": "https://game_API.fun",
        "homepage": "",
        "version": "1.0.1",
        "blocks": [
            [1982, 619],
            [1983, 619, 5, 5]
        ],
        "init": {
            "sky": {},
            "weather": {},
            "start": {
                "block": [1983, 620],
                "position": [8, 8, 0],
                "rotation": [0, 0, 0]
            },
            "server": {
                "stun": "stun:stun.septopus.xyz:3478",
                "maxPlayers": 2
            }
        },
        "sync": "position",
        "wasm": null,
        "methods": [
            {
                "name": "start",
                "params": [],
                "response": [{ "type": "string", "length": 12 }]
            },
            {
                "name": "end",
                "params": [],
                "response": [{ "type": "string", "length": 12 }]
            }
        ]
    }
}
```

### 字段说明

| 字段 | 类型 | 必选 | 描述 |
|---|---|---|---|
| `game` | `string` | ✅ | 游戏名称/标识 |
| `baseurl` | `string` | ❌ | 游戏 API 根地址（无外部 API 时可省略） |
| `homepage` | `string` | ❌ | 游戏主页 URL |
| `version` | `string` | ❌ | 游戏版本号 |
| `blocks` | `Array` | ✅ | 预加载区域列表 |
| `init.sky` | `Object` | ❌ | 天空覆盖配置 |
| `init.weather` | `Object` | ❌ | 天气覆盖配置 |
| `init.start` | `Object` | ❌ | 起始位置，`block` 须在 `blocks` 范围内 |
| `init.server` | `Object` | ❌ | 多人网络配置（见第 7 节） |
| `sync` | `string` | ❌ | 同步级别（见第 7 节），默认 `null` 表示单人 |
| `wasm` | `number` | ❌ | WASM 游戏逻辑的 resource ID（见第 8 节） |
| `methods` | `Array` | ❌ | API 白名单方法列表 |

### 预加载区域格式

- **单一 Block**: `[x, y]` — 加载坐标 (x, y) 的 block
- **矩形区域**: `[x, y, extend_x, extend_y]` — 矩形区域，引擎自动额外扩展 2 个 block 作为缓冲

坐标为**绝对坐标**。

## 3. 游戏 API 白名单 (Game API Whitelist)

游戏模式下，如提供了 `methods`，引擎仅允许与其中定义的外部 API 进行通讯。

### 必须方法

| 方法 | 描述 |
|---|---|
| `start` | 游戏开始时调用，服务器初始化运行环境 |
| `end` | 游戏结束时调用，服务器接受结果数据 |

### 参数约束格式

| 字段 | 描述 |
|---|---|
| `type` | 参数类型：`"number"` / `"string"` |
| `limit` | 数值范围 `[min, max]` 或字符串长度限制 |
| `length` | 固定长度（仅用于 response） |

> [!NOTE]
> 纯 P2P 的小游戏（如跑酷、迷宫）不需要外部 API，此时 `baseurl` 和 `methods` 可省略，所有逻辑由引擎触发器 + WebRTC 同步完成。

## 4. 安全模型 (Security Model)

### 4.1 网络隔离

进入游戏模式后，引擎**切断所有标准数据源 (DataSource) 接口**。仅保留：
- Game API 白名单端点（如已定义）
- WebRTC P2P 连接（如已配置多人模式）

**隔离目的：**
- **流畅性**：不加载其他 block，不受外部数据更新影响
- **安全性**：DataSource API 中包含合约调用方法，隔离后防止间接触发链上操作

退出游戏模式后，DataSource 恢复正常。

### 4.2 `gameonly` 双层控制

`gameonly` 标记存在两个层级：

**① 触发器级别** — 整个触发器仅在 Game Mode 执行：

```
Trigger Raw: [ size, position, rotation, shape, event, actions, contractId, runOnce, gameOnly ]
                                                                                      ↑ index 8
```

`raw[8] = 1` 表示该触发器仅在游戏模式下激活。

**② 方法级别** — 单个 task 方法仅在 Game Mode 可被调用：

```javascript
task.router: [
    { method: "hide", gameonly: true },
    { method: "show", gameonly: true },
    { method: "dance", gameonly: true }
]
```

### 4.3 触发器权限矩阵

| 模式 | 环境变化 | 动画 | 物品栏修改 | 生命值/属性修改 |
|---|---|---|---|---|
| **Normal** | ✅ | ✅ | ❌ | ❌ |
| **Game** | ✅ | ✅ | ✅ | ✅ |
| **Ghost** | ❌ | ❌ | ❌ | ❌ |

## 5. 生命周期 (Lifecycle)

### 5.1 单人模式

```
检测到 Block raw[3] 有 resource ID
    │
    ├→ 1. resource(id) 获取完整 Game Setting
    ├→ 2. 预加载 blocks[] 中所有区域（引擎自动扩展 +2 缓冲）
    ├→ 3. 应用 init 配置（天空、天气、起始位置）
    ├→ 4. 切断 DataSource，仅保留 Game API
    ├→ 5. 调用 game.start()
    │
    │   [游戏运行中 — 触发器拥有完整权限]
    │
    ├→ 6. 游戏结束条件达成 → 调用 game.end()
    └→ 7. 恢复 DataSource，退出游戏模式
```

### 5.2 多人模式

```
玩家 A 进入 Game Mode（成为 Host）
    │
    ├→ 1-5. 同单人模式
    ├→ 6. 启动 WebRTC 信令，生成 Room ID
    ├→ 7. 等待其他玩家加入（通过 Room ID）
    │
玩家 B 加入
    │
    ├→ 1-4. 同单人模式（独立加载相同地图）
    ├→ 5. 通过 Room ID 与 Host 建立 WebRTC DataChannel
    ├→ 6. 如有 WASM → 下载相同的 WASM 模块
    ├→ 7. 开始同步（按 sync 级别交换数据）
    │
    │   [游戏运行中 — 双方独立运行物理/触发器，WebRTC 同步状态]
    │
    ├→ 8. 任一玩家达成结束条件 → 广播结束事件
    └→ 9. 双方退出游戏模式
```

## 6. 世界配置中的模式声明

领主通过世界配置的 `mode` 数组声明允许的操作模式：

```json
{
    "world": {
        "mode": ["ghost", "normal", "game"]
    }
}
```

若 `mode` 数组中不包含 `"game"`，则该世界下所有 block 的 Game Setting 将被忽略。

## 7. 多人同步 (Multiplayer Sync)

### 7.1 同步级别

`sync` 字段定义游戏所需的同步粒度：

| sync 值 | 级别 | 同步内容 | 适用场景 |
|---|---|---|---|
| `null` | — | 无同步（单人） | 单人跑酷、解谜 |
| `"position"` | L1 | 位置 + 朝向 + 动画状态 | 双人跑酷、赛跑、竞速 |
| `"state"` | L2 | L1 + 触发器状态变更事件 | 合作解谜、密室逃脱 |
| `"inventory"` | L3 | L2 + 背包/物品变更 | 寻宝竞赛、收集类 |
| `"authority"` | L4 | L3 + WASM 权威计算结果 | PvP 对抗（需 `wasm` 字段） |

每一级包含前一级的全部同步内容。

### 7.2 WebRTC P2P 连接

多人模式使用 WebRTC DataChannel 直接在玩家之间传输数据，无需中心游戏服务器。

**`init.server` 配置：**

```json
{
    "server": {
        "stun": "stun:stun.septopus.xyz:3478",
        "turn": "turn:turn.septopus.xyz:3478",
        "turnUser": "sept",
        "turnPass": "****",
        "maxPlayers": 4
    }
}
```

| 字段 | 类型 | 必选 | 描述 |
|---|---|---|---|
| `stun` | `string` | ✅ | STUN 服务器地址，用于 NAT 穿透 |
| `turn` | `string` | ❌ | TURN 中继服务器（NAT 穿透失败时降级使用） |
| `turnUser` | `string` | ❌ | TURN 认证用户名 |
| `turnPass` | `string` | ❌ | TURN 认证密码 |
| `maxPlayers` | `number` | ❌ | 最大玩家数，默认 2，建议不超过 8 |

**连接拓扑：** 2 人时为直连（Mesh），3+ 人时以 Host 为中心（Star）。

### 7.3 同步数据格式

WebRTC DataChannel 使用 Binary ArrayBuffer 传输，最小化带宽：

```
L1 (position): 每帧 ~40 bytes
┌──────┬──────────────────────┬──────────────────────┬──────────┐
│ type │ position (3×float32) │ rotation (3×float32) │ animState│
│ 1B   │ 12B                  │ 12B                  │ 2B       │
└──────┴──────────────────────┴──────────────────────┴──────────┘

L2 (state): 事件驱动，仅在触发器状态变化时发送
┌──────┬───────────┬──────────────┬──────────┐
│ type │ triggerId │ eventType    │ payload  │
│ 1B   │ 2B        │ 1B           │ N bytes  │
└──────┴───────────┴──────────────┴──────────┘

L3 (inventory): 事件驱动
┌──────┬──────────┬──────────┬──────────┐
│ type │ itemId   │ action   │ amount   │
│ 1B   │ 2B       │ 1B       │ 2B       │
└──────┴──────────┴──────────┴──────────┘
```

## 8. WASM 游戏逻辑 (可选)

对于需要权威计算的游戏（L4 同步级别），可通过 WASM 模块实现确定性的游戏逻辑。

### 8.1 存储

WASM 二进制作为 Resource 存储在 IPFS（type: `"wasm"`），Game Setting 通过 `wasm` 字段引用其 resource ID。

```json
{ "wasm": 1001 }
```

引擎加载流程：`resource(1001)` → 获取 WASM 二进制 → 实例化 WebAssembly Module。

### 8.2 执行模型

```
Host (玩家 A)                    Client (玩家 B)
┌─────────────────────┐        ┌─────────────────────┐
│ WASM Instance        │        │ WASM Instance (同一份)│
│ - 接收所有输入        │        │ - 接收所有输入        │
│ - 计算权威状态        │ WebRTC │ - 本地预测           │
│ - 广播权威结果  ─────│───────→│ - 收到权威结果后校验   │
│                     │←───────│ - 不一致时以 Host 为准 │
└─────────────────────┘        └─────────────────────┘
```

### 8.3 确定性要求

两端 WASM 须保证相同输入产生相同输出：
- 使用**定点算术**（integer-based），避免浮点精度差异
- 随机数使用**共享种子**（seed 在 game.start 时由 Host 生成并广播）
- WASM 模块禁止访问系统时间、DOM 等非确定性 API

### 8.4 应用场景

| 需要 WASM | 不需要 WASM |
|---|---|
| 伤害/命中判定 | 跑酷/竞速 |
| 物品掉落概率 | 合作解谜 |
| 回合制战斗结算 | 密室逃脱 |
| 排行榜防作弊 | 寻宝/探索 |

> [!TIP]
> 大多数休闲小游戏（跑酷、迷宫、解谜）只需 L1/L2 同步，无需 WASM。WASM 仅在需要权威仲裁（如 PvP 伤害判定）时引入。
