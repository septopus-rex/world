# F4 — 对话 / 任务(Dialogue & Quests)

> 状态:**spec 定稿 + v1 实现(2026-07-02)**。预决策(GAME_SYSTEMS_BACKLOG)照常:
> 对话树 = 纯数据文档;引擎只加一个**走树状态机**,零新执行原语;锚点 = 可交互物的能力
> (非独立对话 adjunct);UI 面板归客户端。
>
> **客户端对话 UI 已落地(2026-07-04)**:`client/desktop/src/components/DialogueUI.tsx`
> ——纯视图,镜像 `dialogue.started/node/ended` 事件(文本 + 预过滤的可见选项),按钮回调
> `Engine.chooseDialogue/endDialogue`。首个完整任务配方实证:仙剑微缩 RPG「灵草记」
> (`client/desktop/src/levels/xianjian.level.json`,flags 任务三态:接取 when !quest_herb
> → 交付 when wolf_slain ∧ inventory.tpl_3≥1 → 终局收敛;奖励=spawn 掉落绕 bag 的
> Game-only 门控),e2e `rpg-xianjian.spec.ts` 经真实 UI 全程通关 + reload 存续。

## 1. 数据词汇:对话文档(挂在 ba NPC 行 slot 5)

```
ba raw = [ pos, visual, behavior, seed, hp?, dialogue? ]
```

```jsonc
dialogue = {
  "start": "hello",
  "nodes": {
    "hello": {
      "text": "旅人,你好。要看看我的货物吗?",
      "options": [
        { "label": "看看", "to": "shop" },
        { "label": "有钥匙才告诉你的秘密", "when": { ">=": [{ "var": "inventory.tpl_2" }, 1] }, "to": "secret" },
        { "label": "再见",
          "actions": [{ "type": "flag", "target": "met_merchant", "method": "", "params": [true] }],
          "to": null }                       // to: null | 缺省 = 结束对话
      ]
    },
    "shop":   { "text": "都是好东西。", "options": [{ "label": "回去", "to": "hello" }] },
    "secret": { "text": "地下室在雕像后面。", "options": [{ "label": "…", "to": null }] }
  }
}
```

**语义规则**:
- `when`(JSONLogic,可选)过滤选项**可见性**——上下文 = flags / inventory / time / weather
  (与 trigger 同源),每次进节点求值;
- `actions`(可选)= actuator 全词汇,**选中时执行**(flag=任务推进、bag=给道具、
  damage/spawn 也可——"选错话挨打"可表达);动作按**当前 mode** 过权限矩阵;
- `to` = 下一节点 id;`null`/缺省/未知 id = 结束;
- 畸形文档(缺 start/nodes)→ 上报 + 不可对话(不炸)。

## 2. 交互与状态(引擎侧)

- **启动**:`interact.primary` 点击带 dialogue 文档的 ba NPC(距离 ≤ 3.5m)→
  `world.activeDialogue = { npcEid, doc, nodeId }` + `dialogue.started` 事件;
- **推进**:`Engine.chooseDialogue(index)`(index 对**可见**选项计)→ 执行 actions →
  `to` 前进 → `dialogue.node` / 结束 → `dialogue.ended`;`Engine.endDialogue()` 主动退出;
- **单例**:同时只有一场对话;对话中再点其他 NPC 忽略;
- **NPC 暂停**:`activeDialogue.npcEid` 的 agent 不移动(NPCSystem 跳过)——对话对象不会说着说着走掉;
- 事件载荷带 `text + options(可见 label 数组)`——客户端 UI 纯渲染 + 回调 choose,零逻辑。

## 3. 任务/目标 = flags 配方(有意不加新原语)

任务状态机 = **flags + JSONLogic + 对话/trigger 动作**已完整表达:

```
接任务:对话选项 actions → flag quest_x = 'active'
推进:  trigger/npc.died→(actuator flag)quest_x_kills += … (数值 flag)
交付:  对话选项 when 检查 flags/inventory → actions 给奖励 + flag quest_x = 'done'
持久化: globalFlags 本就随 session meta 进 IDB ✓
```

目标 HUD = 客户端读 flags 渲染(parkour 计时 HUD 先例)。**引擎不加 quest 原语**——
等真实叙事内容暴露出 flags 表达不了的结构再议(YAGNI,记录在案)。

## 4. v1 边界

- 对话文档内联 ba 行(短对话);长文档/跨 NPC 复用 = 资源 id 引用(v2,同 AuthoredLevel 路);
- 无语音/口型(A/V 媒体 adjunct 可另挂环境音);无打字机/表情指令(UI 层自由发挥);
- 立牌/物件对话 = 给 e1/box 挂 dialogue?v2——v1 只有 ba NPC 可对话。

## 5. 实现落点(2026-07-02)

`DialogueSystem`(interact.primary reader + 走树)· `World.activeDialogue` ·
`Engine.dialogueState/chooseDialogue/endDialogue` · 事件 3 个 · NPCSystem 对话暂停 ·
测试 `systems/dialogue.test.ts`。
