# F3 — 战斗 / 伤害框架(Combat & Damage)

> 状态:**spec 定稿 + v1 实现(2026-07-02)**。踩 F1(spawn/定时)+ F2(NPC)。
> 统一设计模式(GAME_SYSTEMS_BACKLOG)照常:定义=数据、实例=运行时、效果=actuator。
>
> **v1.1 补齐(2026-07-04,随仙剑微缩 RPG 落地)**:①**玩家攻击动词**(§1.4)——
> ba slot 6 `interact = { when?, cooldown?(默认 0.4s), actions }`,点击**无对话**的
> agent 经 actuator 跑其 actions(有对话的点击归 DialogueSystem,对话优先);配套
> `damage` 动作新增 **target `'self'`** = 打到发起实体自身(authored 行不知道自己的
> 运行时 adjunctId)。②**随体接触伤害**(§1.5)——ba slot 7 `touch = { damage,
> interval?(默认 1s), radius?(默认 1.2m) }`,NPCSystem 用每帧已算的 distToPlayer
> 打点,follow 追上谁就咬谁;走 Game 门控的 damage 通道(Normal 里蹭过不掉血)。
> 实证:`npc-combat-verbs.test.ts`(冷却/门控/掉落)+ `xianjian-quest.test.ts` +
> e2e `rpg-xianjian.spec.ts` 全程通关。

## 0. 范围与已有件

- **挨打侧已有**:`HealthSystem`(player damage/heal/fell → died/respawned)✓;
- **静态伤害体积已可做,不属 F3**:b8 trigger + `player:damage` 动作 = 尖刺陷阱/岩浆池(现有机制);
- **F3 新增 = 会动的战斗对象 + 双向伤害通道 + NPC 可死**。
- **权限**:伤害动作沿用 game.md 权限矩阵——**仅 Game 模式生效**(与既有 player damage 一致)。

## 1. 数据词汇

### 1.1 `damage` actuator 动作(通用施伤通道)

```jsonc
{ "type": "damage", "target": "player" | "<npc adjunctId>", "method": "", "params": [<amount>] }
```
- target `player` → 走既有 `player:damage`(HealthSystem);
- target = NPC adjunctId → 扣其 hp(§1.2),0 → 死亡流程;
- 仅 Game 模式(否则上报忽略,同 bag/player 惯例)。

### 1.2 ba NPC 行扩展:hp 槽(slot 4)

```
raw = [ pos, visual, behavior, seed, hp? ]
hp   number > 0 = 可伤害;缺省/0 = 无敌(纯氛围 NPC)
```
- 运行时 hp 在 `BehaviorComponent`(不持久化——块重载=满血重生,arcade 语义);
- **死亡**:hp ≤ 0 → 执行行为文档顶层 `onDeath: [actions]`(actuator 全词汇——
  **掉落 = `spawn` b5 item 行**,零新原语)→ 实体销毁 + `npc.died` 事件;
- authored NPC 死亡 = 实体消失,块重载复活(源行还在);spawner 生成的 = maxAlive 空位,下个间隔补。

### 1.3 `projectile` actuator 动作(会动的伤害体)

```jsonc
{ "type": "projectile", "target": "", "method": "", "params": [{
    "speed": 8,          // m/s
    "damage": 10,
    "radius": 0.35,      // 命中球半径(m)
    "ttl": 3,            // 存活秒(仿真时间)
    "at": "player",      // 发射瞬间锁定玩家方向(默认);或
    "dir": [1, 0, 0],    // 显式 SPP 方向 [E, N, Alt](与 at 二选一)
    "visual": { "color": 0xff5522, "size": 0.3 }   // 可选,默认小球
}] }
```
- 从 `sourceEntity`(NPC/trigger)的位置发射——NPC 行为文档 enter 动作里放一个
  projectile,配 timeInState 循环转移 = **周期开火**,全数据表达;
- 实例 = 运行时派生实体(`derivedFrom` 发射者):serializer skip、随块销毁 ✓;
  **生命周期挂发射者所在块**(v1 取舍:战斗发生在已加载块内;TTL 短,跨块位移本身自由);
- 直线匀速飞行(`ProjectileSystem`,仿真 dt);命中判定 = **球心距测试**
  (与玩家:水平+垂直中心距 < radius + 0.5;与其他 NPC 同理)→ `damage` 语义 + 自毁;
- TTL 到期自毁。命中/到期都发 `spawn.removed`;命中另发 `combat.hit`。

## 2. 事件

- `combat.hit` `{ targetKind: 'player'|'npc', adjunctId?, amount }`
- `npc.died` `{ adjunctId }`

## 3. 配方(零新原语的表达,写给内容作者)

- **接触伤害(近战怪)**:behavior 状态循环 `chase →(distToPlayer<1.2)→ bite{enter:[damage player]} →(timeInState>1)→ chase`;
- **炮塔**:`idle →(distToPlayer<8)→ fire{enter:[projectile at player]} →(timeInState>1.5)→ idle`(循环);
- **掉落**:`onDeath: [{type:'spawn', params:[0x00b5, [[0,0,0.4], 1, <seed>, 1, [0,0,0]]]}]`。

## 4. v1 边界

- 无弹道重力/抛物线(直线);无穿透/AoE/DoT/击退(后续按内容需求);
- 玩家的攻击输入(挥剑按键等)= 宿主/客户端层,引擎原语是 damage/projectile 通道;
- NPC 互伤 = 支持(damage/projectile 对 NPC 目标),阵营系统 = v2。

## 5. 实现落点(2026-07-02)

`Actuator` +damage/+projectile · `BehaviorComponent.hp` + NPCSystem 死亡流程 ·
`ProjectileComponent`/`ProjectileSystem`(NPCSystem 后)· 事件 2 个 ·
测试 `systems/combat-damage.test.ts`。
