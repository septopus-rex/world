# Septopus 游戏模式协议 (Game Mode Protocol)

**游戏模式 (Game Mode)** 是 Septopus 引擎的特殊运行态，为创作者提供受控的游戏运行环境。进入游戏模式后，引擎切换到沙盒状态：预加载所需资源、激活完整的触发器权限、并隔离外部数据访问，确保流畅性与安全性。

## 1. 游戏设定数据结构 (Game Setting)

游戏设定存储在链上（Block 或 World 级别），定义了游戏模式启动所需的全部配置。任何兼容的引擎实现在检测到该设定时，可以允许玩家进入游戏模式。

```json
{
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
        "server": {}
    }
}
```

### 字段说明

| 字段 | 类型 | 必选 | 描述 |
|---|---|---|---|
| `blocks` | `Array` | ✅ | 预加载区域列表。`[x, y]` 为单一 block，`[x, y, ex, ey]` 为矩形区域 |
| `init.sky` | `Object` | ❌ | 游戏氛围的天空覆盖配置 |
| `init.weather` | `Object` | ❌ | 游戏氛围的天气覆盖配置 |
| `init.start` | `Object` | ❌ | 游戏起始位置，`block` 必须在 `blocks` 范围内 |
| `init.server` | `Object` | ❌ | 游戏网络通讯配置 |

### 预加载区域格式

- **单一 Block**: `[x, y]` — 加载坐标 (x, y) 的 block
- **矩形区域**: `[x, y, extend_x, extend_y]` — 从 (x, y) 开始，宽 extend_x、深 extend_y 的矩形区域

## 2. 游戏 API 白名单 (Game API Whitelist)

游戏模式下，引擎仅允许与预定义的外部 API 进行通讯。API 定义以明文形式存储在链上，使用与触发器一致的参数格式。

```json
{
    "game": "fly",
    "baseurl": "https://game_API.fun",
    "methods": [
        {
            "name": "start",
            "params": [],
            "response": [
                { "type": "string", "length": 12 }
            ]
        },
        {
            "name": "end",
            "params": [],
            "response": [
                { "type": "string", "length": 12 }
            ]
        },
        {
            "name": "view",
            "params": [
                { "type": "number", "limit": [0, 255] },
                { "type": "string", "limit": [0, 30] }
            ],
            "response": [
                { "key": "data", "format": "string" }
            ]
        }
    ]
}
```

### 必须方法

| 方法 | 描述 |
|---|---|
| `start` | 游戏开始时调用，游戏服务器初始化运行环境 |
| `end` | 游戏正常结束时调用，游戏服务器接受结果数据 |

其他方法为可选扩展，由创作者根据游戏需求自行定义。

### 参数约束格式

| 字段 | 描述 |
|---|---|
| `type` | 参数类型：`"number"` / `"string"` |
| `limit` | 数值范围 `[min, max]` 或字符串长度限制 `[min_len, max_len]` |
| `length` | 固定长度（仅用于 response） |

## 3. 安全模型 (Security Model)

### 3.1 网络隔离

进入游戏模式后，引擎**切断所有标准数据源 (DataSource) 接口**的访问能力。仅保留与 Game API 白名单中定义的端点的通讯。

**隔离目的：**
- **流畅性**：不加载其他 block，不受外部数据更新影响
- **安全性**：DataSource API 中包含合约调用方法，隔离后防止游戏逻辑间接触发链上操作

退出游戏模式后，DataSource 恢复正常。

### 3.2 触发器权限扩展

游戏模式下，触发器的执行权限范围扩大：

| 模式 | 环境变化 | 动画 | 物品栏修改 | 生命值/属性修改 |
|---|---|---|---|---|
| **Normal** | ✅ | ✅ | ❌ | ❌ |
| **Game** | ✅ | ✅ | ✅ | ✅ |
| **Ghost** | ❌ | ❌ | ❌ | ❌ |

触发器动作可标记 `gameonly: true`，禁止在非 Game 模式下执行。

## 4. 生命周期 (Lifecycle)

```
检测到 Game Setting 数据
    │
    ├→ 1. 预加载 blocks[] 中所有区域的数据
    ├→ 2. 应用 init 配置（天空、天气、起始位置）
    ├→ 3. 切断 DataSource，仅保留 Game API
    ├→ 4. 调用 game.start()
    │
    │   [游戏运行中 — 触发器拥有完整权限]
    │
    ├→ 5. 游戏结束条件达成 → 调用 game.end()
    └→ 6. 恢复 DataSource，退出游戏模式
```

## 5. 世界配置中的模式声明

领主通过世界配置的 `mode` 数组声明允许的操作模式：

```json
{
    "world": {
        "mode": ["ghost", "normal", "game"]
    }
}
```

若 `mode` 数组中不包含 `"game"`，则该世界下所有 block 的 Game Setting 将被忽略，玩家无法进入游戏模式。
