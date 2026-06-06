# 动态 Adjunct 详细设计

> 允许任何人向 Septopus World 贡献新的 3D 对象类型，无需引擎升级。
> **Schema 优先**：数据定义是第一公民，渲染实现是可选的引擎侧适配。

---

## 1. 核心原则：Schema 优先

### 1.1 当前问题

现有 adjunct（如 `adjunct_wall.ts`）把三件事耦合在同一个模块里：

```
数据格式定义  ← raw = [[x,y,z], [ox,oy,oz], [rx,ry,rz], texture]
渲染实现      ← stdToRenderData() → Three.js BoxGeometry
编辑器 UI    ← menu.sidebar() → 表单配置
```

这意味着"wall 是什么"和"wall 在 Three.js 里怎么画"耦合在一起。换个引擎（Unity、Godot、原生 App）就得重写；链上数据无法被独立验证。

### 1.2 Schema 优先的三层分离

```
Layer 1 · Schema（IPFS，CID 存链上）          ← engine-agnostic，必须
  参数类型 + 约束 + raw 格式规范 + render_hint
           ↓ 任何引擎、任何语言都能读
Layer 2 · Implementation（IPFS，CID 存链上）  ← engine-specific，可选
  Septopus JS 实现 / Unity 插件 / Godot 脚本 / 任意语言
  若无：引擎按 render_hint 降级渲染
           ↓
Layer 3 · Instance Data（BlockData.data）     ← 纯数据
  压缩参数值，按 Schema 验证，engine-agnostic
```

**Schema 是根本**：没有实现代码时，只要有 schema，引擎就能用 `render_hint` 降级渲染；有了多份实现，同一份世界数据可以被不同引擎正确渲染。数据真正从引擎中独立出来。

### 1.3 以 Wall 为例

**Schema（engine-agnostic）**：
```json
{
  "name": "wall",
  "short": "wl",
  "version": "1.0.0",
  "render_hint": "box",
  "category": "adjunct",
  "events": [],
  "raw_format": "[[x,y,z],[ox,oy,oz],[rx,ry,rz],texture_id,repeat,animate,stop]",
  "parameters": [
    { "key": "x",       "type": "float",        "min": 0, "max": 16, "unit": "m",   "desc": "宽度" },
    { "key": "y",       "type": "float",        "min": 0, "max": 16, "unit": "m",   "desc": "深度" },
    { "key": "z",       "type": "float",        "min": 0, "max": 32, "unit": "m",   "desc": "高度" },
    { "key": "ox",      "type": "float",        "desc": "X 偏移" },
    { "key": "oy",      "type": "float",        "desc": "Y 偏移" },
    { "key": "oz",      "type": "float",        "desc": "Z 偏移" },
    { "key": "rx",      "type": "float",        "min": -360, "max": 360, "desc": "X 旋转角" },
    { "key": "ry",      "type": "float",        "min": -360, "max": 360, "desc": "Y 旋转角" },
    { "key": "rz",      "type": "float",        "min": -360, "max": 360, "desc": "Z 旋转角" },
    { "key": "texture", "type": "resource_uri", "desc": "贴图资源" },
    { "key": "animate", "type": "anim_ref",     "desc": "动画索引" },
    { "key": "stop",    "type": "bool",         "desc": "物理碰撞体" }
  ]
}
```

**使用同一份数据的消费方**：
| 消费方 | 行为 |
|--------|------|
| Septopus JS 引擎 | 读 Schema → `render_hint: "box"` → BoxGeometry |
| Unity 插件 | 读 Schema → Cube |
| Godot 脚本 | 读 Schema → CSGBox |
| 链上数据验证工具 | 读 Schema → 校验 BlockData 压缩值范围 |
| AI 世界生成器 | 读 Schema → 知道 wall 接受哪些参数，自动生成 |
| 自定义 JS adjunct | 读 Schema + 提供 JS 实现 → 覆盖 render_hint，完全自定义渲染 |

---

## 2. 与内建 adjunct 的关系

动态 adjunct 与内建 adjunct **完全等价**，区别只在来源：

| | 内建 adjunct | 动态 adjunct |
|---|---|---|
| Schema 位置 | 引擎代码内隐式定义 → **需迁移为显式 Schema** | IPFS（CID 链上） |
| 实现位置 | 引擎 bundle 内 | IPFS（CID 链上），可选 |
| 注册方式 | 引擎启动时静态注册 | 首次遇到 short 键时按需加载 |
| 渲染表现 | 相同 | 相同（有实现走实现，无实现走 render_hint） |
| 性能 | 零加载延迟 | 首次加载后缓存，后续零延迟 |

> **演进方向**：内建 adjunct 的参数定义将逐步从代码中提取为显式 Schema JSON 存入 IPFS，完成内外统一。

---

## 3. 系统架构

```
┌────────────────────────────────────────────────────────┐
│                    引擎（主线程）                        │
│                                                         │
│  Block 渲染请求                                         │
│    │                                                    │
│    ▼                                                    │
│  AdjunctRegistry                                        │
│    ├─ 内建: "wl" → WallAdjunct（已注册）✓              │
│    └─ 未知: "my" → DynamicAdjunctLoader                │
│                         │                               │
│              ┌──────────▼──────────┐                   │
│              │  1. 查链 AdjunctType│                    │
│              │     → manifest_cid  │                    │
│              └──────────┬──────────┘                   │
│                    ┌────▼──────────────────────┐        │
│                    │  2. 拉取 Manifest（IPFS）  │        │
│                    │     → schema（参数定义）   │        │
│                    │     → impl_cid（可选）     │        │
│                    └────┬──────────────────────┘        │
│               ┌─────────▼──────────────────────┐       │
│               │  impl_cid 存在？                │       │
│               │  是 → 拉取 JS 实现 → 沙箱执行   │       │
│               │  否 → 用 render_hint 降级渲染   │       │
│               └─────────┬──────────────────────┘       │
│                         │                               │
│              AdjunctRegistry["my"] = logic              │
│                         │                               │
│                         ▼                               │
│              渲染（与内建完全相同的路径）                │
└────────────────────────────────────────────────────────┘
```

---

## 4. Schema 格式规范

### 4.1 顶层结构

```typescript
interface AdjunctSchema {
    name:        string;               // 可读名称
    short:       string;               // 2~4 字符短键，全局唯一
    version:     string;               // semver
    render_hint: RenderHint;           // 无实现时的降级渲染原语
    category:    'adjunct' | 'basic' | 'logic';
    events:      string[];             // 允许 emitEvent 的类型白名单
    raw_format:  string;               // 人类可读的压缩格式说明
    parameters:  ParameterDef[];
}

type RenderHint =
    | 'box'        // 长方体，size=[x,y,z], pos=[ox,oy,oz], rot=[rx,ry,rz]
    | 'sphere'     // 球体，size=[r,r,r]
    | 'plane'      // 平面（水面、地板）
    | 'cylinder'   // 圆柱
    | 'cone'       // 圆锥
    | 'light'      // 光源
    | 'trigger'    // 触发器（不可见，只有碰撞体积）
    | 'billboard'  // 始终朝向相机的平面
    | 'mesh';      // 需要 impl_cid 或 resource_uri 参数的任意 mesh

interface ParameterDef {
    key:      string;
    type:     ParamType;
    desc:     string;
    min?:     number;
    max?:     number;
    unit?:    string;
    default?: any;
    required?: boolean;  // 默认 false
}

type ParamType =
    | 'float' | 'int' | 'bool' | 'string'
    | 'resource_uri'   // 指向 StorageRouter 可解析的 URI（贴图/模型）
    | 'anim_ref'       // Block 动画库中的索引
    | 'color'          // 十六进制颜色
    | 'enum';          // 枚举，需配合 options 字段
```

### 4.2 Schema 的作用

| 用途 | 说明 |
|------|------|
| **参数验证** | 链上写入前、渲染前均可按 schema 校验参数合法性 |
| **降级渲染** | 无 `impl_cid` 时，引擎用 `render_hint` + 参数直接创建原语 |
| **多引擎支持** | 任何引擎读 schema → 自行实现渲染，数据格式统一 |
| **AI 世界生成** | AI 读 schema 知道每个 adjunct 接受什么参数，可生成合法数据 |
| **编辑器 UI 生成** | 从 `parameters` 自动生成属性面板，无需硬编码 |

---

## 5. 链上注册（AdjunctType PDA）

### 5.1 设计原则：PDA 存权威指针，内容存 IPFS

PDA 只存**最小权威信息**——谁拥有这个类型（owner）、指向哪份 Manifest（manifest_cid）、当前状态（status）。其余所有元数据（schema、实现引用、源码、github）全部在 Manifest 里，通过 manifest_cid 寻址。

这样设计的好处：
- **链上成本极小**：约 103B，rent ≈ 0.001 SOL
- **内容可修正**：IPFS 内容意外丢失时，owner 重新上传后更新 manifest_cid 即可恢复
- **与 BlockData 模式一致**：链上存指针（CID），IPFS 存内容

### 5.2 账户结构

```rust
#[account]
pub struct AdjunctType {
    pub type_id:      u16,    // 全局唯一数字 ID，0x0001-0x00FF 内建保留
    pub manifest_cid: String, // max 64B，IPFS Manifest CID（所有元数据的入口）
    pub owner:        Pubkey, // 可更新 manifest_cid / 状态的权限方
    pub version:      u32,    // 单调递增，客户端缓存失效用
    pub status:       u8,     // 0=Active / 1=Deprecated / 2=Banned
}

// PDA seeds = [b"adj_t", type_id.to_le_bytes()]
```

### 5.3 Manifest 格式（IPFS 内容）

```json
{
  "name":       "wall",
  "short":      "wl",
  "type_id":    2,
  "version":    "1.0.0",
  "schema": {
    "render_hint": "box",
    "raw_format":  "[[x,y,z],[ox,oy,oz],[rx,ry,rz],texture,animate,stop]",
    "parameters":  [ ... ]
  },
  "impl_cid":   "bafyIMPL...",
  "source_cid": "bafySRC...",
  "github":     "https://github.com/yourname/my-adjunct"
}
```

`impl_cid` 为空字符串或缺失表示 schema-only，引擎用 `render_hint` 降级渲染。`source_cid` 和 `github` 在 `impl_cid` 存在时必须一并提供（审计要求）。

### 5.4 typeId 分配

```
0x0000           保留（null/unknown）
0x0001-0x00FF    协议内建（255 种，合约硬编码，不占用 PDA）
  0x0001  box      0x0002  wall     0x0003  water
  0x0004  sphere   0x0005  cone     0x0006  light
  0x0007  trigger  0x0008  module   ...（预留到 0x00FF）
0x0100-0xFFFF    社区自定义（65,280 种，链上全局计数器自增分配）
```

内建类型 typeId 由协议固定，引擎硬编码，**不需要 PDA**，节省 rent。
自定义类型注册时合约分配下一个可用 typeId（从 0x0100 开始），owner 提供 manifest_cid。

### 5.5 合约指令

| 指令 | 说明 | 权限 |
|------|------|------|
| `register_adjunct_type(manifest_cid)` | 注册新类型，合约分配 typeId | 任何人 |
| `update_manifest(type_id, new_manifest_cid)` | 更新 Manifest 指针，version++ | 仅 owner |
| `deprecate_adjunct_type(type_id)` | 标记废弃 | owner 或协议管理员 |
| `report_adjunct(type_id, reason_cid)` | 提交举报 | 任何人 |

### 5.6 IPFS 内容丢失恢复

```
manifest_cid 对应的 IPFS 内容不可用
  ↓
owner 将内容重新上传到 IPFS（或 Arweave）→ 得到新 CID
  ↓
调用 update_manifest(type_id, new_cid)
  ↓
所有客户端下次读 PDA → 取新 manifest_cid → 恢复正常
链上 PDA 是权威，内容可修正，类型永不永久丢失
```

---

## 6. 加载器（DynamicAdjunctLoader）

### 6.1 接口定义

```typescript
interface DynamicAdjunctLoader {
    load(typeId: number): Promise<IAdjunctLogic>;
    getCached(typeId: number): IAdjunctLogic | null;
    prefetch(typeIds: number[]): Promise<void>;
}

// PDA 上存储的极简记录
interface AdjunctTypeRecord {
    type_id:      number;   // uint16
    manifest_cid: string;   // IPFS Manifest 入口 CID
    version:      number;
    status:       number;
}

// IPFS Manifest 的完整内容
interface AdjunctManifest {
    name:       string;
    short:      string;
    type_id:    number;
    version:    string;
    schema:     AdjunctSchema;    // 参数定义 + render_hint（engine-agnostic）
    impl_cid?:  string;           // JS 实现 CID（可选）
    source_cid?: string;          // 源码 CID（impl 存在时必须）
    github?:    string;           // GitHub URL（impl 存在时必须）
}
```

### 6.2 加载时序

```
load(0x0002)  ← typeId
  ├─ cache.get(0x0002) → null（首次）
  ├─ rpc.getAdjunctType(0x0002) → AdjunctTypeRecord
  │    → { manifest_cid: "bafyMANIFEST...", version: 3 }
  │
  ├─ 【一次请求】StorageRouter.get(manifest_cid) → AdjunctManifest
  │    ├─ 校验 CID 完整性
  │    ├─ 解析 schema（render_hint + parameters）
  │    └─ 取出 impl_cid（如有）
  │
  ├─ impl_cid 存在？
  │    ├─ 存在 →
  │    │    ├─ StorageRouter.get(impl_cid) → JS bundle (<100KB)
  │    │    ├─ 校验 CID 完整性
  │    │    ├─ sandbox.validateCode(code)
  │    │    ├─ sandbox.execute(code) → logic
  │    │    └─ 验证 logic.events ⊆ schema.events
  │    │
  │    └─ 不存在 →
  │         └─ buildDefaultLogic(schema.render_hint) → 降级渲染
  │
  ├─ cache.set(0x0002, logic)
  └─ 返回 IAdjunctLogic
```

### 6.3 render_hint 降级渲染

```typescript
function buildDefaultLogic(schema: AdjunctSchema): IAdjunctLogic {
    return {
        transform: {
            stdToRenderData: (stds, elevation) => stds.map(std => ({
                type: schema.render_hint,   // "box" | "sphere" | ...
                params: {
                    size:     [std.x, std.y, std.z],
                    position: [std.ox, std.oy, std.oz + elevation],
                    rotation: [std.rx, std.ry, std.rz],
                },
                material: { color: 0xcccccc }
            }))
        }
    };
}
```

这使得**任何只有 schema 的 adjunct 都可以被渲染**——哪怕没有开发者写过一行 JS 实现代码。

### 6.4 错误处理

| 错误 | 处理方式 |
|------|----------|
| 链上无此 short 键 | 渲染 Fallback Box（橙色警告色），控制台 warn |
| Schema 拉取失败 | 同上，后台重试 |
| Schema CID 校验失败 | 拒绝加载，记录安全事件 |
| Schema JSON 格式非法 | 拒绝加载 |
| Impl 代码超限（>100KB） | 拒绝加载，降级到 render_hint |
| Impl 沙箱执行报错 | 隔离错误，降级到 render_hint |
| Impl events 与 schema 不一致 | 拒绝加载（安全：防止未声明事件） |

---

## 7. 沙箱执行模型（仅 impl_cid 存在时触发）

### 7.1 为何需要沙箱

动态加载第三方 JS 实现是安全敏感操作。沙箱目标：
- 保护用户钱包私钥
- 阻止访问其他 Block 数据
- 隔离崩溃，不影响主线程

### 7.2 Web Worker 架构

```typescript
// 主线程
const worker = new Worker(sandboxWorkerUrl);
worker.postMessage({ code: implBundle, schema: adjunctSchema });
worker.onmessage = ({ data }) => {
    // data: { renderData: RenderObject[], events: any[] }
    // 主线程根据 renderData 创建 Three.js 对象
};

// sandbox-worker（Worker 内）
// 无 window / document / localStorage / fetch / importScripts
// 只有 self.adjunctAPI（受限接口）+ schema 参数约束
```

### 7.3 adjunctAPI 受限接口

```
✅ 允许
  adjunctAPI.createBox(w, h, d, color)              → MeshSpec
  adjunctAPI.createSphere(r, color)                 → MeshSpec
  adjunctAPI.createAsset(uri: resource_uri)         → MeshSpec（URI 格式校验）
  adjunctAPI.emitEvent(type, payload)               → 仅限 schema.events 中声明的类型
  adjunctAPI.getParam(key: string)                  → 从 schema.parameters 读取
  adjunctAPI.log(msg)                               → 调试（生产禁用）
  Math / JSON（只读）

❌ 禁止
  fetch / XMLHttpRequest / WebSocket
  localStorage / indexedDB
  Crypto.subtle
  importScripts / eval / new Function
  postMessage 到非引擎源
```

`adjunctAPI.createAsset(uri)` 不在沙箱内发起网络请求——它返回一个描述 spec，主线程收到后经 StorageRouter 加载资源，资源**不进沙箱**。

### 7.4 Schema 对沙箱的约束强化

有了 schema，沙箱可以做**更精确的运行时验证**：
- `emitEvent` 的类型必须在 `schema.events` 里声明（否则直接拦截）
- `getParam` 只能读取 `schema.parameters` 中定义的 key
- `stdToRenderData` 返回的 `type` 字段必须是合法的渲染原语类型

### 7.5 资源限制

| 限制项 | 值 |
|--------|----|
| 代码体积（impl） | 100 KB |
| 执行超时 | 200 ms |
| IPFS 加载并发 | 3 |
| 单 Block 最多动态类型 | 8 |

---

## 8. 安全审计体系

### 8.1 威胁模型

| 攻击方式 | 防线 |
|----------|------|
| 窃取钱包私钥 | ✅ 沙箱 API 不暴露 |
| 读取其他 Block 数据 | ✅ 数据隔离 |
| 发起任意网络请求 | ✅ fetch 禁用，资源由主线程加载 |
| 恶意参数（超范围值） | ✅ Schema 参数约束 + 运行时验证 |
| 未声明事件 | ✅ schema.events 白名单强制 |
| 投毒渲染结果 | ⚠️ 源码审计 + AI 分析 + 社区举报 |
| CPU 挖矿 | ⚠️ 执行超时 200ms |

**Schema 作为第一道防线**：在执行任何 JS 之前，schema 校验已经排除了超范围参数和未声明事件，大幅缩小了攻击面。

### 8.2 源码透明度要求

Manifest 中 `impl_cid` 非空时，必须同时提供：

| Manifest 字段 | 要求 |
|--------------|------|
| `source_cid` | 源码（未压缩）的 IPFS CID |
| `github` | GitHub 仓库 URL，内含构建脚本 |
| 可复现验证 | `build(source_cid) → bundle hash == impl_cid` |

schema-only（Manifest 中 `impl_cid` 缺失或为空）**不需要 source/github**，没有可执行代码，无需审计。

### 8.3 AI 辅助分析（针对 impl 代码）

```
开发者提交 PR → CI 触发 Claude API 分析源码
  ├─ transform 函数是否为纯函数（无 I/O、无副作用）
  ├─ emitEvent 类型是否在 schema.events 中
  ├─ createAsset URI 格式是否合法
  ├─ 是否存在原型链污染 / eval / 禁止 API
  └─ 输出：PASS / WARN / FAIL

PASS → 打包 → 上传 IPFS → 链上注册
```

### 8.4 社区举报与治理

```
状态机：Active → Reported → Under Review → Banned / Cleared

report_adjunct(short, reason_cid):
  任何人可调用，reason_cid 指向 IPFS 上的分析报告

Banned 后：
  引擎拒绝加载该 short 键（status 检查在 schema 加载前）
  降级到 Fallback Box，标记警告
```

---

## 9. 发布流程

### 9.1 Schema-only 发布（无 JS 实现）

最小发布路径——只需定义数据和 render_hint，无需任何 JS 代码：

```bash
# 1. 编写 Manifest（schema-only，impl_cid 留空）
cat > my_manifest.json << 'EOF'
{
  "name": "my_object", "short": "mo", "type_id": 0,
  "version": "1.0.0",
  "schema": {
    "render_hint": "sphere",
    "raw_format": "[radius, color]",
    "parameters": [
      { "key": "radius", "type": "float", "min": 0.1, "max": 10 },
      { "key": "color",  "type": "color" }
    ]
  }
}
EOF

# 2. 上传 Manifest 到 IPFS
ipfs add my_manifest.json
# → manifest CID: bafyMANIFEST...

# 3. 链上注册（合约自动分配 typeId，返回 0x0100+）
septopus-cli register-adjunct --manifest-ipfs bafyMANIFEST...
# → 分配 type_id: 0x0100，PDA 建立
```

### 9.2 Schema + 自定义实现发布

```bash
# 1. 编写 JS 实现
cat > my_impl.js << 'EOF'
const logic = {
    transform: {
        stdToRenderData: (stds, va) => stds.map(std => ({
            type: 'sphere',
            params: { size: [std.radius, std.radius, std.radius],
                      position: [std.ox, std.oy, std.oz + va],
                      rotation: [0, 0, 0] },
            material: { color: std.color ?? 0xffffff }
        }))
    }
};
EOF

# 2. 打包 + 上传
esbuild my_impl.js --bundle --minify --outfile=my_impl.min.js
ipfs add my_impl.js          # → source CID: bafySRC...
ipfs add my_impl.min.js      # → impl CID:   bafyIMPL...
git push origin main          # 必须，与 source_cid 对应

# 3. 构建含 impl 的完整 Manifest
cat > my_manifest_full.json << 'EOF'
{
  "name": "my_object", "short": "mo", "type_id": 0,
  "version": "1.0.0",
  "schema": { "render_hint": "sphere", ... },
  "impl_cid":   "bafyIMPL...",
  "source_cid": "bafySRC...",
  "github":     "https://github.com/yourname/my-object"
}
EOF
ipfs add my_manifest_full.json  # → bafyMANIFEST_FULL...

# 4. 更新链上指针（若已注册）/ 首次注册
septopus-cli update-manifest --type-id 0x0100 --manifest-ipfs bafyMANIFEST_FULL...
```

> IPFS 内容丢失时：重新上传 → 得到新 manifest CID → `update-manifest` 一条命令恢复。

---

## 10. 版本管理与兼容性

- `version` 单调递增，客户端按 `(short, version)` 缓存
- Schema 升级（增加参数）必须向后兼容——旧数据（无新参数值）按 `default` 处理
- Impl 升级不影响 schema 版本，独立迭代
- 旧 Block 数据（基于旧 schema）仍可用旧 impl CID 渲染，不强制升级

---

## 11. 与现有系统的关系

| 系统 | 关系 |
|------|------|
| [链上存储](../../chain/docs/onchain-storage.md) | `AdjunctType` PDA 是全链架构 Layer 4 的锚点 |
| [StorageRouter](../../chain/docs/onchain-storage.md#15-存储抽象层-storagerouter) | Schema + Impl 的 get/put 统一走 StorageRouter |
| [附属物系统](../systems/adjunct.md) | 动态 adjunct 是 §2 注册机制的运行时扩展，Schema 是 §4 数据压缩哲学的外显化 |
| [数据管线](../architecture/pipeline.md) | Schema 定义 Raw 格式，stdToRenderData 实现管线的最后一步 |
| [SPP 协议](./spp-protocol.md) | short 键是 SPP 协议内的类型标识符；schema 的 raw_format 即 SPP 序列化规范 |

---

## 12. 后续工作（TODO）

**合约层**
- [ ] `AdjunctType` 账户（type_id u16 / manifest_cid / owner / version / status）
- [ ] 全局 typeId 计数器 PDA（0x0100 起自增）
- [ ] `register_adjunct_type(manifest_cid)` → 分配 typeId，建 PDA
- [ ] `update_manifest(type_id, new_manifest_cid)` → IPFS 内容丢失恢复
- [ ] `deprecate_adjunct_type` / `report_adjunct` + 状态机流转

**引擎层**
- [ ] `AdjunctManifest` TypeScript interface + JSON Schema 校验
- [ ] 内建 adjunct Manifest 提取（0x0001-0x0008，硬编码 typeId，不走链上注册）
- [ ] `DynamicAdjunctLoader`（一次请求拉 Manifest，按需拉 impl）
- [ ] `buildDefaultLogic(schema.render_hint)` 降级渲染
- [ ] `BlockSystem` 解析改为 string name key（对齐 IPFS JSON 格式）
- [ ] Web Worker 沙箱（schema.events 白名单 + parameters 运行时约束）
- [ ] Fallback Box（橙色警告色，IPFS 不可用或 status=Banned 时）

**工具链**
- [ ] `septopus-cli register-adjunct --manifest-ipfs <CID>`
- [ ] `septopus-cli update-manifest --type-id <id> --manifest-ipfs <CID>`
- [ ] Manifest 校验工具（离线验证 schema 格式 + impl/source 一致性）
- [ ] CI 模板：AI 分析仅在 manifest.impl_cid 存在时触发
- [ ] 可复现构建验证（`build(source_cid) hash == impl_cid`）

**编辑器**
- [ ] 从 manifest.schema.parameters 自动生成属性面板
- [ ] adjunct 浏览器：Manifest 预览 / render_hint 可视化 / schema-only vs 有 impl 标识
- [ ] Banned adjunct 的批量替换工具
