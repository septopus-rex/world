# Septopus 事件总线最终设计 — 帧作用域事件队列 + 实体定向路由（综合定稿）

> **定稿基底**：以「事件即数据」的帧作用域双缓冲队列（ecs-idiomatic）为骨架——`emit` 在任何上下文都只追加数据、永不同步执行回调，这使重入、派发栈内销毁实体、外部代码混入帧中等整类故障**结构性不可能**，而非靠纪律约束。
> **修补与嫁接**：补齐定向订阅的生命周期清理（dropTarget + 反向索引）、稳定内容地址键（`blk:/adj:/plr:`）、emit 时刻的 mode 戳、`scope()` 分组退订、`oneTime`/`holdDuration`/`gameOnly` 的协议语义修正（独立排期）、b4 stop 的内容可编程化；迁移计划改为**逐通道小步**（每通道的发射点 + 消费者原子迁移，新旧总线共存），消除一次性大改；`read()` 默认返回新数组消灭 scratch 锋利边；并把"core 内禁止边界回调"从口头约定机制化为 CI 守护测试。

---

## 1. 设计目标与原则

### 1.1 目标（按优先级）

1. **确定性**：同一初始状态 + 同一 `Engine.step(dt)` 序列 + 同一外部注入事件序列 ⇒ **逐字节相同的事件日志**。事件只在 `World.step()` 内的固定点流动；帧外（UI 线程、DOM 点击、Promise 回调、未来网络入站）发出的事件被规整到帧边界。
2. **headless 可测**：`engine/src/core/events/` 纯 TS——零 Three.js、零 DOM、零 Worker、零 rAF、零 wall-clock。vitest node 环境直接可用；reader 本身就是测试捕获工具。
3. **对象级绑定**（兑现 `docs/systems/trigger.md:19-21` 的承诺）：既支持运行时 `EntityId` 定向，也支持跨块流入流出存活的**稳定内容地址**（`adj:adj_2025_619_2_0`），派发是 O(1) 键查找，不是广播+逐个过滤。
4. **内容创作就绪**：trigger 的 `touch`、stop 的 `on/leave/beside`、block 的完整生命周期全部成为可挂 JSONLogic 逻辑节点的一等公民；core 内的"在实体上挂处理逻辑"以**组件数据（TriggerComponent.events）+ 系统按 target 路由**实现，不以回调实现。
5. **多人就绪**：每个事件带 `actor`（行为参与者）；触发器状态按参与者实体记账（protocol/cn/trigger.md:29）。
6. **迁移无 flag-day**：新旧总线共存，逐通道原子迁移（每通道发射点 1 处 + 消费者 1-2 处），每步绿灯可回滚，带 grep 归零的别名退场判据。

### 1.2 原则

- **emit 永不执行回调**。系统侧消费是**拉模型**（持久 `EventReader` + 游标）；回调只存在于引擎边界（Engine 门面 / React UI / DesktopLoader / 未来网络），且仅在帧末 `flushBoundary()` 一个固定点派发。**不提供同步派发逃生口**——一旦提供必被滥用回今天的局面；帧内即时性由"下游同帧可见"的游标语义提供（§5）。
- **事件表达"沿"（edge），不表达"电平"（level）**：悬停高亮留在 `RaycastTargetComponent.isHovered` 组件突变；触发器体积检测留在 TriggerSystem 的轮询数学；只有进/出/接触/点击这类离散事实产生事件。此纪律写入 `core/events/index.ts` 模块注释。
- **事件用于"事实广播 + 解耦消费"，不用于"带返回值的命令"**：`Engine.removeBlock → BlockSystem.removeBlock` 这类门面直调保留。
- **payload 纯数据**（structured-clone 安全）是除 `ui.*` 之外所有分类的硬约定（沙箱/网络/录制的前提），dev 模式在边界处用 `structuredClone` 试探强制。
- **不借迁移偷改内容语义**：`oneTime`/`hold` 的协议修正是独立排期的语义 PR（§7 PR-7），与总线迁移严格分离。

---

## 2. 核心 API（TypeScript 草图）

### 2.1 类型与信封 — `engine/src/core/events/EventTypes.ts`

```ts
import type { EntityId } from '../World';
import type { SystemMode } from '../types/SystemMode';

/** 事件名 → payload 形状的唯一权威映射。新增事件 = 加一行（编译期强约束）。 */
export interface EventMap {
    // ── system ──
    'system.init':          { worldIndex: number };
    'system.launch':        {};
    'system.mode':          { mode: SystemMode; oldMode: SystemMode };
    'system.preload':       { scope: 'all' | 'block' };
    // ── block ──
    'block.in':             { block: [number, number]; key: string; prev: [number, number] | null };
    'block.out':            { block: [number, number]; key: string; next: [number, number] };
    'block.loaded':         { x: number; y: number; adjunctCount: number; isDraft: boolean };  // target=block eid
    'block.unload':         { x: number; y: number; adjunctIds: string[] };                    // target=block eid
    'block.need':           { center: [number, number]; key: string };
    // ── trigger ──
    'trigger.fired':        { eventType: 'in'|'out'|'hold'|'touch'; pass: boolean;
                              actionCount: number; oneTimeConsumed: boolean };                 // target=trigger eid
    'trigger.touch':        { point: [number, number, number]; distance: number };             // target=trigger eid
    // ── stop ──
    'stop.on':              { face: 'top'; adjunctId?: string };                               // target=solid eid
    'stop.leave':           { adjunctId?: string };
    'stop.beside':          { axis: 0 | 2; adjunctId?: string };
    // ── player ──
    'player.state':         { block: [number, number]; position: number[]; rotation: number[] };
    'player.fall':          { drop: number; position: [number, number, number] };
    'player.death':         { drop: number; position: [number, number, number] };
    'player.recover':       { position: [number, number, number]; depth: number };
    'player.rotate':        { yaw: number; pitch: number; deltaYaw: number };
    // ── resource ──
    'resource.parsed':      { kind: 'model' | 'texture'; id: string };                         // target=adjunct eid
    'resource.failed':      { kind: 'model' | 'texture'; id: string; error: string };
    // ── interact（指针原始层；touch 的上游）──
    'interact.primary':     { metadata: unknown; distance: number; point: [number, number, number] }; // target=命中实体
    'interact.context':     { metadata: unknown; distance: number; point: [number, number, number];
                              screenPos: [number, number] };
    'interact.miss':        {};   // 替代 entityId:null 哨兵的取消选择信号
    // ── item / inventory / effect ──
    'item.pickup':          { itemId: string; amount: number; metadata?: unknown };            // actor=拾取者
    'item.consume':         { itemId: string; amount: number };
    'item.spawn_drop':      { itemId: string; amount: number; position: [number, number, number] };
    'inventory.updated':    { entity: EntityId; inventory: unknown };
    'inventory.full':       { entity: EntityId; itemId: string };
    'effect.spawn':         { position: [number, number, number]; type: string };
    // ── edit ──
    'edit.draft_saved':     { blockKey: string };
    'edit.upload_request':  { drafts: unknown };
    // ── actuator（P2）──
    'actuator.requested':   { reqId: number; action: unknown };                                // target=trigger eid
    'actuator.settled':     { reqId: number; ok: boolean; result?: unknown; error?: string };
    // ── ui（边界专用：payload 可含闭包；永不录制/跨 Worker/跨网络，见 §6.5）──
    'ui.show_group': unknown; 'ui.show_button': unknown; 'ui.show_modal': unknown;
    'ui.show_form':  unknown; 'ui.show_toast':  unknown; 'ui.update_compass': unknown;
    'ui.update_widget': unknown; 'ui.hide': unknown; 'ui.inject_style': unknown;
    'ui.action':            { id: string; values?: Record<string, unknown> };  // React → 引擎的命令回流
}

/** 沙箱/链上动态 adjunct 的逃生通道：弱类型，主线程白名单校验后入队。 */
export type CustomEventName = `custom.${string}`;
export type EventType = keyof EventMap | CustomEventName;
export type PayloadOf<K extends EventType> = K extends keyof EventMap ? EventMap[K] : unknown;

/** 所有消费侧看到的统一信封（终结 GameEvent/裸 payload 双形状问题）。 */
export interface WorldEvent<K extends EventType = EventType> {
    readonly type: K;
    readonly payload: PayloadOf<K>;
    /** 定向路由：事件指向的实体（被点的 box、被站上的 stop、加载完的 block…）。 */
    readonly target?: EntityId;
    /** 稳定内容地址键（§4），随 target 一并携带；跨块重载存活的订阅靠它命中。 */
    readonly targetKey?: string;
    /** 行为参与者（多人就绪；单机 = 本地玩家实体）。 */
    readonly actor?: EntityId;
    /** 发射帧号 + 帧内单调序号：(frame, seq) 全局唯一确定排序。 */
    readonly frame: number;
    readonly seq: number;
    /** 发射瞬间的世界模式（Normal/Game/Ghost 门控以此为准，而非派发瞬间）。 */
    readonly mode: SystemMode;
}

/** 边界专用分类：不录制、不回放、不跨 Worker/网络（payload 可含闭包）。 */
export const BOUNDARY_ONLY: ReadonlySet<string> = new Set([
    'ui.show_group','ui.show_button','ui.show_modal','ui.show_form','ui.show_toast',
    'ui.update_compass','ui.update_widget','ui.hide','ui.inject_style',
]);
```

插件扩展走 TS 声明合并：

```ts
// plugins/adjunct/adjunct_foo.ts
declare module '../../core/events/EventTypes' {
    interface EventMap { 'custom.foo_charged': { level: number } }
}
```

### 2.2 队列与读者 — `engine/src/core/events/EventQueue.ts` / `EventReader.ts`

```ts
export type Unsubscribe = () => void;
export interface EmitOptions { target?: EntityId; targetKey?: string; actor?: EntityId }
export interface SubOptions  { target?: EntityId; key?: string; once?: boolean }

export class EventQueue {
    constructor(private host: { frame: number; mode: SystemMode });

    /** 任何上下文均可调用（系统内/帧外/边界回调内）：只追加数据，绝不同步执行回调。 */
    emit<K extends EventType>(type: K, payload: PayloadOf<K>, opts?: EmitOptions): void;

    /** 系统侧拉取接口。reader 持久持有（懒建或在 ISystem.init 建一次），内含游标。 */
    reader<K extends EventType>(type: K): EventReader<K>;

    /** 边界回调（仅 Engine 门面/UI/Loader/网络；core 系统禁用——CI 守护，见 §8.4）。
     *  opts.target 按 EntityId 定向；opts.key 按稳定内容地址定向（两者可并存订阅）。 */
    on<K extends EventType>(type: K, cb: (ev: WorldEvent<K>) => void, opts?: SubOptions): Unsubscribe;

    /** 订阅分组：scope 内的全部订阅可一键销毁（系统/Loader/NetSync 的整组退场）。 */
    scope(): { on: EventQueue['on']; dispose(): void };

    /** 帧括号：仅 World.step 调用。 */
    beginFrame(): void;       // frame++；各 dirty channel 翻转双缓冲，丢弃 2 帧前的半区
    flushBoundary(): void;    // 本帧新事件按 (frame,seq) 全局排序，try/catch 隔离派发给边界订阅者

    /** 实体销毁钩子：清掉该实体名下全部 ent 定向边界订阅（World.destroyEntity 调用）。 */
    dropTarget(eid: EntityId): void;

    /** 录制（golden-log 测试 / 调试 / 未来网络镜像）：BOUNDARY_ONLY 分类除外。 */
    startRecording(sink: (ev: WorldEvent) => void): Unsubscribe;

    dispose(): void;          // 清空全部 channel、游标与边界订阅（World.dispose 调用）
}

export class EventReader<K extends EventType> {
    /** 返回"自上次 read 之后"的新事件（emit 顺序）。
     *  ★ 默认返回**新数组**（每帧 0–10 个事件量级，分配可忽略）——消灭"scratch 视图跨 read 失效"
     *    的锋利边；热路径可用 readInto 换零分配。 */
    read(): WorldEvent<K>[];
    /** 零分配变体：追加进调用方复用的 out 数组，返回写入条数。 */
    readInto(out: WorldEvent<K>[]): number;
    /** 定向消费：只取 target === eid 的新事件（线性扫描本帧新事件，量级个位数，见 §9）。 */
    readFor(eid: EntityId): WorldEvent<K>[];
    /** 丢弃未读并对齐游标（系统被禁用/模式门控期间调用，避免落后告警）。 */
    clear(): void;
}
```

内部结构（模块私有 `EventChannel.ts`）：每事件类型一个双缓冲数组通道，`push` 进写半区；`beginFrame` 翻转并清空两帧前的半区；reader 游标基于通道历史总序 `total`，`collect(cursor, out)` 取 `[cursor, total)`；游标落后于最老可得事件时 `console.warn` 并跳到最老（事件丢失**被检测**而非静默）。

边界订阅表：

```ts
Map<EventType, {
    global:   Sub[];                      // 全局监听（注册序）
    byTarget: Map<EntityId, Sub[]>;       // ent 定向（dropTarget 清理）
    byKey:    Map<string, Sub[]>;         // 稳定键定向（跨块重载存活，见 §4）
}>
```

### 2.3 消费侧契约（必须写进 `core/events/index.ts` 模块文档）

1. **stale-target 防御**：拉模型下事件可能在目标实体销毁后才被读到（同帧后销毁、或隔帧）。**所有按 `ev.target` 取组件的消费者必须容忍 `getComponent` 返回 undefined 并跳过**。这是契约，不是建议。
2. **读取节律**：每帧 read 的 reader 永不丢事件；被模式门控暂停的系统在恢复前调用 `reader.clear()`（或恢复后接受落后告警 + 跳到最老）。事件存活恰好 2 个 `beginFrame`。
3. **跨通道顺序**：单通道内严格按 emit 序；系统侧跨通道顺序由 reader 调用顺序决定（先 read A 再 read B 即按 A 全量、B 全量处理）。需要严格因果交错的消费者（如未来 NetSyncSystem）在边界侧消费——`flushBoundary` 按 `(frame, seq)` 全局排序派发。
4. **同帧可见性**：注册序靠后的系统**同帧**读到靠前系统的事件；靠前读靠后的，**固定 1 帧延迟**（§5.2）。

### 2.4 World 与 Engine 改动

```ts
// core/World.ts
export interface ISystem {
    init?(world: World): void;   // 新增：全部系统注册完成后统一调用一轮（建 reader / 订阅）
    update(world: World, dt: number): void;
    dispose?(): void;            // 新增：World.dispose 逐系统调用（scope.dispose 在此）
}

export class World {
    public frame = 0;
    public readonly events = new EventQueue(this);
    public readonly index  = new EntityIndex(this);    // §4.2

    public step(dt: number): void {
        this.events.beginFrame();                       // ① frame++，翻转双缓冲
        this.systems.update(this, dt);                  // ② 系统按固定注册序 tick（emit 入队 / reader 拉取）
        this.renderEngine.render(this.pipeline.isMinimapActive);  // ③
        this.events.flushBoundary();                    // ④ 边界回调唯一派发点
    }

    public destroyEntity(id: EntityId): void {
        this.registry.removeEntity(id);
        this.events.dropTarget(id);                     // ent 定向边界订阅随实体回收
    }

    public dispose(): void {
        this.events.dispose();                          // 修掉现状监听泄漏（World.ts:278-286）
        window.removeEventListener('resize', this._onResize);  // 顺手修相邻泄漏（World.ts:169-171）
        /* …既有清理… */
    }

    public setMode(mode: SystemMode): void {
        /* …既有状态切换… */
        this.events.emit('system.mode', { mode, oldMode });     // 入队 → 下一帧帧首可见
        if (/* 离开 Edit */) /* 保存仍走 EditSystem 轮询，不再发死线 world:save_request */;
        if (mode === SystemMode.Game) this.events.emit('system.preload', { scope: 'all' });
    }

    // 迁移期保留为废弃垫片（操作旧 Map 总线，行为零变化；PR-4 删除）：
    /** @deprecated 用 world.events */ public on(event: string, cb: Function): void { /* 原实现 */ }
    /** @deprecated */ public emitSimple(event: string, data: any, source?: EntityId): void { /* 原实现 */ }
    /** @deprecated */ public off(event: string, cb: Function): void { /* 原实现 */ }
}
```

```ts
// Engine.ts 门面
public on<K extends EventType>(
    type: K | LegacyEventName,                       // 旧字符串名经 LEGACY_EVENT_MAP 归一 + dev 告警
    cb: (payload: PayloadOf<K>, ev: WorldEvent<K>) => void,   // payload 首参兼容现有消费者心智，
    opts?: { target?: EntityId; key?: string; once?: boolean } // 完整信封作第二参——统一双形状
): Unsubscribe;
public off(type: string, cb: Function): void;        // @deprecated；内部以 (type, cb) 双键 Map 存退订闭包
                                                     // —— 修复 eventWrappers 按 callback 单键 clobber（Engine.ts:39,176）
/** 外部 → 队列注入的唯一入口：UI 命令（ui.action）、网络入站、测试注入。 */
public send<K extends EventType>(type: K, payload: PayloadOf<K>, opts?: EmitOptions): void;
/** injectBlock 返回实体 id，使客户端能做 block.loaded 定向 boot gate。 */
public injectBlock(stdData: any): EntityId | undefined;
```

预启动订阅队列（`Engine.ts:38, 97-98` 机制）原样保留，携带 opts，bootWorld 末尾冲入 `events.on`。

---

## 3. 事件分类表（新旧全量映射）

**命名规范（唯一标准）**：`category.event`，点分、全小写、多词 snake_case。分类全集：`system / block / trigger / stop / player / resource / interact / item / inventory / effect / edit / actuator / ui / custom`。旧文档六类（trigger.md:10-17 权威版；overview.md 的 enter/leave/stay 别名表作废）全部保留且语义对齐。

| 旧名（现状） | 现状健康度 | 新名 | 处置与备注 |
|---|---|---|---|
| `world:mode_changed` | 有发无收 | `system.mode` | 迁移；EditSystem 仍轮询 world.mode（不强改） |
| `world:save_request` | 死线（保存实际走轮询） | — | **删除**，不立新名 |
| `world:preload_request` | 死线 | `system.preload` | 名额保留，Game 管线启用时恢复发射 |
| `world:block_ready` | 每 adjunct 发一次（语义误） | `block.loaded` | **不别名**（语义不同会撒谎）：新事件=每块一次（target=block eid）；迁移期**新旧并行**，DesktopLoader 切定向订阅后删旧 emit |
| `world:draft_saved` | 有发无收 | `edit.draft_saved` | 迁移 |
| `world:upload_request` | 有发无收（候机 IChainPublisher） | `edit.upload_request` | 迁移；DOM onClick 栈发出 → 入队下帧可见，天然安全 |
| `grid:need` | 活线 | `block.need` | 迁移（本质是块流式请求） |
| `player:state` | 双发射器、rotation 坐标系交替 bug | `player.state` | **只留 CharacterController 发射点，删 GridSystem.ts:33-38 重复发射**（修持久化 rotation 脏写） |
| `player:fell` | 有发无收 | `player.fall` | 迁移 |
| （新增） | — | `player.death` | `drop >= fallDeathHeight` 分支已存在（CharacterController.ts:378-387），单独发射 |
| `player:recovered` | 空 payload | `player.recover` | 补 `_safe` 坐标 + 深度 |
| （新增） | — | `player.rotate` | processPersistence 阈值节流发射 |
| `interact` | 活线（含 null 哨兵反选） | `interact.primary` + `interact.miss` | miss 拆独立事件，消灭 `entityId:null` 哨兵 |
| `context-interact` | 活线 | `interact.context` | 迁移 |
| `pickup_item` | 双重损坏（解构错层 + source 缺失） | `item.pickup` | 修复：emit 带 `actor`；类型化 payload 使旧解构 bug 变编译错误 |
| `consume_item` | 有收无发 | `item.consume` | 保留通道 |
| `spawn_drop` | 有收无发 + handler 解构 bug | `item.spawn_drop` | 保留通道 + 修 handler |
| `spawn_effect` | 有收无发 + handler 解构 bug | `effect.spawn` | 同上 |
| `inventory_updated` / `inventory_full` | 有发无收 | `inventory.updated` / `inventory.full` | 迁移 |
| `ui:show-group` 等 9 个 | 有发无收 | `ui.show_group` 等 | 边界专用通道（BOUNDARY_ONLY） |
| （新增） | — | `block.in` / `block.out` / `block.unload` | §6.3 |
| （新增） | — | `stop.on` / `stop.leave` / `stop.beside` | §6.2 |
| （新增） | — | `trigger.touch` / `trigger.fired` | §6.1；解锁 tests/README 局限 6 |
| （新增） | — | `resource.parsed` / `resource.failed` | §6.4 |
| （新增） | — | `actuator.requested` / `actuator.settled` | P2，§6.7 |
| （新增） | — | `ui.action`、`system.init`、`system.launch` | 命令回流 / 生命周期 |

**暂不建通道**（名额登记于 EventMap 注释，有真实消费者再加行）：`system.update` 心跳（step 本身即心跳）、`trigger.hold` 上总线（每帧风暴，待 holdDuration 语义修正后低频化再上）、`datasource.*`（Game 模式网络隔离时启用）、`env.time/weather`（现走 feedChainState 直调）、adjunct 的 `under`/`beside` 接近度语义。教训：现状 23 个事件 14 个死线——**不为对齐分类法制造新死线**。

`LEGACY_EVENT_MAP`（`core/events/EventAliases.ts`）：仅存在于 **Engine 门面**（外部消费者只有 DesktopLoader 与潜在第三方），core 内不做名字别名（拉模型与回调模型语义不同，core 级 shim 是假兼容）。旧名使用时 dev 模式 `console.warn` 一次（自我宣传的债）。**退场判据**：`grep -rE "world:block_ready|grid:need|pickup_item|'interact'" engine/src client/desktop/src` 归零后整表删除。

---

## 4. 实体级定向绑定的路由设计

### 4.1 双键模型：运行时键 + 稳定内容地址键

旧引擎复合键 `${x}_${y}_${world}_${adjunct}_${index}`（backup event.js:91）实际承载两种身份，本设计拆开：

- **运行时键 = `EntityId`**（`WorldEvent.target`）：生命周期与实体一致，销毁即经 `dropTarget` 自动清理。系统内部"这个实体活着我就关心"用它。
- **稳定键 = 内容地址字符串**（`WorldEvent.targetKey`）：跨块流入/流出存活。内容作者订阅"[2025,619] 处第 0 号 box"订阅的是**地址**而非某次实例化——块被驱逐再注入后订阅依然命中。

```ts
// engine/src/core/events/TargetKeys.ts
export const TargetKeys = {
    block:   (x: number, y: number, world = 0) => `blk:${x}_${y}_${world}`,
    /** 直接复用既有 adjunctId 格式 adj_{x}_{y}_{typeId}_{idx}（BlockSystem.ts:117），
     *  与旧复合键同构。 */
    adjunct: (adjunctId: string) => `adj:${adjunctId}`,
    player:  (pid: number | string = 0) => `plr:${pid}`,
};
```

### 4.2 EntityIndex：地址 ↔ 实体的唯一解析器

把 `TriggerSystem._adjunctMap`（TriggerSystem.ts:12-26）一般化为 World 级服务，所有发射点的 `targetKey` 计算与所有订阅方的地址解析都走它，杜绝各调用点各自手搓：

```ts
// engine/src/core/services/EntityIndex.ts
export class EntityIndex {
    blockAt(x: number, y: number): EntityId | undefined;
    adjunctById(adjunctId: string): EntityId | undefined;
    adjunctAt(x: number, y: number, typeId: number, index: number): EntityId | undefined;
    keyOf(eid: EntityId): string | undefined;     // 实体 → 稳定键（emit 端反查，缓存）
    invalidate(): void;                            // BlockSystem/AdjunctSystem 增删块/adjunct 时调用
}
```

### 4.3 派发与消费

- **emit 端**：`events.emit('trigger.touch', payload, { target: eid, targetKey: world.index.keyOf(eid), actor })`。`keyOf` 一次 Map 查找（带缓存），不在帧热路径。
- **系统侧（拉）**：`reader.readFor(eid)` 对本帧新事件线性扫描。诚实论证：拉模型下候选集已被"按类型分通道 + 帧作用域"压缩到每帧个位数，扫 5 条比维护 per-target 索引便宜。旧文档抱怨的浪费在于**回调模型**（每事件拉起全部监听者各自过滤；旧 event.js:170-194 实际还是 O(n) 全名扫描）——拉模型里系统根本不被"拉起"。
- **边界侧（推）**：订阅者可能很多（每个可交互实体一个 UI 标签 / 每个沙箱脚本一个订阅），按 `(type → byTarget/byKey)` 双层 Map 组织，派发 O(1) 直达——**第一次真正兑现**文档承诺的复合键路由。单事件的边界派发顺序固定：`byTarget` 命中 → `byKey` 命中 → `global`（各按注册序）。

```ts
// 旧文档场景："监听 [2025,619] 处第 0 号 box 的 touch"（跨块重载存活）
world.events.on('trigger.touch', ev => { ... }, { key: TargetKeys.adjunct('adj_2025_619_2_0') });

// DesktopLoader boot gate（替代 world:block_ready 全局监听+过滤+泄漏 failsafe）
const blockEid = engine.injectBlock(stdData)!;
const unsub = engine.on('block.loaded', () => { clearTimeout(t); resolve(); },
                        { target: blockEid, once: true });
const t = setTimeout(() => { unsub(); resolve(); }, 3000);   // failsafe 也干净退订
```

### 4.4 生命周期与陈旧键风险

- `dropTarget(eid)` 由 `World.destroyEntity` 调用，借**反向索引** `Map<EntityId, Set<订阅引用>>` O(自身订阅数) 清理 ent 定向订阅（EntityId 单调自增、永不复用——已核实 `++entityCounter`——所以不清理是纯泄漏而非错配，但泄漏正是本次重设计要治的病）。
- 稳定键订阅**有意**跨重载存活；代价是块被编辑后同一 index 可能"是另一个东西"，旧订阅仍命中。这是内容寻址的固有语义（旧引擎同样如此），写入文档；`edit.draft_saved` 提供重校验钩子，主动失效机制推迟（§10）。

---

## 5. 派发语义与确定性

### 5.1 时序（写死在 `World.step`）

```
step(dt):
  ① events.beginFrame()    // frame++；dirty channel 翻转双缓冲，丢弃 2 帧前事件
  ② systems.update(...)    // 固定注册序；emit=入队（带 frame/seq/mode 戳），reader=拉取
  ③ renderEngine.render()
  ④ events.flushBoundary() // 本帧新事件按 (frame,seq) 全局排序，派发给边界订阅者
```

### 5.2 可见性规则

- **下游同帧**：注册序靠后的系统同帧读到靠前系统的事件（Raycast#2 → Trigger#3 → … → EditSystem#15，点选/触发零延迟，交互手感不变）。
- **上游次帧**：靠前系统读靠后系统的事件固定延迟 1 帧——延迟是常量、由注册序唯一决定、可断言。需要消除延迟的合法手段是调注册序（如把 InventorySystem 移到 ItemDropSystem 之后），**不是开同步后门**。
- **帧外发射**（setMode、DOM 点击、Promise resolve、`engine.send`、网络入站）：落写半区，下一次 step 的 ② 阶段可见——帧外时序被规整到帧边界。
- **边界回调**只在 ④ 执行：UI 回调里调 `engine.setEditMode()` 落帧间，下一帧帧首生效；外部代码永远不在 core 系统的 update 栈内运行。

### 5.3 排序公理与重入策略

1. **全局序 = (frame, seq)**：同帧 seq 由 emit 先后唯一决定，emit 先后由注册序 + 系统内代码顺序唯一决定 ⇒ 同输入逐字节相同事件日志。
2. **emit 永不执行回调** ⇒ 不存在 emit-during-dispatch、off-during-dispatch、listener-throws-into-emitter 这些类别。系统在 read 循环里 emit 自己正在读的通道 → 收敛为下一帧自馈（结构性不可能死循环）。
3. **flushBoundary 的 seq 快照**：开始派发时定格 seq 上界；回调内 emit 的事件 seq 超过快照 → 归入下一帧。边界级联结构性有界。
4. **mode 戳在 emit 时刻**：玩家在 Game 模式踩中触发器，哪怕同帧切回 Normal，该事件仍按 Game 门控——"事件发生在哪个模式"是内容语义，配合 1 帧可见性延迟，这是 gameOnly/权限矩阵不变成竞态的前提。
5. **保险丝**：每帧事件量 > 4096 → `console.warn`（捕获留在级联限制以下的失控自馈）；reader 落后超过 2 帧 → warn + 跳到最老。
6. **无 step 不派发**：headless 测试里没有任何隐藏异步派发源。

---

## 6. 与现有系统的接入点

### 6.0 前置（独立先行，不等总线）

1. ~~**修接线 bug**~~ **（已完成，cb2473d 2026-06）**：重写 `AdjunctSystem.registerTriggers`——直读新格式 `vol.events`（旧实现按 `vol.type/logic/runOnce` 解析，作者写的 JSONLogic 被静默丢成 `[{type:'hold',actions:[]}]`）。集成测试见 `engine/tests/systems/trigger-pipeline.test.ts`。
2. **类型统一（大部分已完成，cb2473d）**：`TriggerEvent` 已并为 `TriggerLogicNode` 别名，type 联合已扩为 `'in'|'out'|'hold'|'touch'`，`holdDuration` / `gameOnly` 字段已落（语义也已实现，未推迟）。残留：死类型 `TriggerVolumeComponent`（types/Trigger.ts）尚未删除。
3. **ISystem.init**：World 构造器注册完全部系统后 `this.systems.init(this)` 一轮。消灭 Inventory/ItemDrop/ParticleEffect "首帧才懒订阅、错过此前事件"的缺陷与 EditSystem 构造器订阅的不对称。

### 6.1 TriggerSystem：touch + trigger.fired

touch 无法由轮询循环算出——它来自 RaycastInteractionSystem 的点击事实，按 target 路由到**那一个**实体的 TriggerComponent（core 内"在实体上挂逻辑"= 组件数据 + 系统路由，不是回调）：

```ts
// core/systems/TriggerSystem.ts
export class TriggerSystem implements ISystem {
    private touchReader?: EventReader<'interact.primary'>;

    init(world: World): void { this.touchReader = world.events.reader('interact.primary'); }

    update(world: World, dt: number): void {
        this.touchReader ??= world.events?.reader('interact.primary');   // 懒建守卫：兼容手搓 fake World 测试
        // …… in/out/hold 体积轮询不变（连续空间检测不走事件）……
        if (this.touchReader) for (const ev of this.touchReader.read()) {
            if (ev.target === undefined) continue;                        // miss 走 interact.miss，与触发无关
            const trig = world.getComponent<TriggerComponent>(ev.target, 'TriggerComponent');
            if (!trig) continue;                                          // stale-target 契约：销毁后到达的事件静默跳过
            world.events.emit('trigger.touch',
                { point: ev.payload.point, distance: ev.payload.distance },
                { target: ev.target, targetKey: ev.targetKey, actor: ev.actor });
            this._handleEvent(world, ev.target, trig, 'touch', this._ctx, ev.actor);
        }
    }

    private _handleEvent(world, entityId, trigger, type, ctx, actor?): void {
        // …… 既有 oneTime/JSONLogic/actions/fallback 流程不变（语义修正在 PR-7）……
        world.events?.emit('trigger.fired',                               // ?. 守卫 fake World（无 events 的旧测试桩）
            { eventType: type, pass, actionCount: actions.length, oneTimeConsumed },
            { target: entityId, targetKey: world.index?.keyOf(entityId), actor });
    }
}
```

- `RaycastInteractionSystem.ts:97-124` 改写：命中 → `emit('interact.primary', {metadata,distance,point}, { target: hitEid, targetKey: index.keyOf(hitEid), actor: playerEid })`；右键 → `interact.context`；未命中 → `emit('interact.miss', {})`（EditSystem 据此反选）。
- **玩家获取修复**：`queryEntities('TransformComponent')[0]`（TriggerSystem.ts:30-33）改为 `ActorComponent` 标签查询（本地玩家与未来远端玩家都打标签），体积检测对所有 actor 迭代——`entitiesInside: Set<EntityId>` 本就按实体记账，天然多人就绪；`triggeredCount` 重键 `` `${type}:${actorEid}` `` 留给 Game 模式清单。
- `trigger.fired` 直接解锁 tests/README 局限 6。

### 6.2 stop.on / stop.leave / stop.beside（CharacterController + PhysicsSystem）

精确的固体实体已经算出只是被丢弃（`_solidIds[si]`，CharacterController.ts:250-311）：

```ts
// core/movement/CharacterController.ts 新增帧级状态
private _groundEid: EntityId = -1;                 // 当前站立实体
private _groundCandidate: EntityId = -1;           // 本帧 substep 中记录
private _besideNow  = new Set<EntityId>();         // substep 去重（MAX_SUBSTEPS=48！）
private _besidePrev = new Set<EntityId>();

// resolveY 着陆分支(:250-259) / resolveHorizontal 上台分支(:288-295)：_groundCandidate = _solidIds[si]
// resolveHorizontal 阻挡分支(:297-311)：_besideNow.add(_solidIds[si])（连同 axis）

// update() 末尾（substep 循环后）边沿检测——照抄既有 _wasGrounded 模式(:44, :378-387)：
if (this._groundCandidate !== this._groundEid) {
    if (this._groundEid !== -1)
        world.events.emit('stop.leave', { adjunctId: adjIdOf(this._groundEid) },
                          { target: this._groundEid, targetKey: keyOf(this._groundEid), actor: playerEid });
    if (this._groundCandidate !== -1)
        world.events.emit('stop.on', { face: 'top', adjunctId: adjIdOf(this._groundCandidate) },
                          { target: this._groundCandidate, targetKey: keyOf(this._groundCandidate), actor: playerEid });
    this._groundEid = this._groundCandidate;
}
for (const eid of this._besideNow) if (!this._besidePrev.has(eid)) /* emit stop.beside {axis} */;
[this._besidePrev, this._besideNow] = [this._besideNow, this._besidePrev]; this._besideNow.clear();
```

- 对**所有** solid 发射（不只 b4）；消费者要分类时按 `ev.target` 取 `AdjunctComponent.stdData.stop/stopMode`。
- `beside` 第一版 = 水平碰撞接触（已有计算零新开销）；协议 0.5m 接近度语义推迟（§10），事件名不变。
- PhysicsSystem 非玩家刚体三个静默分支（PhysicsSystem.ts:98-109/128-137/154-163）同款发射，`actor` = 刚体实体。
- **内容可编程化（嫁接自 content-authoring）**：TriggerLogicNode 的 type 后续可扩 `'on'|'leave'`——TriggerSystem 持 `stop.on/leave` reader，按 `ev.target` 路由到该实体的 TriggerComponent 走同一条 JSONLogic 管线。b4 stop 由此获得与 trigger 同级的创作面（随 PR-7 语义包落地）。
- 顺带：`player.fall` / `player.death`（drop ≥ deathH 分支单独发）/ `player.recover`（补 `_safe` 坐标）/ `player.rotate`（rotDist 阈值）按 §3 表接入。

### 6.3 Block 生命周期

- **in/out**：`GridSystem.ts:40-48` 跨界处，覆盖 `lastBlockKey` 之前先发 `block.out`（旧 key 此刻还在手）再 `block.in`，最后照旧 `block.need`。10Hz 检查门不变。同 PR 删除 GridSystem 的重复 `player:state` 发射器。
- **loaded**（修正 `world:block_ready` 误语义）：`BlockComponent` 加 `pendingAdjuncts: number`（`initializeBlock` 末尾 = `adjunctsToInit.length`，为 0 当场 emit）；`AdjunctSystem.initializeAdjunct` 成功后递减，归零 emit `block.loaded`（target=blockEid，targetKey=`blk:x_y_0`）。帧预算分摊（BUILD_BUDGET）天然兼容——loaded 在最后一个 adjunct 完成那帧发出。**迁移期旧 `world:block_ready` 逐 adjunct emit 原样保留**（DesktopLoader 启动门依赖其时序），客户端切定向订阅验证后删除。
- **unload**：`BlockSystem.removeBlock`（:196-218）销毁循环**之前** emit（监听者还能读组件），payload 含被销毁 adjunctId 列表；循环内每实体走 `world.destroyEntity` → `dropTarget` 自动清理定向订阅。

### 6.4 ResourceManager（合法跨 render 层）

规则不破：**ResourceManager（render/）保持零事件、零 World 引用**。发射点在 core 层本就持有 `world` 的 swap 调度处：

- `AdjunctFactory.scheduleModuleSwap` 成功体（AdjunctFactory.ts:123-153）：`emit('resource.parsed', { kind:'model', id }, { target: entityId, targetKey })`——复活旧引擎 `module.parsed` 定向消费模式（render_3d.js:514 的占位体→模型 swap）。
- 失败 catch（:154-157，现仅 console.warn）：`resource.failed`；纹理同理（:183-195）。
- 这些 emit 来自异步 promise 栈 = 帧外发射 → 入队下帧可见，天然确定。
- 缓存层诊断如需暴露，经 `ResourceManagerConfig` 注入普通回调、World 构造器桥接成事件——render/ 不知 EventQueue 存在。

### 6.5 EventUIProxy（engine → React UI）

- emitter 闭包（Engine.ts:89-90）换成 `(type, data) => world.events.emit(uiAlias(type), data)`；`ui.*` 在 `BOUNDARY_ONLY` 集合：不录制、不回放、不跨 Worker/网络——payload 含闭包（`UIButtonConfig.onClick`，UIProvider.ts:6,23）是对"纯数据"原则的**显式豁免**，不是漏洞。
- 派发时点 = step ④（渲染后），UI 回调里的引擎调用落帧间。
- **豁免退出路径**（规划，不阻塞）：UI 配置闭包换 `actionId`，React 点击后 `engine.send('ui.action', { id, values })` 回流入队，EditSystem 以 reader 消费——届时 ui.* 变纯数据，`uiMode:'events'` 才真正可测可用。

### 6.6 AdjunctSandbox（Web Worker；定协议，随 AdjunctLoader 接入实施）

- 沙箱代码**不能直接订阅/emit**（Worker 域只有 console/Math/JSON/Object/Array，AdjunctSandbox.ts:92-95）。
- hooks 声明清单 `{ events: ['touch','in'] }`（旧 adjunct.md reg 形制）；宿主侧未来 `AdjunctScriptSystem` 持对应 reader，每帧把该 adjunct 实体的定向事件**批量打成一条** postMessage（`{type:'events', list:[{type,payload,frame,seq}]}`）——一帧一条，不是一事件一条。
- 入队/出队 payload 过 `structuredClone` try/catch 校验（dev 模式），含闭包即拒绝并 warn。
- 沙箱回程：`adjunctAPI.emitEvent(type, payload)` → postMessage → 宿主校验（仅 `custom.*` 或声明白名单）→ `events.emit`（帧外注入 → 下帧可见）。Worker 异步墙不破坏确定性：**所有跨界数据以事件形式在帧首进入仿真，且可录制**。沙箱永远不能直接落动作——动作描述经宿主 ActuatorRegistry 白名单执行，保持 validateCode + 最小能力的安全模型。

### 6.7 P2 IActuator / contract 动作

`_executeAction` 的 switch（TriggerSystem.ts:122-143）退役为注册表；**异步结果一律以事件回流**（带 reqId 关联）——链调用结果进队列、下一帧确定时点处理、录制日志里有它，回放不需要真链：

```ts
// engine/src/core/services/Actuator.ts
export interface ActuatorContext {
    world: World; triggerEid: EntityId; actor?: EntityId; ctx: WorldContext;
    emit: EventQueue['emit'];      // 能力注入而非裸 world.events——actuator 可沙箱化
}
export interface IActuator { readonly kind: string; execute(action: TriggerAction, c: ActuatorContext): void }

export class LocalActuator implements IActuator {       // 现 adjunct/flag/system 三分支原样收编
    readonly kind = 'local'; execute(action, c) { /* … */ }
}
export class ContractActuator implements IActuator {    // 链可选注入（IChainPublisher 同款模式），纯模式 null
    readonly kind = 'contract';
    constructor(private publisher: IChainPublisher | null) {}
    execute(action, c) {
        const reqId = this.nextId++;
        c.emit('actuator.requested', { reqId, action }, { target: c.triggerEid, actor: c.actor });
        if (!this.publisher) { c.emit('actuator.settled', { reqId, ok: false, error: 'no publisher' }, { target: c.triggerEid }); return; }
        this.publisher.publish(/* contractId = action.target；旧版协议的 raw contractId 槽位已移除，现行格式见 protocol/cn/trigger.md §2 */)
            .then (r => c.emit('actuator.settled', { reqId, ok: true,  result: r },        { target: c.triggerEid }))
            .catch(e => c.emit('actuator.settled', { reqId, ok: false, error: String(e) }, { target: c.triggerEid }));
    }
}
```

Normal/Game/Ghost 权限矩阵（protocol/cn/trigger.md:139-146）在 **ActuatorRegistry 调度层统一判 `ev.mode`**（emit 时刻的 mode 戳），不散落各 actuator——单一门控点，杜绝 touch（事件路由）与 in/out/hold（轮询）门控不一致的脑裂（PR-7 落地）。

---

## 7. 分步迁移计划（逐通道、无 flag-day）

迁移规模盘点：18 个 emit 点、4 个订阅系统、2 个外部消费者；**真正的活线只有 5 条**（interact/context、pickup、grid:need、player:state、world:block_ready），其余是死线（搬动零风险）。新旧总线**共存**直至旧总线缩空——这就是 shim 策略：`World.on/emitSimple/off` 原样保留操作旧 Map（行为零变化），逐通道把"发射点 + 该通道全部消费者"作为一个原子小步迁走。

| 步 | 内容 | 动哪些文件 | 验证/风险 |
|---|---|---|---|
| **PR-0** 前置 bug（半天，独立） | registerTriggers 新格式透传 + 全管线集成测试；pickup 链双修（ItemDropSystem.ts:35 补 source、:28-29 与 ParticleEffectSystem.ts:36-37 解构层级，先在旧总线上修通）；删 GridSystem.ts:33-38 重复 player:state；TriggerLogicNode/TriggerEvent 类型合并 + holdDuration?/gameOnly? 字段 | `core/systems/{Adjunct,ItemDrop,ParticleEffect,Grid}System.ts`、`core/types/Trigger.ts`、`core/components/TriggerComponent.ts`、`tests/systems/trigger-pipeline.test.ts`（新） | pickup 链端到端测试首次转绿；行为修复与重构解耦 |
| **PR-1** 队列落地（共存） | `core/events/{EventTypes,EventChannel,EventReader,EventQueue,TargetKeys,EventAliases,index}.ts`；`core/services/EntityIndex.ts`；World 加 `events/index/frame` 字段 + step 帧括号 + destroyEntity→dropTarget + dispose 清理（含 resize 监听）；ISystem.init/dispose + SystemManager 透传 | `core/World.ts`、`core/SystemManager.ts`、新目录、`tests/unit/events/*.test.ts` | 不动任何调用点，旧总线原样；队列单测（双缓冲/游标/丢弃告警/seq 排序/dropTarget/scope）。零风险 |
| **PR-2a** interact 通道 | Raycast 三处 emit → `interact.primary/context/miss`（带 target/targetKey/actor）；EditSystem 改 reader（同帧语义不变，2→15 下游）；ItemDropSystem 改 reader（destroyEntity 移入自己的 update，消除派发栈内销毁）；旧 `interact`/`context-interact` emit 删除 | `core/systems/{RaycastInteraction,Edit,ItemDrop}System.ts` | 点选/右键菜单手感回归测试；该通道无外部消费者 |
| **PR-2b** item/inventory 通道 | `item.pickup`（actor）→ InventorySystem reader；**InventorySystem 在注册序中移到 ItemDropSystem 之后**（World.ts:147-163，加注释固定意图）；inventory.updated/full、item.consume/spawn_drop、effect.spawn 换名换通道 | `core/World.ts`（注册序）、`core/systems/{Inventory,ItemDrop,ParticleEffect}System.ts` | pickup→inventory 同帧链路测试 |
| **PR-2c** loader 通道 | `grid:need`→`block.need`、`player:state`→`player.state` 换新通道；Engine 门面重铸（on/off/send、LEGACY_EVENT_MAP + dev 告警、(payload, ev) 双参签名、退订闭包替代 eventWrappers）；injectBlock 返回 EntityId；DesktopLoader 改新名 | `Engine.ts`、`core/systems/GridSystem.ts`、`core/movement/CharacterController.ts`、`client/desktop/src/lib/DesktopLoader.ts` | 块流式加载/持久化回归；旧名经别名一个版本可用 |
| **PR-2d** 死线与 ui 通道 | setMode 改 `system.mode/system.preload` 入队（删 world:save_request）；edit.draft_saved/upload_request；EventUIProxy 接 `events.emit` + BOUNDARY_ONLY | `core/World.ts`、`core/systems/EditSystem.ts`、`core/services/EventUIProxy.ts` | 全部零订阅者，无行为回归 |
| **PR-3** block.loaded + boot gate | pendingAdjuncts 计数 → `block.loaded`（**与旧 world:block_ready 并行**）；DesktopLoader 切 `{target, once}` 定向订阅 + failsafe 退订；验证后删旧 emit | `core/components/BlockComponent`、`core/systems/{Block,Adjunct}System.ts`、`DesktopLoader.ts` | 启动门时序专项测试；不别名（语义不同） |
| **PR-4** 旧总线退场 | grep 确认 core/client 无 `emitSimple|World.on(` 残留 → 删 World 三方法 + listeners Map + GameEvent 类型；Engine 别名表保留一个版本（grep 归零判据后删） | `core/World.ts`、`Engine.ts` | 编译器兜底 |
| **PR-5** 新生命周期事件（逐项独立提交） | trigger.touch/fired（含 `world.events?.emit` 守卫或给 `tests/unit/trigger-jsonlogic.test.ts` 的 fake World 补 events/index 桩——**否则现有 ~10 条绿测 TypeError**）；ActorComponent 玩家查询修复；stop.*（含 PhysicsSystem）；block.in/out/unload；player.death/recover/rotate；resource.parsed/failed；CI 守护测试（§8.4） | `core/systems/{Trigger,Physics,Grid,Block}System.ts`、`core/movement/CharacterController.ts`、`core/factories/AdjunctFactory.ts`、`tests/**` | 每事件配 vitest；纯增量 |
| **PR-6** P2 actuator | IActuator/LocalActuator/ContractActuator + 注册表 + actuator.requested/settled；`EngineServices.actuator?` 注入 | `core/services/Actuator.ts`、`core/systems/TriggerSystem.ts`、`Engine.ts` | fake actuator 可控 resolve + step 逐帧断言 |
| **PR-7** 内容语义包（独立排期，**不混入迁移**） | oneTime 仅在 conditions 通过且 actions 执行时递增（协议"首次生效后停用"）；hold 改 holdDuration 语义（**dt 累加，非 Date.now()**，可步进快进）并低频化后上总线；gameOnly 节点门控 + ActuatorRegistry 权限矩阵；stop 逻辑节点（'on'/'leave'）接入 JSONLogic 管线 | `core/systems/TriggerSystem.ts`、`core/services/Actuator.ts`、`plugins/adjunct/adjunct_trigger.ts` | 语义变更单独评审；现有 oneTime 测试随语义更新 |

**别名/垫片退场判据**（机械、可 grep）：`grep -rE "emitSimple|world:block_ready|grid:need|pickup_item|'interact'" engine/src client/desktop/src` 归零 → 删 LEGACY_EVENT_MAP 与一切 deprecated 垫片。

---

## 8. 测试策略

### 8.1 reader 即捕获工具（无需 mock 总线）

```ts
const world = new World(cfg, { renderer: new NullRenderEngine() });
const fired = world.events.reader('trigger.fired');

movePlayerInto(volume);
engine.step(1 / 60);

const evs = fired.read();
expect(evs).toHaveLength(1);
expect(evs[0].payload.eventType).toBe('in');
expect(evs[0].target).toBe(triggerEid);
expect([evs[0].frame, evs[0].seq]).toEqual([1, 0]);     // 精确到帧
```

### 8.2 覆盖矩阵

- **队列单测**（`tests/unit/events/`）：双缓冲翻转/2 帧丢弃与落后告警、游标快照（read 期间 emit 归下次）、(frame,seq) 跨通道全局序、flushBoundary 的 seq 快照与回调内 emit 顺延、byTarget/byKey/global 派发顺序、once/退订/scope.dispose、dropTarget 反向索引、4096 保险丝、异常隔离（一个边界回调抛错不中断其余）。
- **确定性测试**：双 World 同输入 → `startRecording` 双日志逐条比对相同。诚实标注：完整回放仍 blocked on tests/README 局限 3（变 dt + 摩擦未归一），事件系统是必要条件非充分条件。
- **集成测试**：trigger touch 端到端走真 `registerTriggers`（PR-0 的测试，封死掩盖接线 bug 的缺口）；`engine.send('interact.primary', …, {target})` + step 即可在 node 闭环触发 touch——无需伪造 Raycast/DOM。
- **帧外注入语义**：emit 后断言本帧不可见、step 后可见。
- **boot gate 时序**：block.loaded 定向 + failsafe 退订专项。

### 8.3 既有测试兼容

`tests/unit/trigger-jsonlogic.test.ts` 的 fake World 只有 globalFlags/time/weather/queryEntities/getComponent——TriggerSystem 新 emit 必须 `world.events?.emit` 可选链守卫，或同 PR 给 fake World 补 `{ events: stubQueue, index: stubIndex }`。**三份候选设计都漏了这条；本定稿把它写进 PR-5 验收项。**

### 8.4 CI 守护（把纪律机制化）

新增 `tests/unit/architecture-guard.test.ts`：

1. `grep -r "from 'three'" engine/src/core engine/src/plugins` 无输出（既有规则）；
2. `grep -rE "\.events\.on\(" engine/src/core/systems engine/src/core/movement` 无输出——**边界回调 API 禁入 core 系统**（系统只许 reader）；
3. `grep -rE "emitSimple" engine/src/core/systems` 在 PR-4 后无输出；
4. World.ts 系统注册序快照测试（注册序是事件拓扑的承重墙，改动必须显式更新快照 + 注释理由）。

---

## 9. 性能注意事项

事件量级现实：典型帧 0–10 条（点击/越块/触发沿/接触沿都是稀疏事实），对照 AdjunctSystem 每帧 16 次网格构建预算，事件成本不构成帧预算威胁。

| 路径 | 成本 | 纪律 |
|---|---|---|
| 无事件帧 | beginFrame 遍历空 dirty 列表 O(1)；每 reader 一次整数比较 | 与现总线 Map.get→undefined 相当 |
| emit | 1 次信封分配 + push + dirty 标记（现 emitSimple 同样分配 GameEvent，无回归）；targetKey 经 EntityIndex 缓存查找 | 不分配闭包 |
| read() | 游标差值切片进新数组（每帧 0–2 次小分配，换 API 安全）；热路径用 readInto 零分配 | scratch 锋利边已消灭 |
| readFor | 对本帧新事件线性扫描（≤个位数） | 不建 per-target 索引 |
| flushBoundary | 仅 dirty 通道收集 + n·log n 排序（n<64）+ O(1) byTarget/byKey 直达 | 帧末一次；try/catch 成本仅在异常路径 |
| stop.beside | substep（≤48）内只 `Set.add`，边沿检测在帧末一次完成 | Set 实例双缓冲复用，零分配 |
| 内存 | 事件恰活 2 帧；双缓冲 `length=0` 复用不重分配；4096/帧保险丝 | 不做对象池（该量级收益为负，诚实取舍） |

**明确不进事件系统的热路径**：悬停高亮（组件电平）、触发器体积检测（轮询数学）、`trigger.hold` 每帧内部直派（holdDuration 修正后才低频上总线）、`player.state` 保持发射方阈值节流。净效果为负回归：删除每 adjunct 一次的 `world:block_ready` 噪声（200-adjunct 块从 200 次 emit 降为 1 次），消除散布在各系统 update 栈里的同步回调级联。

---

## 10. 明确不做什么（推迟项）及理由

1. **同步派发逃生口（emitSync）— 永不提供**。下游同帧可见性已覆盖全部现存即时性需求（点选/触发零延迟）；一旦提供必被滥用回"时序焊死在调用栈"的今天。未来若出现真·帧内闭环玩法（命中即格挡），手段是调注册序，且有快照测试看门。
2. **`system.update` 心跳事件**：step 本身就是心跳，每帧空广播纯浪费。名额留注释。
3. **`trigger.hold` 上总线 / holdDuration / oneTime / gameOnly 语义**：推迟到 PR-7 独立语义包——已有作者数据在线，**迁移期不偷改内容语义**；但类型字段现在就加（PR-0），序列化格式不二次翻修。
4. **`stop.beside` 的 0.5m 接近度语义**（旧 event.js:21-31）：需额外邻近查询，当下无消费者；第一版用零成本的碰撞接触语义，事件名不变以便未来补齐。
5. **`datasource.* / env.time / env.weather` 通道**：现走 `feedChainState` 直调且零消费者；Game 模式网络隔离（game.md:124-134）启用时再加行。教训：不再制造死线。
6. **ui.* 闭包豁免的退出（actionId + ui.action 全面化）**：路径已画死（§6.5），不阻塞主线；桌面端现在根本不用 events UI 模式。
7. **AdjunctSandbox EventBridge 实施**：AdjunctLoader 本就"暂未接入运行时"；本设计只定死协议（声明式订阅、一帧一条批量 postMessage、structuredClone 校验、动作白名单回程），随链相关功能启用。
8. **WebRTC NetSyncSystem**：接缝已就绪（actor 字段、纯数据约定、startRecording 抽头、`engine.send` 入站口、L2 二进制帧格式 game.md:226-288），实现随多人排期。
9. **稳定键的主动失效/重校验机制**：陈旧键是内容寻址固有语义（旧引擎同样如此），`edit.draft_saved` 钩子已留；自动重校验等编辑流量真实出现再做。
10. **完整确定性回放**：blocked on 固定 dt + 摩擦 `pow(friction, dt*60)` 归一（tests/README 局限 3）——并行修复项，不属于事件系统。
11. **per-target reader 索引 / 信封对象池**：每帧个位数事件量级下复杂度收益为负；§9 已留 profiling 升级路径，属 EventQueue 私有改动不动 API。
12. **借迁移修无关已知 bug**：Engine 帧 dt 可变、Coords.BLOCK_SIZE 可变静态等——记录在案、独立排期，避免迁移 PR 混入语义变更。

---

### 附：文件布局总览

```
engine/src/core/events/
├── EventTypes.ts        # EventMap、WorldEvent、BOUNDARY_ONLY、CustomEventName、module augmentation 锚点
├── EventChannel.ts      # 双缓冲通道（模块私有）
├── EventReader.ts       # 游标读者（系统侧唯一消费 API）
├── EventQueue.ts        # emit/reader/on/scope/beginFrame/flushBoundary/dropTarget/startRecording/dispose
├── TargetKeys.ts        # blk:/adj:/plr: 稳定键编码
├── EventAliases.ts      # LEGACY_EVENT_MAP（仅 Engine 门面用；含 grep 归零退场判据注释）
└── index.ts             # 导出 + 模块纪律文档（沿/电平、命令/事实、stale-target 契约、读取节律）

engine/src/core/services/
├── EntityIndex.ts       # 持久地址 ↔ EntityId 解析器（一般化 _adjunctMap）
└── Actuator.ts          # IActuator / LocalActuator / ContractActuator / ActuatorRegistry（P2）

engine/tests/unit/events/{event-queue,event-boundary,event-determinism}.test.ts
engine/tests/unit/architecture-guard.test.ts
engine/tests/systems/trigger-pipeline.test.ts   # PR-0：走真 registerTriggers 的全管线 + touch 集成
```

层级边界不变：全部新代码位于 `core/`，零 Three.js 接触；`grep -r "from 'three'" engine/src/core engine/src/plugins` 持续为空，且由 CI 守护测试固化。