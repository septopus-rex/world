# 统一错误处理 lib —— EngineError + report 门面 + 可插拔 sink

> **用途**：把当前**分散、逐点硬编码**的错误处理收敛成一个独立的 `core/errors/` lib，统一「类型化 → 决策 helper → 报告」三件事；并把「想推到 `world.events` 的错误」以**可插拔 sink** 的形式收进来（而非 lib 反向依赖 World）。目标是你提的两条：**减少硬编码、降低隐藏风险**。
>
> **由来**：核实（2026-07-01）现状 = **没有统一**。全引擎 ~27 个错误处理点（15 个 `try/catch` + 11 个 `.catch()`）各写各的策略，**0 个自定义 Error 子类**，~40 处裸 `throw new Error`。两个真实痛点：① **策略被逐点写死**（吞/warn/重试N次/降级值 全是现场字面量，tag 有的带前缀有的没有）；② **隐藏风险**——无类型 `catch(e)` 是 catch-all，会把「预期失败」和「我的代码真炸了」一起静默吞掉，最毒的标本是 `TriggerSystem.ts:226` 的 `catch { return false }`（写错一个 JSONLogic 条件 → trigger 悄悄永不触发，全链路零信号）。
>
> **两个利好发现**（核实后）：`resource.failed`（`EventTypes.ts:51`）与 `ui.show_toast` 都是**定义了却从未 emit/订阅**的死通道——本 lib 正好复活它们；`EventQueue.dispatch`（`EventQueue.ts:146`）**已在 boundary 每个订阅者外包了 try/catch + `console.error`**，是既有的最后兜底，复用不重造。
>
> **边界铁律**：lib 落 `core/errors/`，**纯 TS、零 `from 'three'`**（`grep -r "from 'three'" engine/src/core` 必须仍无输出）。纯核**不 import World 实例**，才能在帧循环之外（boot / worker / rapier init）也能用、也能独立测。
>
> **不改的底线**：本 lib 统一的是**机制 + 报告 + 类型**，**不是每个站点的策略**。`try/catch` 控制流不撤；降级值、重试次数仍由站点按参数传入。别指望 lib 替你决定「该不该重试/兜底成什么」。
>
> **状态**：✅ **P0 + P1 已落地**（`core/errors/` lib + `engine.error` 事件 + WorldEventSink + World 装配 + ResourceManager 上报 + 客户端 Toaster）；✅ **P2 batch-1 已迁**（4 个 ⚠️ 危险静默点 + AdjunctLoader retry/preload）；🔲 P2 其余站点分批待迁。测试：`tests/unit/errors.test.ts`(12) + `tests/systems/error-reporting.test.ts`(2)，全套 342 pass。
> **配套**：事件队列见 `specs/event-bus-design.md`；上轮「错误进 world.events 合理吗」的讨论结论即本文第 3 节。
>
> **落地时的两处方案微调**（比原稿更简）：
> - **§4 render→core 通道**：无需给 ResourceManager 注入 `report` 回调——`reportError` 是**全局门面**、`WorldEventSink` 由 World 全局注册，故 render 直接 `import { reportError } from '../core/errors'` 调用即可，world.events 的 emit 由全局 sink 兜底。少一层注入。
> - **§7 `TriggerSystem:226`**：用 **`attempt`** 而非 `ignore`。因为 `jsonLogic.apply` 抛的是裸 `Error`，catch 处**无法**把「畸形条件(预期)」与「jsonLogic 内部真 bug」分类（二者同形），`ignore(ConditionError)` 抓不到。改用 `attempt`：**恒上报** + 返回 false——消灭「静默」这一半（真 bug 现在至少可见），分类那一半留待条件求值上游改造。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ | 已落地 + 验证 |
| 🟡 | 方案已定，未实现 |
| 🔲 | 待办 |
| ⚠️ | 危险的静默点（隐藏 bug 高风险，迁移优先） |
| ❌ | 有意不做（附理由） |

---

## 0. 现状核实（file:line）

**处理点分布（~27）**：

| 行为 | 现场 |
|---|---|
| ⚠️ 静默吞 → 返回兜底值，**无日志** | `TriggerSystem.ts:226`(`catch{return false}`)、`AdjunctLoader.ts:109`(preload)、`ResourceManager.ts:377`(fall through) |
| ⚠️ 吞掉 → 静默删缓存，**无日志/事件** | `ResourceManager.ts:181`(model)、`:298`(texture) |
| 良性有意静默（**须保留但标类型**） | `RenderEngine.ts:868`(手势前 AudioContext 必然 suspended) |
| warn → 用默认值 / 继续 | `EditSystem.ts:522`、`Actuator.ts:175`、`DraftStore.ts:187`、`GameRuntimeSystem.ts:98`、`RenderEngine.ts:892`、`AdjunctFactory.ts:95/160/199`、`EntityFactory.ts:157` |
| warn → 保持 dirty 重试 | `DraftStore.ts:167/182/223`、`IdbDraftBackend.ts:119` |
| 重试 N 次退避 → 再 throw | `AdjunctLoader.ts:93`(retryCount 魔数) |
| rethrow / 直接 throw（**边界失败，正确**） | `ExportService.ts:49`、`ModelLoader.ts:126`、`CollapseCodec`、`DynamicAdjunct`、`AdjunctSandbox`、`ipfs/*`、`AdjunctRegistry` |
| 队列自带兜底（复用，不动） | `EventQueue.ts:146`(dispatch 每订阅者 try/catch) |

**类型**：`grep "extends Error"` = **0**。所有 catch 都是 catch-all，无法 `instanceof` 判别预期失败 vs 真 bug。
**tag**：~40 处 `throw new Error`，前缀不一致（`[ModelLoader]`/`[ipfs]`/`[DraftStore]` 有，`AdjunctSandbox`/`CollapseCodec` 无）。

---

## 1. 目标与非目标

**目标**
- **减硬编码**：错误 tag、重试/退避、降级语义走同一套 helper，站点只传「值」不重写「机制」。
- **降隐藏风险**：① 引入 Error 子类，让 catch **只吞预期类型、放真 bug 上抛**；② 消灭「静默无日志兜底」——所有兜底至少过一次 tag 化报告。
- **复活死通道**：`report` 经 sink 真正 emit `resource.failed` / 新增 `engine.error`，客户端接一个 toast。

**非目标（❌ v1 不做）**
- ❌ 上 `Result<T,E>` monad —— 对本体量太侵入，收益不抵改造。
- ❌ 日志级别过滤 / 异步 transport / 去重 / 采样 / 限流 / 错误日志持久化 —— YAGNI，真需要再加。
- ❌ `userMessage` 的 i18n —— v1 英文/中文明文即可。
- ❌ 替 `try/catch` 做控制流；替站点决定重试次数/降级值。

---

## 2. 架构：两层 + sink（world.events 是「一个装进来的 sink」）

关键结构性判断（上轮结论）：`world.events` 是**每 World 实例、帧作用域**的；lib 是**模块级无状态**的。且**有些错误发生在帧循环之外**（rapier init、worker 崩溃、boot）——若 lib 唯一出口是 `world.events`，这些错误无处可去。故分两层：

```
core/errors/
  EngineError.ts    // 【纯】基类 + 子类 + code 枚举；无 World 依赖
  report.ts         // 【纯】门面 reportError(err, ctx) → 扇出到已注册 sink；sink 注册表
  attempt.ts        // 【纯】决策 helper：attempt / retry / ignore —— 统一 try/catch 形状
  ConsoleSink.ts    // 【纯】默认 sink，恒在（boot/worker/rapier init 也能落）
  WorldEventSink.ts // 【绑定】把 report 扇给某个 world.events；由 World 构造时装入、dispose 卸载
  index.ts          // 桶导出
```

- **纯核**（`EngineError` + `report` + `attempt`/`retry`/`ignore` + `ConsoleSink`）无 World，boot 前 / worker 里 / rapier init 都能用，**错误永不丢**（至少落 console）。
- **`WorldEventSink`** 是绑定层：`World` 构造时 `report.addSink(new WorldEventSink(this.events))`，`World.dispose()` 时移除。**「推到 world.events 的逻辑确实在 lib 里」——但它是一个由 World 装入的可插拔 sink，lib 不反向 import World 实例。** 这是「clean」与「焊死」的分界。

**先例**：这就是 **logging facade + appender**（SLF4J / Python `logging` 的 handler）、**Sentry / OpenTelemetry**（一次 capture，N 个 exporter）的形状——调用方一个 API，去向可插拔、生产者与消费者解耦。

### 2.1 report 门面 + world 路由

```ts
// report.ts（纯核，签名示意）
export interface ErrorContext {
  tag: string;                 // '[TriggerSystem]' 等，统一前缀
  severity?: 'fatal' | 'error' | 'warn' | 'debug';  // 默认 'error'
  world?: WorldRef;            // 有则路由到该 world 的 WorldEventSink；无则 console-only
  kind?: string; id?: string;  // 资源类：'model'|'texture'|... + id
}
export interface Sink { report(err: EngineError, ctx: ErrorContext): void; }

const sinks: Sink[] = [new ConsoleSink()];   // ConsoleSink 恒在
export function addSink(s: Sink): () => void { /* push + 返回移除函数 */ }
export function reportError(err: unknown, ctx: ErrorContext): EngineError {
  const e = EngineError.from(err, ctx);      // 裸 Error 包成 EngineError（保留 cause）
  for (const s of sinks) s.report(e, ctx);   // 扇出
  return e;                                   // 便于 helper 拿回类型化结果
}
```

- **多 World**：`WorldEventSink` 持有自己的 `events` 引用；只对 `ctx.world === 自己的 world` 的错误 emit（其余略过）。无 `ctx.world` 的错误 → 仅 `ConsoleSink`。单 World（生产常态）无需操心。
- **模块级注册表**可重置（测试 `report.reset()`），WorldEventSink 随 World 生命周期增删——沿用引擎既有的模块级状态惯例（如 rapier `initTumblePhysics` 的 `_rapierReady`）。

### 2.2 WorldEventSink：复活 `resource.failed` + 新增 `engine.error`

```ts
// WorldEventSink.ts（绑定层）
export class WorldEventSink implements Sink {
  constructor(private events: EventQueue) {}
  report(err: EngineError, ctx: ErrorContext) {
    if (err.kind && err.id)                    // 资源类 → 复活既有 resource.failed
      this.events.emit('resource.failed', { kind: err.kind as any, id: err.id, error: err.message });
    this.events.emit('engine.error', {         // 通用通道（新增，见 §3）
      code: err.code, severity: ctx.severity ?? 'error',
      message: err.message, userMessage: err.userMessage, kind: err.kind, id: err.id,
    });
  }
}
```

> **帧作用域注意**：`emit` 只 append，真正派发在 `World.step` 尾的 `flushBoundary()`。帧循环内 emit → 同帧 boundary 送达（OK）。**帧循环外**（World 未 step）emit 的 `engine.error` 会**滞留到下次 step 才 flush**；若此时根本没有 step（boot 失败、致命 init），**只有 `ConsoleSink` 保证送达**——这正是「纯核恒有 ConsoleSink」的意义，不要把致命 init 错误的唯一出口寄望在帧队列上。

---

## 3. 事件接线

**新增一个事件类型**（`EventTypes.ts` 加一行）：

```ts
// ── error（typed-error 通用通道；WorldEventSink 产出）──
'engine.error': { code: string; severity: 'fatal'|'error'|'warn'|'debug';
                  message: string; userMessage?: string; kind?: string; id?: string };
```

**复活既有**：`resource.failed`（`EventTypes.ts:51`，形状不变）由 WorldEventSink 对资源类错误 emit。
**不动**：`actuator.settled.error`（已有 `error?: string` 字段，保留其现有语义）。

**客户端接一个 toast**（最小）：新增一个 `<Toaster>`，`engine.on('engine.error', ...)` 按 `severity ≥ 'error'` 且带 `userMessage` 弹提示；`resource.failed` 可单独提示「资源加载失败」。复用 `Engine.on` 既有桥（`Engine.ts:490`，客户端已用 `engine.on('inventory.updated'/'block.need'/...)`）。`ui.show_toast` 死通道可留待通用 toast 再统一，v1 直接订阅 `engine.error` 即可。

---

## 4. render → core 上报通道（必须解决）

**问题**：`ResourceManager`（render 层）构造签名只有 `(datasource, config)`，**拿不到 `world.events`**，所以现在 model/texture 加载失败只能 `promise.catch(() => 删缓存)`**静默**（`ResourceManager.ts:181/298`）。

**方案**：render **可以** import `core/errors`（core 是下层，纯 TS 无 Three，不破边界）——所以 ResourceManager 直接 `reportError(err, {tag:'[ResourceManager]', kind, id})` 就能落 ConsoleSink（至少不再静默）。但要路由到 **world.events** 需要 `ctx.world`；ResourceManager 无 world 引用。故：

- ResourceManager `config` 增一个可选 `report?: (err, ctx) => void`（由 World/RenderPipeline 注入，闭包携带 `world`）。未注入时回退到纯 `reportError`（console-only）。
- 落地即让 `resource.failed` 通道**首次真正 emit** + 传到客户端 toast。

> 保持「render 不 import World 实例」——注入的是一个已绑好 world 的回调，不是 World 本身。

---

## 5. EngineError 分类（从真实站点归纳）

```ts
// EngineError.ts
export type ErrorCode =
  | 'RESOURCE_LOAD' | 'RESOURCE_MISSING' | 'RESOURCE_FORMAT'
  | 'ADJUNCT_VALIDATE' | 'ADJUNCT_DESCRIPTOR' | 'ADJUNCT_REGISTRY'
  | 'PROTOCOL_DECODE' | 'PROTOCOL_EXPORT'
  | 'PERSIST_IDB'
  | 'PHYSICS_INIT'
  | 'CONDITION_EVAL'
  | 'UNKNOWN';

export class EngineError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;     // 包裹的原始错误，保留栈
  readonly kind?: string;       // 'model'|'texture'|'audio'|'cid' —— 资源类
  readonly id?: string;
  readonly userMessage?: string;// 给 toast 的人话（可选）
  static from(e: unknown, ctx): EngineError { /* 裸 Error/字符串 → 包成 EngineError */ }
}
export class ResourceError   extends EngineError {} // RESOURCE_*：ResourceManager/ModelLoader/ipfs/AdjunctLoader
export class AdjunctError    extends EngineError {} // ADJUNCT_*：Sandbox/DynamicAdjunct/Registry
export class ProtocolError   extends EngineError {} // PROTOCOL_*：CollapseCodec/ExportService
export class PersistenceError extends EngineError {}// PERSIST_IDB：DraftStore/IdbDraftBackend
export class PhysicsError    extends EngineError {} // PHYSICS_INIT：rapier（Tumble 是触发这条的由头）
```

> 子类少而稳，够 catch `instanceof` 判别即可，不追求穷尽。裸 `throw new Error` 的边界校验（ExportService/ModelLoader/Sandbox 的格式/大小检查）迁成对应子类，`throw` 语义**不变**（边界失败就该 fail loud）。

---

## 6. 三个 helper（机制统一，策略仍在站点）

```ts
// attempt.ts
// 1) 吞 + 兜底：替「swallow → fallback」的静默 catch。ALWAYS 报告 → 消灭无日志静默。
attempt<T>(ctx: ErrorContext, fn: () => T, fallback: T): T
attemptAsync<T>(ctx, fn: () => Promise<T>, fallback: T): Promise<T>

// 2) 重试退避：替 AdjunctLoader 手写的 retry 循环（tries/backoff 传入，不再魔数内联）。
retry<T>(ctx, fn: () => Promise<T>, opts: { tries: number; backoffMs?: number }): Promise<T>

// 3) 只吞预期类型：替「有意静默」——只吞 expected 子类，其余 rethrow。
//    这是止血 catch-all 吞真 bug 的关键。RenderEngine:868 音频那种良性静默用它。
ignore<T>(expected: new (...a:any[]) => EngineError, fn: () => T, fallback: T): T
```

- **`attempt` 恒报告**（默认 severity `warn`）——从此没有「真静默」的兜底。降级值 `fallback` 由站点传，策略不被 lib 夺走。
- **`ignore`** 只对 `expected` 类型返回 `fallback`，捕到别的（真 bug）**继续抛**——直接解决「catch-all 吞掉自己代码的 TypeError」这个隐藏风险。

> **⚠️ 每帧热路径别用 `attempt` 包**（落地踩坑，已修）：`attempt(ctx, fn, fb)` 每次调用会 **新建 ctx 对象字面量 + 一层闭包/函数调用**。放在**每帧**跑的判定里（如 `TriggerSystem._evalConditions`，玩家靠近带 conditions 的 trigger 时每帧求值）会引入微小但**非零**的每帧开销——在 SwiftShader 软渲染的 e2e 机器上足以把一个**临界**的真·canvas 点击 actionability 从 5/5 掀到 2/6（实测：baseline 5/5、`attempt` 版 2/6、内联版 3/3）。**热路径改用内联 `try/catch` + `reportError(e, HOISTED_CTX)`**（ctx 提到 static 常量，成功路径与 baseline 逐字节等价，只在 catch 里报告）。`attempt` 留给非每帧的调用点。

---

## 7. 迁移清单（~27 站点 → 目标 helper）

按目标分组；⚠️ = 危险静默点，**优先迁**。

| 站点 | 现状 | 迁到 | 备注 |
|---|---|---|---|
| ⚠️ `TriggerSystem.ts:226` | `catch{return false}` 静默 | `ignore(ConditionError, …, false)` | **区分**：JSONLogic 求值失败(预期)吞→false；jsonLogic 内部真 bug 上抛。标本级隐患 |
| ⚠️ `ResourceManager.ts:181` | 删 model 缓存，静默 | `attempt` + `resource.failed` emit | 复活死通道 + 客户端 toast |
| ⚠️ `ResourceManager.ts:298` | 删 texture 缓存，静默 | 同上 | |
| ⚠️ `AdjunctLoader.ts:109` | preload 静默吞 | `attempt`(severity `debug`) | preload 失败可容忍，但要留痕 |
| `ResourceManager.ts:377` | fall through to gateway | `ignore` | 有后备路径，标预期类型即可 |
| `RenderEngine.ts:868` | 空 catch（良性） | `ignore(AudioSuspendError,…)` | 保留静默，但**标类型**使其可审计 |
| `AdjunctLoader.ts:93` | 手写 retry 循环 | `retry({tries, backoffMs})` | retryCount 魔数 → 参数 |
| `ExportService.ts:49` | catch → `throw` | `throw ProtocolError` | 边界，throw 语义不变 |
| `ModelLoader.ts:126` | computeBounds catch → warn 空 bounds | `attempt` + `ResourceError`(warn) | 降级空 bounds 保留 |
| `DraftStore.ts:167/182/223` | warn + 保持 dirty | `reportError` + 保留 dirty 策略 | `PersistenceError`；重试策略不动 |
| `IdbDraftBackend.ts:119` | catch(e) | `reportError`(`PERSIST_IDB`) | |
| `DraftStore.ts:187`（`.catch`） | warn saveMeta | `reportError` | |
| `Actuator.ts:175`（`.catch`） | warn sound | `reportError` | |
| `RenderEngine.ts:892`（`.catch`） | warn audio load | `reportError`(`ResourceError`, kind `audio`) | 顺带走 resource.failed |
| `GameRuntimeSystem.ts:72/98/109` | warn | `reportError` | |
| `AdjunctFactory.ts:95/160/199` | catch/`.catch` | `reportError`(`AdjunctError`) | |
| `EntityFactory.ts:157`（`.catch`） | catch(err) | `reportError` | |
| `AdjunctSandbox.ts:97` + 校验 throw | worker 错误 + `throw` | `AdjunctError` | 校验 throw 语义不变 |
| `DynamicAdjunct` / `AdjunctRegistry` / `CollapseCodec` / `ipfs/*` throw | 裸 `throw new Error` | 对应子类 throw | 只换类型 + tag，行为不变 |
| `EventQueue.ts:146` | dispatch 每订阅者兜底 | **不动**（可选：内部改走 `reportError`） | 队列自身的最后兜底 |

---

## 8. 边界合规

- `core/errors/*` 纯 TS，**无 `from 'three'`**：`grep -r "from 'three'" engine/src/core engine/src/plugins` 落地后仍须无输出。
- `WorldEventSink` import `EventQueue` 类型（core 内，合法）；不 import Three、不 import render。
- render（`ResourceManager`）import `core/errors`（下层纯模块）合法；注入的是绑好 world 的回调，render **不** import World 实例。
- 纯核**不 import World 实例**（只在 `ErrorContext.world` 里以 `WorldRef` 弱类型携带，或干脆只存 world 的 events 引用于 sink）。

---

## 9. 分期

- **P0 — lib 骨架（零行为变更）** ✅：`EngineError` + 6 子类 + `reportError` + `ConsoleSink` + `attempt/attemptAsync/retry/ignore` + `index` + `tests/unit/errors.test.ts`(12)。纯新增。
- **P1 — 接线** ✅：`EventTypes` 加 `engine.error`；`WorldEventSink` + `World` 构造 `addSink`/`dispose` 卸载；`ResourceManager` 两个静默 catch → `reportError`（**首次真正 emit `resource.failed`**）；客户端 `<Toaster>`（App 挂载）订阅 `engine.error`+`resource.failed`；`tests/systems/error-reporting.test.ts`(2)。
- **P2 — 迁移站点（分批）** 🟡：✅ batch-1 = 4 个 ⚠️ 危险静默点（`TriggerSystem` 条件求值、`ResourceManager` model/texture 掉缓存、`AdjunctLoader` verifyCodeHash）+ `AdjunctLoader.fetchFromIPFS`→`retry` + `preload`→`reportError`。🔲 待迁：`ExportService`/`ModelLoader`/`CollapseCodec`/`DynamicAdjunct`/`AdjunctSandbox`/`ipfs`/`AdjunctRegistry` 的 throw→typed；`DraftStore`/`IdbDraftBackend`/`Actuator`/`GameRuntimeSystem`/`AdjunctFactory`/`EntityFactory`/`RenderEngine` 的 warn→`reportError`；`EditSystem:522`、`RenderEngine:868`(→`ignore`)、`ResourceManager:377`(→`ignore`)。每批跑全套测试。

---

## 10. 验证

- **单测**（`engine/tests/unit/`）：`EngineError.from` 包裹/保留 cause；`attempt` 恒报告 + 返回 fallback；`ignore` 只吞 expected、rethrow 其余（**回归防线**：喂一个非 expected 错误必须抛出）；`retry` 次数/退避；`report` 多 sink 扇出 + `reset`。
- **systems 测**：headless World 装 `WorldEventSink`，触发一个 `ResourceError` → 断言 `resource.failed` + `engine.error` 各 emit 一次（reader 断言）。
- **e2e**（可选，后期）：喂坏资源 id → 客户端 toast 出现。
- **边界**：`grep -r "from 'three'" engine/src/core` 无输出；`yarn build`（tsc）绿；client `tsc` 绿。

---

## 11. 关键文件（落地后）

**新增**：`core/errors/{EngineError,report,attempt,ConsoleSink,WorldEventSink,index}.ts`、`client/desktop/src/components/Toaster.tsx`。
**改**：`core/events/EventTypes.ts`(+`engine.error`)、`core/World.ts`(构造装 sink / dispose 卸)、`render/ResourceManager.ts`(注入 `report` 回调)、§7 表列出的 ~27 站点（分批）。
**复用不改**：`core/events/EventQueue.ts`(`resource.failed` emit 通道、dispatch 兜底)、`Engine.ts`(`on` 桥)。
