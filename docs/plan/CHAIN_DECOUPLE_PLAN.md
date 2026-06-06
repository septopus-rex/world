# 链剥离实施计划 · 纯 3D 创作引擎（Chain Decoupling Plan）

> 目标：把"链"从引擎的**运行前提**降级为**可选发布插件**。引擎在零钱包、零网络、零链的环境下，能完整地创建内容、跑触发器/小游戏；"上链"只发生在用户显式提交某个选中 block 时。
>
> 状态：设计稿（Plan）。本文聚焦 `engine/src/`（新 TS ECS 引擎，即 `app/` 实际运行的引擎）。`engine/dist/septopus/`（旧 JS 引擎）作为参考实现引用。

---

## 0. 结论先行（TL;DR）

这不是一次重构，而是**补完已有接缝 + 把本地路径升为默认**。理由：链在新引擎里已经被隔离在 **3 个服务接口**之后，编辑链路本身**零链写入**：

| 关注点 | 已有接缝 | 文件 |
|---|---|---|
| 读数据（世界/区块/模型/贴图） | `IDataSource` | `engine/src/core/services/DataSource.ts` |
| 写数据（选中 block 上链） | `IChainPublisher`（`uploadData → commitBlock`） | `engine/src/core/services/IChainPublisher.ts` |
| 本地草稿持久化 | `DraftStorage`（`save/load/list/remove`） | `engine/src/core/services/DraftStorage.ts` |
| SPP 二进制 ↔ 本地 STD | `CollapseCodec` | `engine/src/core/protocol/CollapseCodec.ts` |
| 触发器执行（引擎内） | `TriggerSystem.executeAction` | `engine/src/core/systems/TriggerSystem.ts` |

需要新增/补完的只有 **2 处 stub + 1 个默认装配**：
1. **Trigger 的 `contract` 动作分支**（目前只有 `adjunct`/`system.log`）→ 接一个可插拔 `IActuator`，纯模式注入 `LocalActuator`（本地模拟）。
2. **资源（贴图/模型）解析器** `IResourceResolver` → 纯模式指向 OSS / IPFS 网关 URL。
3. **`PureMode` 默认装配**：`LocalDataSource` + `DraftStorage` + `null` 发布器 + `LocalActuator` + `OSSResourceResolver`，在 `Engine` 构造时注入。

完成后：`npm run dev` 不连钱包即是一个独立的 3D 创作器；"上链"是叠加在其上的一个开关。

---

## 1. 现状：链耦合点全景

### 1.1 两套引擎（必须先澄清）
- **新引擎 `engine/src/`（go-forward，本计划目标）**：TS + ECS。`app/src/SandboxLoader.ts` → `new Engine()` 即跑这套。已含 `IDataSource`/`IChainPublisher`/`DraftStorage`/`EditSystem`/`CollapseCodec`/`TriggerSystem`。
- **旧引擎 `engine/dist/septopus/`（参考）**：`VBW` 全局框架 + `world.js` 生命周期。链同样只走两个口：读 `VBW.datasource.*`、写 `VBW.datasource.contract.run/call(...)`（启动时由 `cfg.contract`/`cfg.actuator` 注入，见 `world.js:504-508`）。

> 重要事实：旧引擎的 `World.edit/select/modify`（`world.js:1003-1133`）**全部是 `VBW.cache.set` 内存操作，整条编辑链零链写入**；新引擎同理。所以"本地编辑独立于链"在两套引擎里都已经成立。

### 1.2 新引擎当前的链触点（穷举）
- `app/src/SandboxLoader.ts:171 fetchBlock()`：`SeptopusContract.isReady()` 为假 → `fetchMockBlock()`；为真 → 链读 → `IPFS.get(CID)` 或内联 JSON。**已经是"链→IPFS→本地 mock 兜底"。**
- `app/src/hooks/useSeptopusEngine.ts:15`：`SeptopusContract.set(wallet)` 把钱包注入合约层。
- `app/src/lib/contract.js`：真正的 Solana(Anchor) 实现，`info.block/world`（读）+ `actions.mint/update/sell/buy/withdraw`（写）。
- `engine/src/core/services/IChainPublisher.ts`：发布接口（**尚无具体实现接入引擎主流程**）。
- `engine/src/core/systems/TriggerSystem.ts:119-123`：`action.type === 'system' && method === 'log'` 只打日志；**无 contract 分支**。

### 1.3 一句话总结
> 链已经被收敛到"边界服务"层。引擎核心（World/ECS/Render/Edit/Trigger）不 import 任何 `@solana/*`。剥离的工作量主要在**装配层**与**两个未完成的 stub**，而非核心逻辑。

---

## 2. 目标架构：本地优先，链作为可选发布插件

```
                    ┌─────────────────────────────────────────┐
                    │              Engine (engine/src)          │
                    │   World · ECS · Render · EditSystem ·     │
                    │   TriggerSystem · CollapseCodec           │
                    └───────────────┬───────────────────────────┘
                                    │ 仅依赖接口，不依赖实现
        ┌───────────────┬──────────┼───────────┬────────────────┐
        ▼               ▼          ▼           ▼                ▼
  IDataSource     IResourceResolver  IActuator   DraftStorage   IChainPublisher
   (读区块)        (贴图/模型 URL)   (trigger调用) (本地草稿)      (可选上链)
        │               │          │           │                │
   ┌────┴────┐     ┌────┴────┐  ┌──┴───┐    （本地）        ┌────┴────┐
   │Local/   │     │OSS /    │  │Local │                   │Solana   │
   │Mock     │     │IPFS网关 │  │Actuat│                   │Publisher│
   │(纯模式) │     │         │  │or    │                   │(可空)   │
   └─────────┘     └─────────┘  └──────┘                   └─────────┘
```

- **纯模式（`mode: 'pure'`）**：装配 `LocalDataSource` + `OSSResourceResolver` + `LocalActuator` + `DraftStorage` + `publisher = null`。完全离线可跑、可编辑、可玩。
- **链模式（`mode: 'onchain'`）**：把上面任意几项换成链实现（`ChainDataSource`、`SolanaPublisher`、`ChainActuator`），**不改引擎核心、不改内容数据**。
- 切换是**依赖注入**，不是分支代码。

---

## 3. 核心数据流：本地编辑 → 草稿 → （可选）上链

```
[编辑]                          [本地持久化]                 [可选·显式提交]
EditSystem / EditTaskExecutor → DraftStorage.save(world,x,y,raw)
   (内存 STD 改动)                 (localStorage 草稿)
                                       │
                                       │  用户点击"提交选中 block"
                                       ▼
                              CollapseCodec.encode(raw)  → SPP 二进制 / JSON
                                       ▼
                       IChainPublisher.uploadData(raw) → CID   (IPFS/OSS)
                                       ▼
                       IChainPublisher.commitBlock("x_y", CID) → txHash
                                       ▼
                              DraftStorage.remove(world,x,y)
```

- 纯模式下后三步不存在：编辑结果停在 `DraftStorage`（甚至可导出 JSON 文件），世界照常运行。
- `DraftStorage.remove()` 的注释已写明"上链成功后删除"——说明这套流程本就是设计意图，本计划只是把它接通并设为可关闭。

---

## 4. 专项一：Trigger 保留链指针 + 本地模拟

**需求**：trigger 仍然携带"指向链上合约"的能力，但纯模式下用本地逻辑模拟，不真正发链。

### 4.1 现状
- 旧引擎 trigger 数据里 `contract: d[6]`（`basic_trigger.js:124`，对应 `RAW_CONTRACT_ID_ON_CHAIN`）——**指针字段本就存在**。
- 新引擎 `TriggerSystem.executeAction()` 只实现了 `adjunct`（本地改物体）和 `system.log`，**缺 contract 分支**。

### 4.2 改造方案（不改变 trigger 数据格式，向前兼容）

1) 新增执行器接口：
```ts
// engine/src/core/services/IActuator.ts
export interface ActuatorContext { contractId?: string | number; world?: number; block?: string; }

export interface IActuator {
  /** 派发一个具名的合约/外部方法，返回结果或抛错 */
  run(method: string, params: any[], ctx?: ActuatorContext): Promise<any> | any;
}
```

2) 扩展动作类型（联合类型里加 `'contract'`）：
```ts
// engine/src/core/components/TriggerComponent.ts
export interface TriggerAction {
  type: 'adjunct' | 'system' | 'contract';   // ← 新增 'contract'
  contractId?: string | number;              // ← trigger 保留的链上合约指针
  target?: string | number;
  method: string;
  params: any[];
}
```

3) `TriggerSystem` 注入 actuator，补分支：
```ts
// TriggerSystem.executeAction(...)
else if (action.type === 'contract') {
  // 纯模式 → LocalActuator 模拟；链模式 → ChainActuator 真发
  this.actuator?.run(action.method, action.params, { contractId: action.contractId });
}
```
（`actuator` 经 `World` 服务注册表或 `TriggerSystem` 构造参数注入。）

4) 两个实现：
```ts
// LocalActuator —— 纯模式默认。本地模拟：打印 + 改本地状态 + 返回可配置结果
class LocalActuator implements IActuator {
  run(method, params, ctx) {
    console.log(`[LocalActuator] simulate contract#${ctx?.contractId} ${method}`, params);
    return this.sim[method]?.(params) ?? { ok: true, simulated: true };
  }
}
// ChainActuator —— 链模式。包住 app/src/lib/contract.js 的 SeptopusContract / IChainPublisher
class ChainActuator implements IActuator {
  run(method, params) { return SeptopusContract.call(method, undefined, params); }
}
```

**效果**：同一个世界、同一份 trigger 数据，纯模式下"调合约"被本地模拟（可做完整小游戏逻辑回路），日后只需把注入的 actuator 从 `LocalActuator` 换成 `ChainActuator`，无需改内容。这正是"保留指针、先模拟"。

---

## 5. 专项二：贴图/资源走 OSS

**先回答你的问题：IPFS 能不能看成一种 OSS？**

> **可以——在"按 key/URL 取一个不可变 blob"这个用途上，IPFS 与 OSS 等价。** 但要注意两点差异，它们决定纯模式 vs 链模式分别该用哪个：

| | OSS（S3 / 阿里云 OSS / 静态托管） | IPFS |
|---|---|---|
| 寻址 | 位置寻址（bucket+key，可变） | 内容寻址（CID，不可变） |
| 取数 | HTTP GET（自带网关） | HTTP GET via 网关（`gateway/ipfs/<CID>`） |
| 适合 | 纯本地/开发期、可频繁覆盖的资源 | 上链：把 CID 写进合约，做内容存证 |

结论：对引擎渲染层而言，**两者都只是"给我一个能 fetch 的 URL"**——所以抽象成同一个解析器、后端可换即可。纯模式用 OSS（简单、可改）；上链时用 IPFS（CID 进链，与 `IChainPublisher` 的 `uploadData→CID` 对齐）。

### 5.1 现状
- 资源在数据里是 `RESOURCE_ID`（数字），mock 把它映射成路径，如 `Design.texture()` 返回 `{ raw: "texture/grass.jpg", repeat:[1,1] }`。渲染层按这个路径加载——**已经是"按 id→URL 取资源"的形态**。

### 5.2 改造方案
```ts
// engine/src/core/services/IResourceResolver.ts
export interface ResolvedTexture { url: string; repeat?: [number, number]; }
export interface ResolvedModule  { url: string; format: string; }

export interface IResourceResolver {
  texture(id: number | string): ResolvedTexture;
  module(id: number | string): ResolvedModule;
}
```
两个后端：
```ts
// OSSResourceResolver(baseUrl)  → `${base}/texture/${id}.jpg`     （纯模式默认）
// IPFSResourceResolver(gateway, cidMap) → `${gateway}/ipfs/${cidMap[id]}` （上链/存证）
```
- `IDataSource.texture()/module()` 内部改为委托给 `IResourceResolver`，渲染层不变。
- `app/src/config.js` 已有 `ipfs.gateway: http://localhost:8080`，纯模式再加一个 `oss.base`（或直接用本地静态目录 `/assets`）。

---

## 6. 分阶段实施计划

> 每阶段都可独立验收，且做完即能 `npm run dev` 离线运行不退化。

### Phase 0 — 接缝盘点与冻结（0.5d）
- 产出：在 `Engine` 构造签名里固化依赖注入位（`{ dataSource, resourceResolver, actuator, draftStorage, publisher }`），缺省全部走纯模式实现。
- 验收：`grep` 确认 `engine/src/**` 无任何 `@solana/*`、`SeptopusContract` 直接 import（链实现只允许出现在 `app/` 或 `*Chain*` 适配器里）。

### Phase 1 — LocalDataSource 一等公民化（1d）
- 把 `SandboxLoader.fetchBlock` 的 mock 兜底抽成正式 `LocalDataSource`（读 `DraftStorage` 优先，其次内置 `BlockMocks`）。
- 编辑保存：`EditSystem` 提交 → `DraftStorage.save`；重进世界 `LocalDataSource` 先读草稿。
- 验收：无钱包下编辑一个 block、刷新页面，改动仍在。

### Phase 2 — Trigger 本地 actuator（1d，专项一）
- 落地 `IActuator` + `LocalActuator`，`TriggerComponent.TriggerAction` 加 `'contract'`，`TriggerSystem` 补分支并注入。
- 验收：做一个"踩到触发器 → 调 `contract#X.buy()` → 本地模拟返回成功 → 弹 toast/改物体"的小游戏回路，全程离线。

### Phase 3 — 资源走 OSS（0.5d，专项二）
- 落地 `IResourceResolver` + `OSSResourceResolver`，`IDataSource.texture/module` 委托之。
- 验收：贴图从 OSS/静态 URL 加载；切到 `IPFSResourceResolver` 仅改注入不改渲染。

### Phase 4 — 上链作为可选插件（1.5d）
- 落地 `SolanaPublisher implements IChainPublisher`（`uploadData` 走 IPFS pin，`commitBlock` 走 `contract.js` 的 `update_block`）。
- 接通"提交选中 block"按钮：`DraftStorage → CollapseCodec.encode → publisher.uploadData → commitBlock → DraftStorage.remove`。
- 验收：纯模式 `publisher=null` 时该按钮隐藏/禁用；链模式下能把一个本地草稿提交上 devnet。

### Phase 5 — 双构建产物（1d）
- `engine` 暴露两个入口/打包目标：`septopus-engine`（纯，tree-shake 掉链依赖）与 `septopus-onchain`（含适配器）。
- 验收：纯包 bundle 不含 `@solana/web3.js`、`@coral-xyz/anchor`（bundle 分析确认）。

---

## 7. 打包与构建模式

- **运行期开关**：`new Engine(container, { mode: 'pure' | 'onchain', ...services })`；`mode` 仅决定默认装配，不写散落的 `if(chain)`。
- **编译期裁剪**：纯模式入口不 import 任何 `*Chain*`/`*Solana*` 适配器，使打包器自然 tree-shake 掉 `@solana/*`，得到一个零链依赖的纯 3D 引擎包（可独立分发，结合 SPP 即"快速 3D 内容构建器"）。
- `app/` 保留链模式装配；未来可再出一个 `app-lite/` 或 storybook 跑纯模式。

---

## 8. 风险与待定决策

1. **目标引擎确认（需拍板）**：本计划以新引擎 `engine/src/` 为准（`app/` 实际运行的就是它）。旧引擎 `engine/dist/septopus/` 的 `World.edit/modify/trigger` 更完整但是 JS。若编辑能力要先在旧引擎补齐再迁移，计划的 Phase 1/2 需调整落点。**默认：只做新引擎，旧引擎仅作参考。**
2. **CollapseCodec 一致性**：本地 STD ↔ 链上 SPP 二进制必须用同一份编解码（`CollapseCodec.ts`），否则"本地编→上链→拉回"会丢信息。需补一个 round-trip 单测作为 Phase 4 前置。
3. **LocalActuator 的模拟边界**：链上合约可能有状态/经济逻辑（价格、所有权）。本地模拟只能近似；要明确"哪些方法可模拟、哪些仅占位"，并在 UI 标注 `simulated`。
4. **资源 ID 的双向映射**：`RESOURCE_ID ↔ OSS key ↔ IPFS CID` 需要一张映射表（上链存 CID，开发用 key）。建议一个 `resources.manifest.json` 作为单一事实源。
5. **draft 与链数据的冲突合并**：同一 block 本地有草稿、链上也更新了，进入世界时以谁为准？建议默认"本地草稿优先 + 显式标记 dirty"，上链成功才清。

---

## 附：关键文件索引

| 角色 | 文件 |
|---|---|
| 读接缝 | `engine/src/core/services/DataSource.ts` |
| 写/发布接缝 | `engine/src/core/services/IChainPublisher.ts` |
| 本地草稿 | `engine/src/core/services/DraftStorage.ts` |
| SPP 编解码 | `engine/src/core/protocol/CollapseCodec.ts` |
| 触发器执行 | `engine/src/core/systems/TriggerSystem.ts` |
| 编辑流水线 | `engine/src/core/systems/EditSystem.ts`、`core/EditTaskExecutor.ts`、`core/EditHistory.ts` |
| 引擎装配/入口 | `engine/src/Engine.ts`、`engine/src/index.ts` |
| 前端装配（链） | `app/src/SandboxLoader.ts`、`app/src/hooks/useSeptopusEngine.ts`、`app/src/lib/contract.js` |
| 旧引擎参考（注入口） | `engine/dist/septopus/core/world.js:504-508`、`io/api.js`、`adjunct/basic_trigger.js` |
| 新增（本计划） | `services/IActuator.ts`、`services/LocalActuator.ts`、`services/IResourceResolver.ts`、`services/OSSResourceResolver.ts`、`services/SolanaPublisher.ts` |
