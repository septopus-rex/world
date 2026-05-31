# 动态 Adjunct 详细设计

> 允许任何人向 Septopus World 贡献新的 3D 对象类型，无需引擎升级。

---

## 1. 动机

内建 adjunct 类型（`wall/water/ball/module/trigger` 等）由引擎团队维护，用户无法扩展。
动态 adjunct 系统打开了这道墙：

- **世界设计师**：可使用社区发布的第三方 adjunct，丰富建造元素
- **开发者**：可发布自己的 adjunct 实现，赋予世界独特的 3D 物体或交互逻辑
- **引擎**：无需感知"谁写的代码"，统一用 hooks 接口驱动渲染

这是 Septopus "内容去中心化"的最后一块——不仅数据在链上，**3D 行为逻辑本身**也可在链上寻址。

---

## 2. 核心概念

### 2.1 与内建 adjunct 的关系

动态 adjunct 与内建 adjunct **完全等价**，区别只在来源：

| | 内建 adjunct | 动态 adjunct |
|---|---|---|
| 代码位置 | 引擎 bundle 内 | IPFS（CID 链上） |
| 注册方式 | 引擎启动时静态注册 | 首次遇到 short 键时按需加载 |
| hooks 接口 | 相同 | 相同 |
| 渲染表现 | 相同 | 相同 |
| 性能 | 零加载延迟 | 首次加载后缓存，后续零延迟 |

### 2.2 短键（short key）是唯一锚点

引擎通过 Block raw 数据中的 `short` 键（2~4 字符）识别 adjunct 类型。
内建类型占用的短键（`wl/wt/bl/md/tr/st/lg` 等）由引擎保留，不可被动态 adjunct 覆盖。

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────┐
│                  引擎（主线程）                   │
│                                                  │
│  Block 渲染请求                                  │
│    │                                            │
│    ▼                                            │
│  AdjunctRegistry                                │
│    ├─ 内建: "wl" → WallAdjunct ✓               │
│    └─ 未知: "my" → 触发动态加载                 │
│              │                                  │
│              ▼                                  │
│  DynamicAdjunctLoader                           │
│    ├─ 1. 查链: "my" → CID                      │
│    ├─ 2. 拉取: IPFS fetch(CID)                 │
│    ├─ 3. 校验: SHA256 == CID ✓                 │
│    └─ 4. 注册: WebWorker sandbox               │
│                    │                            │
│                    ▼                            │
│  AdjunctRegistry["my"] = sandboxedHooks         │
│    │                                            │
│    ▼                                            │
│  渲染（与内建完全相同的路径）                    │
└─────────────────────────────────────────────────┘
```

---

## 4. 链上注册（AdjunctType PDA）

### 4.1 账户结构

```rust
#[account]
pub struct AdjunctType {
    pub short:   String,   // max 4B，全局唯一短键
    pub name:    String,   // max 32B，可读名称
    pub ipfs:    String,   // max 64B，代码 CID（v1 base32）
    pub owner:   Pubkey,   // 发布者，可更新 ipfs/name
    pub version: u32,      // 单调递增，客户端缓存失效用
    pub status:  u8,       // 0=Active / 1=Deprecated / 2=Banned
}

// PDA seeds
// seeds = [b"adj_t", short.as_bytes()]
```

### 4.2 合约指令

| 指令 | 说明 | 权限 |
|------|------|------|
| `register_adjunct_type` | 首次注册新 short 键 | 任何人（需为非内建键） |
| `update_adjunct_type` | 更新 `ipfs`/`name`，version++ | 仅 owner |
| `deprecate_adjunct_type` | 标记废弃，引擎停止加载 | owner 或协议管理员 |

### 4.3 短键保护

合约在 `register_adjunct_type` 时校验 short 键不与内建保留键冲突：

```rust
const RESERVED: &[&str] = &["wl","wt","bl","md","tr","st","lg","cn","sp","bx"];
require!(!RESERVED.contains(&short.as_str()), AdjunctError::ReservedKey);
```

---

## 5. 加载器（DynamicAdjunctLoader）

### 5.1 接口定义

```typescript
interface DynamicAdjunctLoader {
  // 查链获取 CID，拉取并注册
  load(short: string): Promise<AdjunctHooks>;

  // 查询缓存（同一会话内不重复加载）
  getCached(short: string): AdjunctHooks | null;

  // 预热：世界加载时批量预拉取当前区域内的未知类型
  prefetch(shorts: string[]): Promise<void>;
}
```

### 5.2 加载时序

```
load("my")
  ├─ getCached("my") → null（首次）
  ├─ rpc.getAdjunctType("my") → { ipfs: "bafyXXX", version: 3 }
  ├─ ipfs.cat("bafyXXX")  → Uint8Array (js bundle, <100KB)
  ├─ verify: sha256(bytes) == CID_multihash ✓
  ├─ sandbox.execute(bytes) → hooks object
  ├─ vbw.register(hooks)
  └─ cache.set("my", hooks)  ← 后续调用直接命中
```

### 5.3 错误处理

| 错误 | 处理方式 |
|------|----------|
| 链上无此 short 键 | 渲染占位 Box，控制台警告 |
| IPFS 拉取超时（>5s） | 同上，后台重试 |
| CID 校验失败 | 拒绝加载，记录安全事件 |
| 代码体积超限（>100KB） | 拒绝加载 |
| 沙箱执行报错 | 隔离错误，不影响其他 adjunct |

---

## 6. 沙箱执行模型

### 6.1 为何需要沙箱

动态加载第三方代码是安全敏感操作。沙箱的目标是：
- 保护用户钱包私钥不被窃取
- 阻止恶意代码访问其他 Block 数据
- 隔离崩溃，不影响主线程稳定性

### 6.2 Web Worker 方案

```javascript
// 主线程
const worker = new Worker('/sandbox-runner.js');
worker.postMessage({ code: adjunctBundle, params: rawData });
worker.onmessage = ({ data }) => {
  // data: { meshSpec, events }
  // 主线程根据 meshSpec 创建 Three.js 对象
};

// sandbox-runner.js（Worker 内）
// 没有 window / document / localStorage / fetch
// 只有 self.adjunctAPI（受限 API 集合）
```

### 6.3 允许/禁止 API

```
✅ 允许
  adjunctAPI.createBox(w, h, d, color)         → MeshSpec
  adjunctAPI.createSphere(r, color)             → MeshSpec
  adjunctAPI.createGLTF(ipfsCid)               → MeshSpec（CID白名单校验）
  adjunctAPI.emitEvent(type, payload)          → 事件上报给引擎
  adjunctAPI.getParam(index)                   → Raw 数据参数读取
  adjunctAPI.log(msg)                          → 调试日志（生产禁用）
  Math / JSON / console（只读）

❌ 禁止（访问即抛出 SecurityError）
  fetch / XMLHttpRequest / WebSocket           → 外部网络
  localStorage / indexedDB / cookie            → 本地存储
  Crypto.subtle（签名相关）                    → 密钥操作
  importScripts（二次加载代码）                → 扩展攻击面
  postMessage 到非引擎源                       → 数据泄漏
```

### 6.4 资源限制

| 限制项 | 值 | 说明 |
|--------|----|------|
| 代码体积 | 100 KB | 压缩前 |
| 执行超时 | 200 ms | 超时杀 Worker |
| 内存上限 | Worker 默认（~256MB） | 浏览器控制 |
| IPFS 加载并发 | 3 | 防止加载风暴 |
| 单 Block 最多动态类型 | 8 | 复杂场景限流 |

---

## 7. 安全审计体系

动态 adjunct 的安全不能只靠沙箱——沙箱是最后一道防线，真正可持续的安全来自**公开可审计 + AI 辅助分析 + 链上可信声明**的多层体系。

### 7.1 威胁模型

| 攻击方式 | 沙箱能否阻止 | 补充防线 |
|----------|-------------|----------|
| 窃取钱包私钥 | ✅ API 不暴露 | — |
| 读取其他 Block 数据 | ✅ 数据隔离 | — |
| 发起任意网络请求 | ✅ fetch 禁用 | — |
| 挂载 CPU 挖矿 | ⚠️ 执行超时可限制 | 执行时间 <200ms |
| 投毒渲染结果（引导用户操作） | ❌ 无法阻止 | 需公开源码审计 |
| 通过 emitEvent 发送误导信息 | ❌ 无法阻止 | 需 AI 审计 + 社区举报 |
| 利用空 validator 注入异常参数 | ❌ 引擎层面 | validator 完整性检查 |

第三类威胁——**逻辑层面的恶意行为**（欺骗性 UI、错误事件、空校验器滥用）——是纯沙箱方案的盲区，需要代码层面的透明度和审计机制来覆盖。

### 7.2 源码透明度：GitHub 地址要求

**注册时强制附带 GitHub 仓库地址**是解决代码逻辑可信度问题的核心手段。

```
AdjunctType 账户新增字段：
  github: String(128)    // GitHub 仓库 URL，注册时必填
  source_cid: String(64) // 源码的 IPFS CID（未压缩、未混淆）
```

**为什么有效：**

1. **可读性**：源码（非 bundle）是人类和 AI 都能读懂的格式，minified bundle 不具备这一属性
2. **可复现**：任何人可以 `git clone → build → 对比 bundle hash`，验证链上 bundle 确实由该源码生成
3. **可追溯**：GitHub 提交历史是公开的，代码改动有完整记录
4. **声誉绑定**：GitHub 账户是开发者的长期身份，与 Solana 公钥双重绑定，恶意行为代价更高

**链上校验（推荐）：**
```
发布流程：
  1. 源码上传 IPFS → source_cid
  2. esbuild 打包 → bundle_cid
  3. 链上注册时同时提交 github / source_cid / bundle_cid
  4. 社区/工具可验证：build(source_cid) hash == bundle_cid ✓
```

### 7.3 AI 辅助安全分析

Adjunct 的接口是结构化的，每个函数的语义和允许的输入/输出都有明确约束，这是 AI 静态分析的理想条件。

**AI 可以检查的内容：**

```javascript
// ✅ 可自动验证的问题

// 1. transform 函数是否有副作用
transform.raw_std = (arr, cvt) => {
    fetch('/evil')   // ← AI: 外部调用，拒绝
    return result;
}

// 2. validator 是否完整（空函数等于无校验）
valid.rx = (val, cvt, std) => {
    // 空函数 ← AI: 警告，该参数无验证
}

// 3. emitEvent 是否发送了 reg 中未声明的事件类型
adjunctAPI.emitEvent('wallet_request', ...)   // ← AI: 未声明事件，拒绝

// 4. 参数边界是否校验
transform.raw_std = (arr) => {
    arr[999999].x   // ← AI: 无边界检查，潜在崩溃

// 5. 是否有原型链污染
Object.prototype.x = ...   // ← AI: 原型污染，拒绝
```

**AI 分析流程（发布 gate）：**

```
开发者提交 PR 到 GitHub
  → CI 触发：Claude API 分析源码
      ├─ 检查 transform/* 是否为纯函数（无 I/O、无全局状态修改）
      ├─ 检查 valid.* 是否全部实现（无空函数）
      ├─ 检查 emitEvent 调用的事件类型是否在 reg.events 中声明
      ├─ 检查是否使用了禁止的全局对象
      └─ 输出：PASS / WARN（列出问题）/ FAIL（拒绝发布）
  → PASS 后：打包 → 上传 IPFS → 自动提交链上注册交易
```

AI 不是唯一判断者——分析结果作为链上元数据记录，用户在使用 adjunct 时可以看到安全评分和具体问题列表。

### 7.4 从 wall adjunct 代码看到的安全点

以内建 `adjunct_wall.js` 为参照，梳理动态 adjunct 的安全要求来源：

| 代码位置 | 现象 | 安全要求 |
|----------|------|----------|
| `valid.rx/ry/rz/texture` 为空函数 | 旋转和贴图参数无校验，任意值通过 | **要求**：所有 `valid.*` 必须实现，空函数视为未完成，AI 分析标记 WARN |
| `transform.raw_std` / `transform.std_3d` | 纯数据转换，无 I/O，无副作用 | **要求**：transform 函数必须是纯函数，AI 检查外部依赖 |
| `task.hide` / `task.crash` 回调 | 事件触发的执行入口，是副作用可能发生的地方 | **要求**：task 回调只能调用 `adjunctAPI.*`，不能访问外部 |
| `menu.sidebar` 的 `action` 回调 | 编辑器操作入口，在主线程执行 | **注意**：menu 在主线程而非 Worker 执行，动态 adjunct 的 menu 需要额外隔离策略 |
| `console.log` 调试日志（line 41） | 生产代码留有调试输出 | **要求**：发布前清理，AI 分析标记 INFO |

**关键发现**：`menu` 和 `task` 中的 `action` 回调比 `transform` 风险更高，因为它们在响应用户操作时执行，且不是纯函数。动态 adjunct 的沙箱设计应区分：

- `transform.*`：渲染管线，纯函数，可信度高
- `hooks.*`：注册信息，只读，可信度高  
- `task.*`：游戏事件回调，在 Worker 沙箱，中等风险
- `menu.*`：编辑器 UI 回调，**主线程执行**，动态 adjunct 应禁止或严格限制

### 7.5 社区举报与治理

技术审计之外，社区是最后一道防线：

```
AdjunctType 状态机：
  Active → Reported → Under Review → Banned / Cleared

举报机制：
  任何人可调用 report_adjunct(short, reason_cid) 提交举报
  reason_cid 指向 IPFS 上的详细分析报告

Banned 后：
  引擎拒绝加载该 short 键（status 检查在加载前）
  已渲染的实例保持显示但标记警告
  世界所有者可在编辑器中批量替换或删除
```

---

## 8. 发布流程（开发者视角）

```bash
# 1. 编写 adjunct hooks 实现
cat > my_adjunct.js << 'EOF'
export const hooks = {
  reg: () => ({ name: 'my_object', short: 'my', events: ['touch'] }),
  def: (param) => ({ ... }),
  raw_std: (raw) => ({ ... }),
  std_3d:  (std) => adjunctAPI.createBox(std.sx, std.sy, std.sz, std.color),
};
EOF

# 2. 打包（确保 <100KB）
esbuild my_adjunct.js --bundle --minify --outfile=my_adjunct.min.js

# 3. 上传 IPFS
ipfs add my_adjunct.min.js
# → CID: bafybeig...

# 3. 同时上传源码（用于审计）
ipfs add my_adjunct.js
# → source CID: bafysrc...

# 4. 推送到 GitHub（必须）
git push origin main

# 5. 链上注册（附带 GitHub + source CID）
septopus-cli register-adjunct \
  --short my \
  --name "My Object" \
  --ipfs bafybeig... \
  --source-ipfs bafysrc... \
  --github https://github.com/yourname/my-adjunct

# CI 在步骤 4 自动触发 AI 分析，通过后步骤 5 才可执行

# 6. 在世界编辑器里使用 short 键 "my" 引用该类型
```

---

## 8. 版本管理与升级

- `version` 字段单调递增，客户端按 `(short, version)` 做本地缓存
- 升级时（`update_adjunct_type`）旧 CID 仍可访问（IPFS 内容寻址永久可用）
- 使用旧版 Block 数据的世界继续使用旧 CID 渲染，不强制升级（向后兼容）
- `status=Deprecated` 时引擎仍加载已缓存版本，但提示用户该类型已废弃

---

## 9. 与现有系统的关系

| 系统 | 关系 |
|------|------|
| [发布管道](../architecture/onchain-storage.md#8-发布管道-publish-pipeline) | 共用 `uploadData → CID` 流程 |
| [引擎上链](../architecture/onchain-storage.md#9-引擎上链-engine-on-chain) | 同为"JS bundle → IPFS → CID 上链"模式，实现可复用 |
| [附属物系统](../systems/adjunct.md) | 动态 adjunct 是 §2 注册机制的运行时扩展 |
| [数据管线](../architecture/pipeline.md) | Raw → STD → 3D 转换由动态 adjunct 的 transform 接口完成 |
| [SPP 协议](./spp-protocol.md) | 动态 adjunct 的 Raw 数据仍走 SPP 压缩格式，short 键是协议内的标识符 |

---

## 10. 后续工作（TODO）

**合约层**
- [ ] `AdjunctType` 账户结构（含 `github` / `source_cid` 字段）
- [ ] `register_adjunct_type` / `update_adjunct_type` / `deprecate_adjunct_type` 指令
- [ ] `report_adjunct` 举报指令 + 状态机流转

**引擎层**
- [ ] `DynamicAdjunctLoader`（链上查询 + IPFS 拉取 + CID 校验）
- [ ] Web Worker 沙箱 runner（`adjunctAPI` 受限接口）
- [ ] `menu` 回调的主线程隔离策略（动态 adjunct 禁用或受限）
- [ ] 加载失败时的占位渲染（Fallback Box）

**工具链**
- [ ] `septopus-cli register-adjunct`（含 GitHub / source_cid 参数）
- [ ] CI 模板：GitHub Actions → Claude API 静态分析 → IPFS 上传 → 链上注册
- [ ] AI 分析规则集（pure function 检查 / validator 完整性 / 禁止 API 检测）
- [ ] 可复现构建验证（`build(source_cid) hash == bundle_cid`）

**编辑器**
- [ ] 未知 short 键时的搜索 / 引用 UI
- [ ] adjunct 详情页：GitHub 链接 / AI 安全评分 / 举报入口
- [ ] Banned adjunct 的批量替换工具
