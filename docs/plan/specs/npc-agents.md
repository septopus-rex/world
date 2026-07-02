# F2 — NPC / 自主 agent(行为状态机 + 感知)

> 状态:**spec 定稿 + v1 实现(2026-07-02)**。F 系列第二项,踩 F1(scheduler-and-spawn)。
> 设计预决策见 `GAME_SYSTEMS_BACKLOG.md`「F 系列统一设计模式」;本文照此展开。

## 0. 统一模式对齐(公理)

```
authored 源(ba NPC adjunct 行,进 block raw)→ 活 NPC = 运行时状态(不持久化)
行为 = 数据文档(状态机 schema,本文 §2)  → 引擎 = 解释器(NPCSystem 是一台合规 VM)
条件 = JSONLogic(npc.* 上下文,§3)        → 效果 = actuator 词汇(状态 enter 动作)
移动步进 = 仿真时间(dt)                    → 门控 = 世界时间/flags 进条件
```

- **authored 行 = 家(home)+ 源**:NPC 的 authored 位置是它的**锚点**;活体游走只改运行时
  `TransformComponent`,**不回写 stdData** → draft 序列化永远保存 home 而非游走位置,
  块重载 = 回家重生。编辑器移动 NPC = 改 home(作者意图)。
- **刷怪营地** = b9 spawner 模板放 ba 行(F1 通用生成天然支持):maxAlive + despawn 补位
  + 驱逐拆除全部白拿。
- **「同效果」边界**:状态机语义 + 转移判定 + wander 目标序列是**语义**(跨引擎必须一致,
  §2/§4 给出精确公式);移动的逐帧插值/避障实现是**行为等价**(路径不必逐位相同)。

## 1. 数据词汇:ba NPC adjunct(`0x00ba`)

```
raw 行 = [ pos, visual, behavior, seed ]

pos      [E, N, Alt]        home 锚点(块内局部,同其他 adjunct)
visual   外观(对象槽,先例 trigger 的 events 槽):
           { shape?: 'box'|'sphere', size?: [x,y,z], color?: 0xRRGGBB }   // 简单几何
         | { module: <资源id>, size?: [x,y,z] }                            // 3D 模型(走 ResourceManager)
behavior 行为文档(§2;v1 内联对象;长文档资源 id 引用 = v2,同 F4 对话分档)
seed     uint32 — wander 目标序列的确定性随机源(mulberry32,协议同 item.md §2)
```

## 2. 行为文档 schema(语义,Normative)

```jsonc
{
  "initial": "idle",
  "states": {
    "<名字>": {
      "move": { "kind": "stay" }                                   // 或 ↓
            | { "kind": "wander", "speed": 1.5, "radius": 4 }      // 绕 home 游荡
            | { "kind": "follow", "speed": 3, "stopAt": 1.5 }      // 追玩家,近到 stopAt 停
            | { "kind": "flee",   "speed": 4 }                     // 背向玩家跑
            | { "kind": "return", "speed": 2 },                    // 回 home
      "enter": [ /* actuator 动作数组,进入该状态时执行一次(delay/spawn/sound/flag…全可用) */ ],
      "transitions": [
        { "when": { "<": [{ "var": "npc.distToPlayer" }, 5] }, "to": "chase" }
        // 每 tick 按序求值,首真胜出;无真则留在当前状态
      ]
    }
  }
}
```

**语义规则**:
- 转移每帧按数组序求值,**首真胜出**;转移到自身 = 无操作(不重放 enter);
- `enter` 动作经 `world.actuator` 执行(mode 按当帧现值——gameonly 权限矩阵照常);
- 未知 state 名 / 缺 initial → 上报 + NPC 保持 stay(不炸块装载);
- 行为文档是**内容**,校验宽进(缺省补全):缺 move → stay,缺 transitions → 恒驻。

## 3. 感知:JSONLogic 上下文(npc.*)

在 trigger 的 WorldContext(flags / inventory / time / weather)之上追加:

| var | 含义 |
|---|---|
| `npc.distToPlayer` | 与玩家的**水平**距离(米,引擎 xz 平面) |
| `npc.distFromHome` | 与 home 锚点的水平距离(米) |
| `npc.state` | 当前状态名 |
| `npc.timeInState` | 进入当前状态以来的仿真秒 |

畸形条件 = 求值 false + 上报(同 TriggerSystem 惯例)。

## 4. 确定性 wander(Normative 公式)

wander 目标序列必须跨引擎一致。第 n 个目标(相对 home,水平面):

```
rng = mulberry32(seed)            // item.md §2 的同一算法,每 NPC 一个流
每次取目标消耗恰好 2 个 rng():
  r = radius × sqrt(rng())        // uniform disk(面积均匀,不是半径均匀)
  θ = rng() × 2π
  target = home + [r·cos(θ), 0, r·sin(θ)]   // 引擎系 x/z
到达(水平距 < 0.15m)→ 取下一个目标
```

移动 = 朝目标匀速 `speed` m/s 水平步进(dt 缩放);Y 恒 = 地面(块 elevation + 半高)。

## 5. v1 边界(有意不做)

- **无寻路 / 无避障**:v1 NPC 对 solid 是幽灵(直线穿行)。A*(块内 1m 栅格,由 Solid
  AABB 光栅化)+ 避障 = **v2**——先给开阔地内容用,迷宫看门人等 v2 再上;
- **无战斗**:NPC 不带 HealthComponent、不攻击(= F3);despawn 动作可移除运行时 NPC ✓;
- **不跳/不落**:Y 锁地面;
- 行为文档资源 id 引用(长文档/复用)= v2;
- 感知视线(遮挡判定)= v2(v1 距离即感知)。

## 6. 实现落点(v1,2026-07-02)

- `AdjunctType.Npc = 0x00ba` + `plugins/adjunct/adjunct_npc.ts`(visual 双形态:
  box/sphere 彩盒 或 `{type:'module', resource}` 模型,module 复用占位→swap 全管线);
- `core/components/NpcComponents.ts`:`BehaviorComponent`(doc/state/timeInState/homeEngine/
  rng 游标/当前 wander 目标);
- `core/systems/NPCSystem.ts`(SpawnerSystem 后):装配(首见 ba 实体挂 Behavior)→
  转移求值(json-logic-js,npc.* ctx)→ enter 动作 → 移动步进(写 Transform + dirty,
  VisualSync 同帧落 mesh——pool 先例)→ module 外观按移动态喂 `setAnimationState('walk'/'idle')`
  + `updateAnimation(dt)`(avatar 契约 v1 的剪辑名/回退链直接生效);
- 事件:`npc.state` `{ adjunctId, from, to }`;
- 注册表 17→18,palette『NPC』+ 默认行为(idle⇄wander 示例)。
