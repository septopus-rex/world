# 附属物系统 (Adjunct)

附属物 (Adjunct) 是能够附加安放在 Block 上的任何对象。如果 Block 是这片 3D 世界的地板，那么 Adjunct 就是摆放在地板上的家具、建筑、树木或是游戏规则（如隐形的触发器）。

## 1. 结构与分类

Adjunct 不是硬编码的类，它更像是一个具有严格生命周期的**插件化组件**。
通过其 `category` 属性，Adjunct 主要分为三大类：
1.  **基础物体** (`basic`)：引擎内建的最轻量级模型。例如 `basic_box` (用来搭墙壁或者地板的纯色方块)、`basic_water` (半透明流体表现)。
2.  **外部模型载体** (`module`)：用来加载外部 glTF 或 Obj 模型的容器组件。
3.  **功能型虚体** (`logic`)：在画面中不可见或者只有半透明体积提示的对象。例如 `basic_trigger` (触发器：玩家进入后执行一段代码)、`basic_stop` (阻拦体：一堵看不见的空气墙)。

## 2. 核心架构：注册与挂载机制

任何人都可以编写一个新型的 Adjunct 扩展。一个标准的 Adjunct 组件必须通过 `Hooks` 暴露自身能力给系统（`World`）。

```javascript
// 一个典型 Adjunct 注册的伪代码
const adjunct_reg = {
    name: "my_custom_object",
    short: "mo",            // 用于极致压缩的上链短键
    events: ["in", "touch"] // 声明它能广播哪些事件
};

const hooks = {
    reg: () => { return adjunct_reg },
    def: (param) => { ... }, 
    animate: (effect) => { ... } // 支撑系统调用动画
}
```

**多态数据流驱动**：
同 Block 一样，每种 Adjunct 都必须实现一套 `transform` 接口（如 `raw_std`, `std_3d`）。当 Engine 请求把一个 Block 展现出来时，如果它发现这块地上挂载了多个 Adjunct（譬如 3 个 `basic_box` 和 1 个 `module`），引擎会分别找到这两种组件的控制器，将 Raw 数据传递给它们的 `transform` 并获取返回的三维对象，直接塞入场景。

## 3. 重要系统级功能

对于所有挂载入引擎的 Adjunct 对象，引擎自动提供以下底层的公共支撑系统：

### 动画路由系统 (Animation Router)
附属物支持预定义的数据驱动动画（无需编写每帧 `requestAnimationFrame` 逻辑）。
当链上的原始数据数组第六位 `d[5]` 带有动画映射键（如 `{ router: 1, param: [0.05] }`）时，系统会自动在渲染管线中为这个 Adjunct 实例化对应类型的动画修饰器（譬如不停自转、上下悬浮、或者按轨迹移动）。

### 事件监听机制 (Event Binding)
任何拥有坐标尺寸的 Adjunct 都自带物理侦测。
*   玩家撞击该物体时，引擎自动抛出 `touch`。
*   物理侵入包围盒内部时，抛出 `in`，离开时抛出 `out`。
这为制作踩踏机关、传送门等交互提供了基石。

### 空气墙与防穿模 (Stop/Collider)
只需要在 Adjunct 设置标志位（或是专职防穿模的 `basic_stop`），该挂载物就会在 ECS 的 `PhysicsSystem` 端注册为一个阻拦体（Collider）。底层的射线检测会保证玩家的坐标永远不会陷入此空间内。这为利用基础的 Box 搭建带有物理阻挡的“房子”成为可能。

## 4. 数据压缩哲学

Adjunct 是 Septopus “链上可用性”设计的结晶。
由于一个繁茂的世界内会摆放松以万计的组件，如果每个都存成 JSON，智能合约的 Gas 费或者 IPFS 的体积将是天价。

因此你在 Raw 数据里看到的不会是：
`{"type":"wall", "x":2, "y":4, "rotation": [0,0,0], "texture": 13}`
而是被引擎压缩器极尽所能缩短的：
`["wl", [[2,4,0], [1,0,0], [0,0,0], 13]]`

而还原出这些生涩数据的解释权，就封装在对应这个短键（"wl" 即 Wall）的扩展包代码里。

> **演进方向**：数据压缩格式（`raw_format`）将被正式提取为 **Schema JSON**（存 IPFS，CID 上链），使数据独立于任何引擎实现，可被任意语言/引擎直接解读。见 §6。

## 5. 动态 Adjunct（用户自定义扩展）

内建 adjunct 类型（`wall/water/ball/module/trigger` 等）覆盖了引擎原生支持的集合。但 Septopus World 的开放性要求**任何人都可以发布自己的 adjunct 类型**，而不需要引擎升级或官方审批。

### 5.1 设计目标

| 目标 | 说明 |
|------|------|
| **Schema 优先** | adjunct 的参数定义独立于实现，任何引擎都能按 schema 渲染 |
| **无需改引擎** | 自定义 adjunct 与内建 adjunct 遵循完全相同的接口 |
| **内容寻址** | Schema 和实现代码以 IPFS CID 为标识，不可篡改 |
| **按需加载** | 引擎遇到未知 short 键时，查链上 AdjunctType → 拉取 Schema（必须）→ 拉取 Impl（可选） |
| **沙箱执行** | 加载的 JS 实现在 Web Worker 受限上下文中运行，Schema 约束进一步收窄攻击面 |

### 5.2 两个独立 CID：Schema vs Impl

| | Schema CID（必须） | Impl CID（可选） |
|---|---|---|
| 内容 | 参数定义 + 约束 + raw 格式 + render_hint | JS 渲染实现代码 |
| 引擎依赖 | 无（engine-agnostic） | 有（engine-specific） |
| 无此 CID 时 | 无法注册 | 引擎用 render_hint 降级渲染 |
| 安全审计 | 格式校验即可 | 需要沙箱 + AI 审计 + GitHub 溯源 |

### 5.3 加载流程

```
Block.raw_data 包含未知 short 键（如 "mo"）
  → 查链上 AdjunctType：schema_cid + impl_cid
  → 拉取 Schema（必须）→ 解析参数定义 + render_hint
  → impl_cid 存在？
      是 → 拉取 JS → CID 校验 → 沙箱执行 → 完整自定义渲染
      否 → buildDefaultLogic(schema) → render_hint 降级渲染
  → 注册到引擎，后续渲染与内建完全相同
```

### 5.4 链上注册模型

PDA 只存**极简权威信息**，所有元数据（schema、impl、source、github）集中在 IPFS Manifest 里：

```
seeds = [b"adj_t", type_id.to_le_bytes()]  // 2 字节，约 103B，rent ≈ 0.001 SOL

AdjunctType {
    type_id:      u16       // 全局唯一数字 ID（0x0001-0x00FF 内建，0x0100+ 社区）
    manifest_cid: String(64)// IPFS Manifest 入口 CID（所有元数据的单一入口）
    owner:        Pubkey    // 可更新 manifest_cid
    version:      u32       // 单调递增，缓存失效用
    status:       u8        // Active/Deprecated/Banned
}

// IPFS Manifest 内容（manifest_cid 指向的 JSON）：
// { name, short, type_id, schema{render_hint,parameters,...},
//   impl_cid?, source_cid?, github? }
```

IPFS 内容意外丢失时，owner 重新上传后调用 `update_manifest` 更新 CID 即可恢复——**类型不会永久消失**。

完整规格见 [动态 Adjunct 详细设计](../features/dynamic-adjunct.md)。

## 6. Schema 即定义（面向未来）

这是 §4 数据压缩哲学的自然延伸：压缩格式不只是引擎内部的约定，而是**可被任何系统读取的正式规范**。

当前的 `adjunct_wall.ts` 的参数定义是隐式的（藏在 `stdToRenderData` 函数内）。演进方向是把它提取为显式 Schema：

```json
{
  "name": "wall", "short": "wl", "render_hint": "box",
  "parameters": [
    { "key": "x", "type": "float", "min": 0, "max": 16, "unit": "m" },
    { "key": "texture", "type": "resource_uri" },
    { "key": "stop", "type": "bool" }
  ]
}
```

这个 Schema 存 IPFS，CID 上链。它让：
- **任意引擎**（Unity/Godot/原生 App）读 schema → 按自己方式渲染同一份世界数据
- **链上数据工具**无需运行 JS 即可验证 BlockData 参数合法性
- **AI 世界生成器**知道 wall 接受哪些参数，自动构建符合规范的世界数据
- **编辑器 UI** 从 schema.parameters 自动生成属性面板，无需硬编码

**数据从此真正从引擎中独立出来。**

## 5. 动态 Adjunct（用户自定义扩展）

内建 adjunct 类型（`wall/water/ball/module/trigger` 等）覆盖了引擎原生支持的集合。但 Septopus World 的开放性要求**任何人都可以发布自己的 adjunct 类型**，而不需要引擎升级或官方审批。

### 5.1 设计目标

| 目标 | 说明 |
|------|------|
| **无需改引擎** | 自定义 adjunct 与内建 adjunct 遵循完全相同的 `hooks` 接口，引擎无法区分二者 |
| **内容寻址** | adjunct 实现代码以 IPFS CID 为标识，链上只存指针，代码不可篡改 |
| **按需加载** | 引擎遇到未知 `short` 键时，才去链上查 CID 并拉取代码，不影响已知类型的渲染性能 |
| **沙箱执行** | 加载的代码运行在受限上下文，无法访问钱包私钥、全局 DOM 或其他 Block 数据 |

### 5.2 加载流程

```
Block.raw_data 包含未知 short 键（如 "my"）
  → 查询链上 AdjunctTypeRegistry：short "my" → IPFS CID
  → 从 IPFS 拉取 adjunct JS（<100KB）
  → 校验 SHA256 与 CID 一致
  → 在 Web Worker 沙箱中执行，导出 hooks 对象
  → VBW.register(hooks) 注册进当前引擎实例
  → 后续渲染与内建 adjunct 完全相同
```

同一个 CID 在会话内只加载一次，注册后缓存在 VBW 里。

### 5.3 链上注册模型

自定义 adjunct 类型以独立 PDA 账户形式注册（`AdjunctType`）：

```
seeds = [ b"adj_t", short_key_bytes ]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `short` | `String(4)` | 全局唯一的 2~4 字符短键（引擎查找用） |
| `name` | `String(32)` | 可读名称 |
| `ipfs` | `String(64)` | 代码的 IPFS CID |
| `owner` | `Pubkey` | 发布者，可更新 `ipfs` 字段（发新版本） |
| `version` | `u32` | 单调递增，客户端可做缓存失效判断 |

**short 键冲突**：与内建类型重名的 short 键会被引擎拒绝注册（内建优先）。

### 5.4 沙箱安全模型

动态代码在 Web Worker 中执行，暴露给它的 API 面只有：

```javascript
// 允许
adjunctAPI.createMesh(geometry, material)  // 创建三维物体
adjunctAPI.emitEvent(type, payload)        // 向引擎抛出事件
adjunctAPI.getParam(index)                 // 读取 Raw 数据参数

// 不允许（抛出异常）
window.localStorage / fetch / WebSocket   // 外部 I/O
wallet / privateKey                        // 钱包访问
document / DOM                             // DOM 操作
```

代码体积上限 100KB（压缩前），超限直接拒绝加载。

### 5.5 与发布管道的关系

自定义 adjunct 的发布流程与内容上链共用同一套管道（见 [链上存储 §8](../../chain/docs/onchain-storage.md#8-发布管道-publish-pipeline)）：

```
开发者编写 adjunct hooks 实现
  → 打包压缩（<100KB）
  → uploadData() → IPFS CID
  → 调用合约 register_adjunct_type(short, name, ipfs_cid)
  → AdjunctType PDA 创建/更新
  → 世界设计师在编辑器里通过 short 键引用该类型
  → 内容上链时，short 键进入 Block 的压缩数据流
```

完整规格见 [动态 Adjunct 详细设计](../features/dynamic-adjunct.md)。
