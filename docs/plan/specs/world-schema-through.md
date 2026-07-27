# 世界 schema 贯穿(World Schema Through)

> 状态:**spec + 实现同日完成(2026-07-27)**。
> 落点:`core/utils/WorldMetrics.ts`(每 World 一份不可变几何)+ 世界文档
> `world.range`/`block`/`diff` + 协议 `world.md §1/§3/§9` 双语改口。
> 测试:`unit/world-metrics.test.ts`(25 例,含 grep 闸)+ `content-conformance`
> 新增 world doc 门禁;e2e 11 个相关 spec 回归通过。
> 预决策(与用户确认,2026-07-27):**真正允许世界间不同尺寸**(不是"机制数据化但
> 值仍校验为协议值");范围**P0–P4 全做**。

## 1. 动机:「世界配置管理」缺了地基那一块

世界文档(`default.world.json`)早就是数据通道的正主——出生点、体格、移动能力、
背包、avatar 目录、`block.max/color/texture`、`debug.*`、`time.*` 全都从它读。
但**世界最基础的那几个参数偏偏绕开了它**:

| 参数 | 改造前 | 位置 |
|---|---|---|
| 块尺寸 `[16,16,16]` | GlobalConfig 硬编码 → World 构造写进 `Coords.BLOCK_SIZE` **全局静态** | `GlobalConfig.ts` · `World.ts` · `Coords.ts` |
| 网格 `[4096,4096]` | GlobalConfig 硬编码,**世界文档里根本没这个字段** | `GlobalConfig.ts` |
| 高度粒度 `0.1` | 声明了,**零消费者** | — |
| 世界数 `96` | 声明了,**零消费者** | — |

后果不是"少读一个字段",而是**链上的世界配置管理永远缺一块**:一个世界的网格
定义不了,`world` 这个概念在数据层就是残的。

同构先例:**P7「默认世界也是数据」**——scene 注册表退役、`ContentResolver` 上位、
「内容从哪来」只有一个答案。这次是同一条线往上收一格:**「世界长什么样」也只有
一个答案。**

## 2. 决策:值可以是常量,机制不能是

「4096×4096 的 16 米地块」**在实践中仍然是绝大多数世界的形态**——参考世界
(创世世界)声明的正是这组值。但那是**数据的取值**,不是**机制的约束**。

于是拆成两件事:

- **语义**:`range`/`block`/`diff` 是**领主级可变配置**,由世界文档声明,
  缺省时取协议默认值(4096/16/0.1)。引擎只做**合法性**校验,不做"必须等于
  协议值"校验(用户明确选了这一档)。
- **元宇宙级的那一个例外**:`max = 96` 留在 GlobalConfig。它属于宇宙立方体
  (6 面 × 4×4),**不属于任何单个世界**,放进世界文档是范畴错误。

**合法性边界**(非语义,纯防御——链上世界配置是不可信输入):
`range` 每轴 `1..1048576` 的整数 · `block` 每轴 `0.01..1024` 米 ·
`diff` 为正且不大于块高。越界值**回退到协议默认并上报**(`reportError`,
severity `warn`),不得静默接受——照 `BlockSystem` 处理敌意 import 的既有做法。

### 2.1 这推翻了 D6/D7 的一半

基础数据审计 D6/D7(2026-07-09)判定这几项是「协议不变量,所有世界共享、
**不可覆盖**」,并据此认定 `Coords/Constants` 里的 `BLOCK_SIZE`「合法保留」。
本次推翻后半句。原判决**没有改写**,而是在 `base-data-audit.md` D7 下追加了
修订块——过程文档留原判比抹掉更有价值。

## 3. 症结不是"忘了读 config",是两个结构问题

**① 全局可变静态。** `Coords.BLOCK_SIZE` 是 class static,进程级共享。多个
World 并存时(vitest 用例、`BlockPreviewLoader`、`StylePackPreviewLoader`)
互相覆盖,**后构造的赢**。D7 当年判定"合法保留"的,正是这个缺陷。

**② 模块加载期快照。** `ENGINE_CONSTANTS.BLOCK_SIZE` 与 `GlobalConfig` 的
`export const BLOCK_SIZE` 在 import 时求值,世界文档**永远影响不到它们**。
两者当时都已是零消费者的死导出——但留着就是下一次踩坑的坑位。

## 4. 落点

### 4.1 `core/utils/WorldMetrics.ts`(新)

每 World 一份**不可变**实例,由 `WorldMetrics.from(config.world)` 构造,
`World` 以 `public readonly metrics` 持有。承担两类职责:

- **几何数据**:`range` / `block` / `diff`,以及 `blockWidth`(东)、
  `blockLength`(北)、`blockHeight`(高)三个语义访问器。
- **带块偏移的换算**:`septopusToEngine` / `engineToSeptopus` /
  `blockOrigin` / `blockCentre` / `containsBlock` / `centreBlock`。

`Coords` 相应瘦身为**纯无状态**的轴序与旋转换算(`localSeptopusToEngine`、
`getBoxDimensions`、`engineYawToHeading`、rotation 两向、`snapToGrid`)。
分界线很清楚:**方法签名里出现 `[bx, by]` 的,归 metrics;不出现的,归 Coords。**

> 爆炸半径比看着小:`Coords.*` 全仓 89 处调用、46 个文件,但真正依赖块尺寸的
> 只有那两个换算方法。31 处调用点全部能拿到 `world`,一次改干净,**没有留
> deprecated 静态**——留了 grep 闸就钉不死。

### 4.2 顺带修掉的三个真 bug

1. **`Engine.bootWorld` 顺序错**:出生点换算跑在 `new World()` **之前**,
   用的是**上一个世界**残留在静态里的块尺寸。已挪到构造之后(确认过
   `config.player.start` 在构造期无消费者,`HealthSystem` 是 respawn 时才读)。
2. **两个横向轴共用 `block[0]`**:非正方形网格或地块必然错位。现在东西用
   `blockWidth`、南北用 `blockLength`,协议 §5.1 也把这条写进了规范。
3. **多 World 几何互相污染**:见 §3①,随静态删除消失。

### 4.3 逐层贯穿清单

- **引擎**:31 处换算调用点 → `world.metrics`;5 处 `config.world.block` 直读
  → `metrics.block`;`BlockLODSystem` 的 `[8,8,0]` 硬编码块中心 →
  `blockCentre()`;`EnvironmentSystem` 雾半径 → `max(blockWidth, blockLength)`
  (非正方形网格要覆盖到**最远**边界);`GenerationDoc` 校验的 `1..4096` →
  接 `range` 参数(客户端传 `world.metrics.range`,无 world 的网关取默认)。
- **客户端**:loader 暴露 `worldMetrics`(`worldRange` 保留为其投影);
  `WorldMap2D` 初始中心 → `centreBlock()`、两处 `/16` → 分轴块尺寸;
  `SppStudio` 沙箱块偏移 → 分轴;`StylePackPreviewLoader` → 预览世界自己的
  metrics;`DEFAULT_PLAYER_STATE` 的 `[2048,2048]` **删除**(它在唯一消费点
  下一行就被 level start 覆盖,是死数据 + 4096 网格的隐含假设)。
- **死代码**:`ENGINE_CONSTANTS.BLOCK_SIZE` · `GlobalConfig` 的
  `export const BLOCK_SIZE` · `GridSystem.BLOCK_SIZE` · 14 个文件的无用
  `Coords` import。

## 5. 门禁(改造前是真空)

`content-conformance` 原先只校 `blocks/levels/stylepacks/assets`,**世界文档
只被读了一个 `block.texture` 字段**——根本没有 schema 校验。补齐:

- **world doc 门禁**:几何三项的形状与边界(声明了就必须可用,否则
  `WorldMetrics` 会回退,等于静默忽略文档的意图)· `index` 0..95 · `mode` 取值 ·
  **出生点必须落在本文档自己声明的网格内** · 出生点局部坐标不得超出块尺寸。
- **levels 越界校验**:关卡块坐标对着世界 `range` 校验——世界外的坐标永远流式
  不进来。
- **`unit/world-metrics.test.ts`**:默认值 · 非 16 尺寸的换算与往返 ·
  **两个实例互不污染**(直接钉 §3① 那个 bug)· 损坏文档回退**并上报** ·
  以及一道 **grep 闸**:`4096` 只许出现在 `WorldMetrics.ts` / `GlobalConfig.ts`,
  且 `Coords.ts` 不得再有 `BLOCK_SIZE` / `septopusBlock`。

> grep 闸**植入探针实测过会红**(往 `GridSystem.ts` 塞一行 `= 4096` → 立刻
> 失败并报出文件行号),不是空扫。注释行被剥离,散文里引用这些数字不受影响。

## 6. 验收

- 引擎单测 **735 passed**(新增 25)· `tsc` 干净 · Three.js 层级边界 grep 无输出
- desktop + mobile 构建通过
- e2e 11 个相关 spec 全过:`map2d` · `persistence`×3 · `portal-travel` ·
  `boot-and-render` · `block-streaming`×2(含雾半径)· `floating-origin`×2 ·
  `stylepack-editor`

## 7. 后续

- **未做,有意**:`world.max` 仍是 GlobalConfig 常量(元宇宙级,见 §2);多世界
  并存的运行时切换(`Engine.bootWorld` 已能正确处理不同几何,但客户端还没有
  "换世界"的入口)。
- **下一个自然的接口**:世界文档从 CID 拉取时,几何随文档一起来——本次改动后
  这条路径**不需要再动引擎代码**,这正是做它的理由。

## 8. 关联

- `protocol/cn|en/world.md` §1(世界几何表)· §3(不可变配置移除网格)·
  §5.1(块偏移按轴分别算)· §9(常量分桶修订)
- `docs/plan/specs/base-data-audit.md` D7 的修订块(原判决 + 推翻说明)
- `docs/architecture/coordinate.md`(块坐标上界改为世界声明)
- `full-data-migration.md` / `bevy-reference-engine.md`(第二引擎干净房间复现:
  几何进了数据,差分裁判才有完整输入)
