# Phase 0 · 引擎收敛与迁移 — 详细实施规格

> **上级文档**：[ONCHAIN_ROADMAP.md](../../ONCHAIN_ROADMAP.md) § Phase 0  
> **目标**：消除双引擎，以新 TS 引擎为唯一运行时；迁移旧引擎沙箱原型；补全空壳 transform；废弃旧引擎。  
> **前置条件**：无（所有后续 Phase 均依赖本 Phase 完成）  
> **预估规模**：5 个 PR，约 800~1200 行净增（含测试）

---

## 0. 现状基线（来自代码调研）

### 新 TS 引擎已就绪的部分

| 文件 | 内容 | 对本 Phase 的意义 |
|------|------|------------------|
| `engine/src/Engine.ts` | 主入口，`IChainPublisher` 已在 `EngineServices` 中声明 | 接口锚点，直接扩展 |
| `engine/src/core/services/IChainPublisher.ts` | `uploadData` + `commitBlock` 接口 | 只需实现，不需重新设计 |
| `engine/src/core/services/DraftStorage.ts` | localStorage 多 Block 草稿缓存，`save/load/list/remove` 完整 | **Phase 1 直接复用**，本 Phase 无需改动 |
| `engine/src/core/systems/AdjunctSystem.ts` | `IAdjunctLogic` 接口，`AdjunctFactory.createMesh` | 动态 loader 输出必须符合此接口 |

### 旧引擎可迁移的部分

| 文件 | 可用内容 | 需要改造的地方 |
|------|----------|---------------|
| `engine/src/septopus/security/adjunct-sandbox.js` | Web Worker 架构、消息协议、`validateCodeSafety` 正则检测 | 1. 去掉 `window.THREE/window.VBW` 依赖<br>2. `new Function()` 改为 Blob URL + `importScripts` 模式<br>3. TS 重写 |
| `engine/src/septopus/security/adjunct-loader.js` | IPFS 拉取（重试+超时）、hash 验证、会话缓存 | 1. 去掉 `window.*` 依赖<br>2. 接入 `StorageRouter`（Phase 1 中建，本 Phase 用直接 fetch 占位）<br>3. TS 重写 |
| `engine/src/septopus/core/adjunct-manager.js` | 并发限制、preload 批量加载思路 | 整体重新设计，仅参考思路 |

### 需要补全的 adjunct transform（旧引擎）

| 文件 | 缺失内容 |
|------|----------|
| `adjunct_water.js` | `transform` 对象整体缺失（无 `raw_std` / `std_3d`） |
| `adjunct_sample.js` | `std_3d` 注释掉，仅有骨架 |
| `adjunct_wall.js` | `valid.rx/ry/rz/texture/tx/ty/animate/stop` 全为空函数；第 229 行 bug：`p.z = rst.size != p.y` 应为 `!= p.z` |

> 注：上述 adjunct 在**旧 JS 引擎**中。新 TS 引擎的 adjunct 逻辑通过 `IAdjunctLogic` 接口挂载，迁移时需要对应评估新引擎中是否已有等价实现，若无则补充。

---

## 1. 交付物清单（PR 分解）

### PR-0A · AdjunctSandbox 迁移（新引擎）

**目标**：在新引擎 `core/services/` 建立 `AdjunctSandbox.ts`，替代旧引擎 `security/adjunct-sandbox.js`。

#### 1.1 接口定义

```typescript
// engine/src/core/services/AdjunctSandbox.ts

// Sandbox 执行 impl_cid 代码后的输出
// Schema 由 loader 独立获取，不经沙箱
export interface SandboxExecuteResult {
    transform: AdjunctTransform;  // stdToRenderData（必须，纯函数）
    attribute?: AdjunctAttribute; // 编辑器属性操作
    menu?: AdjunctMenu;           // 编辑器 UI（动态 adjunct 禁用或受限）
    task?: AdjunctTask;           // 游戏事件回调
}

export interface AdjunctHooks {
    reg(): AdjunctReg;
    animate?(ms: number): void;
}

export interface AdjunctReg {
    name: string;
    category: 'adjunct' | 'basic' | 'logic';
    version: string;
    events: string[];   // 允许 emitEvent 的类型白名单
}

export interface AdjunctTransform {
    raw_std(arr: any[], cvt: number): any[];
    std_3d(stds: any[], va: number): any[];
    std_2d?(stds: any[], face: any, faces: any): any[];
    std_active?(std: any[], va: number, cvt: number): any;
}

export interface AdjunctSandboxConfig {
    timeout?: number;        // default 5000ms（执行超时，不是加载超时）
    maxCodeSize?: number;    // default 100 * 1024 bytes
}
```

#### 1.2 Worker 执行模型（替换 `new Function`）

旧实现在 Worker 内用 `new Function(code)` 执行——仍可被原型链污染。新实现用 **Blob URL + `importScripts`** 隔离：

```typescript
// Worker 内执行用户代码的方式
function executeUserCode(code: string): SandboxExecuteResult {
    // 1. 把用户代码包在 IIFE 里，注入受限 API
    const wrapped = `
        "use strict";
        // 屏蔽全局
        const globalThis = undefined, global = undefined,
              window = undefined, document = undefined,
              navigator = undefined, location = undefined,
              localStorage = undefined, sessionStorage = undefined,
              fetch = undefined, XMLHttpRequest = undefined,
              importScripts = undefined, eval = undefined;

        // 注入受限 adjunctAPI（由 Worker 初始化时写入 self）
        const adjunctAPI = self.__adjunctAPI;

        ${code}

        // 期望用户代码 export 一个默认对象
        if (typeof module_export === 'undefined') throw new Error('adjunct must export a default object');
        return module_export;
    `;
    // 2. 用 Blob URL 动态创建子脚本并立即 revoke
    const blob = new Blob([wrapped], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
        importScripts(url);   // Worker 内可用 importScripts
    } finally {
        URL.revokeObjectURL(url);
    }
}
```

> `importScripts` 在 Web Worker 内是同步阻塞，配合外层 `postMessage` 的超时机制（主线程侧计时），可以保证 200ms 执行上限。

#### 1.3 受限 API（adjunctAPI）

只向沙箱暴露以下接口（在 Worker 初始化时通过消息传入定义，实际实现在主线程代理执行）：

```typescript
interface AdjunctSandboxAPI {
    // 渲染
    createBox(w: number, h: number, d: number, color: number): MeshSpec;
    createSphere(r: number, color: number): MeshSpec;
    createGLTF(uri: string): MeshSpec;     // uri 必须在白名单 scheme 内

    // 交互
    emitEvent(type: string, payload: any): void;  // type 必须在 reg.events 中

    // 数据读取（只读，不含其他 Block 数据）
    getParam(index: number): any;

    // 调试
    log(...args: any[]): void;
}
```

`createGLTF` 的 `uri` 校验：只接受 `ipfs://`、`ar://` 开头；实际加载由主线程经 StorageRouter 完成，沙箱内只返回 spec 描述，不发起网络请求。

#### 1.4 静态代码验证（`validateCode`）

在执行前做正则快筛，拒绝明显危险模式（与旧实现一致，扩展几条）：

```typescript
const FORBIDDEN_PATTERNS: RegExp[] = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bsetTimeout\s*\(/,
    /\bsetInterval\s*\(/,
    /\bimport\s*\(/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\s*\./,
    /\bwindow\s*\./,
    /\bnavigator\s*\./,
    /\blocation\s*\./,
    /\bprocess\s*\./,           // Node 残留
    /Object\.prototype\s*\[/,  // 原型链污染
    /__proto__/,
];
```

#### 1.5 验收标准（PR-0A）

- [ ] 合法 adjunct 代码（`adjunct_wall.js` 内容）能在沙箱中执行并返回正确的 `SandboxExecuteResult`
- [ ] 含 `fetch(` 的代码在 `validateCode` 阶段被拒绝，不进入执行
- [ ] Worker 内执行超过 5s 的代码（`while(true){}`）被主线程超时机制终止，不挂起 UI
- [ ] Worker 崩溃后自动重启，不影响其他已加载 adjunct 的渲染
- [ ] 单元测试覆盖：合法执行、非法模式拒绝、超时、崩溃重启

---

### PR-0B · AdjunctLoader 迁移（新引擎）

**目标**：在 `core/services/AdjunctLoader.ts` 实现按需加载，接入 `AdjunctSystem`。

#### 2.1 接口定义

```typescript
// engine/src/core/services/AdjunctLoader.ts

export interface AdjunctLoaderConfig {
    sandbox: AdjunctSandboxConfig;
    maxConcurrent?: number;   // default 3，防加载风暴
    cacheBySession?: boolean; // default true，会话级缓存
}

export class AdjunctLoader {
    // 按 short 键加载（优先走缓存）
    async load(short: string, uri: string): Promise<IAdjunctLogic>;

    // 批量预热（世界加载时预拉当前区域的未知类型）
    async prefetch(entries: Array<{ short: string; uri: string }>): Promise<void>;

    // 清理缓存（退出世界时）
    clearCache(): void;
}
```

#### 2.2 加载时序（Schema 优先）

```
load("my")
  1. cache.get("my")  → null（首次）
  2. rpc.getAdjunctType("my") → { schema_cid, impl_cid?, version }
  3. 【必须】StorageRouter.get(schema_cid) → AdjunctSchema JSON
       ├─ 校验 CID 完整性
       └─ 解析 parameters + render_hint
  4. impl_cid 存在？
       是 → StorageRouter.get(impl_cid) → Uint8Array (<100KB)
             → sha256 校验
             → sandbox.validateCode(text)
             → sandbox.executeAdjunct(text) → SandboxExecuteResult
             → 验证 transform 不为 null，events 符合 schema.events
       否 → buildDefaultLogic(schema) → render_hint 降级渲染
  5. cache.set("my", logic)
  返回 IAdjunctLogic
```

#### 2.3 与 AdjunctSystem 的集成点

`AdjunctSystem.initializeAdjunct` 中当 `adjunct.logicModule` 为 null 且 `adjunct.adjunctId` 是未知类型时，触发异步加载：

```typescript
// AdjunctSystem.ts 中新增
private async resolveLogicModule(adjunctId: string): Promise<IAdjunctLogic | null> {
    // 1. 查内建注册表
    const builtin = AdjunctRegistry.get(adjunctId);
    if (builtin) return builtin;

    // 2. 查链上 AdjunctType PDA（Phase 3 实现后启用，当前返回 null）
    // const uri = await chainClient.getAdjunctTypeUri(adjunctId);
    // if (uri) return this.loader.load(adjunctId, uri);

    return null; // 返回 null → 渲染 Fallback Box
}
```

#### 2.4 加载失败的 Fallback

```typescript
// 加载失败或超时时，渲染一个半透明警告 Box
const FALLBACK_LOGIC: IAdjunctLogic = {
    transform: {
        std_3d: (stds, va) => stds.map(() => ({
            type: 'box',
            params: { size: [1, 1, 1], position: [0, 0, va] },
            material: { color: 0xff4400, opacity: 0.4 }
        }))
    }
};
```

#### 2.5 验收标准（PR-0B）

- [ ] 同一 short 键第二次 `load` 直接命中缓存，不发网络请求
- [ ] 未知 adjunct 类型（无链上注册）渲染 Fallback Box，控制台输出 warn 而非 error
- [ ] 3 个并发加载请求正常执行，第 4 个等待槽位（maxConcurrent=3 限制生效）
- [ ] IPFS URI 格式错误时抛出有意义的错误信息

---

### PR-0C · SolanaPublisher 实现

**目标**：实现 `IChainPublisher`，接入现有 `contract.js` 和 `ipfs.js`。

#### 3.1 实现

```typescript
// app/src/lib/SolanaPublisher.ts

import { IChainPublisher } from '../../../engine/src/core/services/IChainPublisher';
import IPFS from './ipfs';
import { actions } from './contract';

export class SolanaPublisher implements IChainPublisher {
    private worldId: number;
    private wallet: any; // AnchorWallet

    constructor(worldId: number, wallet: any) {
        this.worldId = worldId;
        this.wallet = wallet;
    }

    async uploadData(raw: any): Promise<string> {
        const json = JSON.stringify(raw);
        const cid = await IPFS.add(json);      // 现有 ipfs.js 已实现
        if (!cid) throw new Error('IPFS upload failed');
        return `ipfs://${cid}`;
    }

    async commitBlock(blockKey: string, uri: string): Promise<string> {
        const [x, y] = blockKey.split('_').map(Number);
        const cid = uri.replace('ipfs://', '');
        // 现有 contract.js actions.update_block 已 wire
        const txHash = await actions.update_block(cid, x, y, this.worldId, this.wallet);
        return txHash;
    }
}
```

#### 3.2 批量发布流程（配合 DraftStorage）

`DraftStorage` 已实现，这里只需把它串起来：

```typescript
// app/src/lib/publishDrafts.ts

import { DraftStorage } from '../../../engine/src/core/services/DraftStorage';
import { SolanaPublisher } from './SolanaPublisher';

/**
 * 批量发布 dirty 草稿到链上
 * - 先全部上传 IPFS（并行）
 * - 再批量提交链上（串行，每批次一个交易）
 */
export async function publishDrafts(
    worldId: number,
    wallet: any,
    onProgress?: (done: number, total: number) => void
): Promise<{ success: string[]; failed: string[] }> {
    const storage = new DraftStorage();
    const drafts = storage.list(worldId);
    if (drafts.length === 0) return { success: [], failed: [] };

    const publisher = new SolanaPublisher(worldId, wallet);
    const results = { success: [] as string[], failed: [] as string[] };

    // Phase 1：并行上传 IPFS
    const uploaded = await Promise.allSettled(
        drafts.map(draft => publisher.uploadData(draft.raw).then(uri => ({ draft, uri })))
    );

    // Phase 2：串行提交链上（Solana 交易可以批量打包，后续用 versionedTx 优化）
    let done = 0;
    for (const result of uploaded) {
        if (result.status === 'fulfilled') {
            const { draft, uri } = result.value;
            try {
                const [bx, by] = draft.blockKey.split('_').map(Number);
                await publisher.commitBlock(draft.blockKey, uri);
                storage.remove(worldId, bx, by);   // 成功后清除草稿
                results.success.push(draft.blockKey);
            } catch (e) {
                results.failed.push(draft.blockKey);
            }
        } else {
            results.failed.push('upload_failed');
        }
        onProgress?.(++done, drafts.length);
    }

    return results;
}
```

> ⚠️ 当前是串行逐块提交。后续优化点：用 Solana Versioned Transaction + Address Lookup Table 打包多个 `update_block`，减少签名次数。这留到实际遇到性能瓶颈时再做。

#### 3.3 验收标准（PR-0C）

- [ ] 单个 Block 编辑 → 保存草稿 → 发布 → `DraftStorage.list()` 返回空 → 刷新页面从链上+IPFS 还原
- [ ] 多个 Block 批量发布，进度回调正确触发
- [ ] IPFS 上传失败的 Block 留在草稿，不提交链上
- [ ] 链上提交失败的 Block 草稿保留，可重试

---

### PR-0D · 旧引擎 adjunct 空壳补全

**目标**：补全旧 JS 引擎中的空壳实现（为迁移到新引擎做准备，也确保新引擎对应逻辑正确）。

| 任务 | 文件 | 具体内容 |
|------|------|----------|
| 补全 `valid.*` 函数 | `adjunct_wall.js` | `rx/ry/rz`：验证为合法角度（数值，[-360,360]）；`texture`：正整数；`tx/ty`：正数；`animate`：在允许列表内；`stop`：boolean |
| 修复 bug | `adjunct_wall.js` 第 229 行 | `p.z = rst.size != p.y` → `p.z = rst.size != p.z ? rst.size : p.z` |
| 补全 `adjunct_water.js` | `adjunct_water.js` | 参照 `adjunct_wall.js` 实现 `transform.raw_std` 和 `transform.std_3d`（水面：半透明平面） |
| 补全 `adjunct_sample.js` | `adjunct_sample.js` | 取消注释 `std_3d`，补全到可运行状态 |

#### 验收标准（PR-0D）

- [ ] `adjunct_wall.js` 的所有 `valid.*` 函数对合法值返回处理后的值，对非法值返回 false
- [ ] `adjunct_water.js` 能正确渲染（返回半透明平面的 std_3d 描述）
- [ ] 旧引擎测试页能显示 water adjunct 而不报错

---

### PR-0E · 旧引擎废弃与 CLAUDE.md 更新

**目标**：清理，统一文档。

| 任务 | 操作 |
|------|------|
| 归档旧引擎 | 将 `engine/src/septopus/` 整体移到 `engine/_deprecated/septopus/`（保留 git 历史，不删除） |
| 删除旧引擎引用 | 检查全局是否有 `import ... from '*/septopus/'`，全部去除 |
| 更新 `CLAUDE.md` | 引擎结构部分改为描述新 TS 引擎（`Engine.ts` + ECS + `core/`），删除 VBW/Septo.launch 相关描述 |
| 更新 `engine/src/septopus` 引用 | 同步更新 `docs/` 中引用旧引擎路径的文档 |

#### 验收标准（PR-0E）

- [ ] `engine/src/` 中不再有 `septopus/` 目录（已移至 `_deprecated/`）
- [ ] `npm run dev`（app）和 `npm run build`（engine）无报错
- [ ] CLAUDE.md 引擎结构描述与实际目录结构一致

---

## 2. 执行顺序与依赖

```
PR-0A (Sandbox) ──→ PR-0B (Loader)  ──→ PR-0E (废弃清理)
                                              ↑
PR-0C (Publisher) ──────────────────────────┘
PR-0D (空壳补全) ──→ (评估新引擎等价实现) ──→ PR-0E
```

- **0A → 0B**：Loader 依赖 Sandbox
- **0C 独立**：可与 0A/0B 并行
- **0D 独立**：可与 0A/0B/0C 并行，只改旧引擎文件
- **0E 最后**：所有代码合并后再废弃

---

## 3. 关键技术约束

### 3.1 Worker 内不可用 dynamic import

Web Worker 标准（非 module worker）里 `import()` 不可用，因此用 `importScripts` + Blob URL 方案。若后续改为 `{ type: 'module' }` worker，则可直接用 `import()`，但浏览器兼容性需确认。

### 3.2 adjunctAPI 的 GLTF 加载

`adjunctAPI.createGLTF(uri)` 仅返回一个描述对象，**不在 Worker 内发起网络请求**。实际加载由主线程 `AdjunctSystem` 在收到 `std_3d` 结果后，识别 `type: 'gltf'`，经主线程加载并创建 mesh。这是保证沙箱不碰网络的关键设计。

### 3.3 SolanaPublisher 的钱包依赖

`SolanaPublisher` 需要钱包签名，只能在有钱包上下文的地方实例化（app 层），不应放进 engine 内部。`Engine` 通过 `EngineServices.publisher` 接收注入（已在 `Engine.ts` 中声明），保持 engine 对钱包的解耦。

### 3.4 批量提交的 Solana 上限

当前串行逐块提交。Solana 单交易可包含多个指令，`update_block` 约 200~400 字节/条，理论上单交易可打包 3~5 个。这个优化不在本 Phase 内，Phase 1 收尾时根据实际 UX 反馈再决定是否实装 versioned tx。

---

## 4. 文件变更清单

```
新增：
  engine/src/core/services/AdjunctSandbox.ts
  engine/src/core/services/AdjunctLoader.ts
  engine/src/core/services/AdjunctRegistry.ts   (内建 adjunct 类型的静态注册表)
  app/src/lib/SolanaPublisher.ts
  app/src/lib/publishDrafts.ts
  engine/src/core/services/__tests__/AdjunctSandbox.test.ts
  engine/src/core/services/__tests__/AdjunctLoader.test.ts
  app/src/lib/__tests__/SolanaPublisher.test.ts

修改：
  engine/src/core/systems/AdjunctSystem.ts      (接入 AdjunctLoader)
  engine/src/septopus/adjunct/adjunct_wall.js   (PR-0D)
  engine/src/septopus/adjunct/adjunct_water.js  (PR-0D)
  engine/src/septopus/adjunct/adjunct_sample.js (PR-0D)
  CLAUDE.md                                     (PR-0E)

移动（归档）：
  engine/src/septopus/  →  engine/_deprecated/septopus/
```

---

## 5. 未决问题（本 Phase 内需确认）

| # | 问题 | 需要谁决策 |
|---|------|-----------|
| Q1 | 新引擎中是否已有 wall/water 等 adjunct 的等价实现？若有，PR-0D 只改旧引擎意义不大，应直接看新引擎的覆盖情况 | 开发时调研确认 |
| Q2 | `adjunct_water.js` 的 STD 数据结构（raw 格式）是否有文档记录？否则 raw_std 实现无依据 | 查 SPP 文档或链上现有数据 |
| Q3 | Worker 类型用 `{ type: 'module' }` 还是经典 Worker？前者可用 dynamic import，后者需 importScripts | 确认目标浏览器兼容范围后决定 |
