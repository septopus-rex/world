# Septopus 附属物类型规范(Adjunct Type Registry)

> **规范级(Normative)**。本文逐一定义 18 个内置附属物类型的 raw 数据槽位语义——
> 这是「跨端、纯数据 3D 世界」承诺的核心参考:任何引擎按本文实现编解码,
> 同一份地块数据必须解出同一个世界。架构与生命周期见 [adjunct.md](adjunct.md);
> 触发器逻辑与动作词汇见 [trigger.md](trigger.md);确定性钉点见
> [determinism.md](determinism.md)。参考实现:`engine/src/plugins/adjunct/*.ts`
> (每型文件头注释与本文一一对应,漂移即 bug)。

## 0. 通用约定

- **raw 行** = 一个 JSON 数组;地块 raw 的 `adjuncts` 槽按 `[typeId, [行, 行, …]]`
  分组承载(见 [block.md](block.md) §raw)。
- **坐标/尺寸**:一律 **SPP 轴序**(X东、Y北、Z高,米),相对地块原点(西南角);
  引擎装载时自行转换到内部轴序,创作者与数据不关心内部表示。
- **旋转**:`[rx, ry, rz]` 弧度,**引擎系 Euler XYZ、绕几何中心**——绕竖直轴的
  yaw 在 **index 1**。这是刻意的不对称(位置按 SPP 系、旋转按引擎系),规范细节
  见 [world.md](world.md) §坐标与旋转契约。
- **可省尾槽**:行尾的可选槽位可整体省略,缺省值见各表;实现不得因尾槽缺失报错。
- **solid(可碰撞)**:`a2` 恒为 solid;标准 7 槽类型的 slot 6 `stop` 非空即 solid;
  `b4` 恒为 solid。其余类型不参与行走碰撞。
- **派生实体(derived)**:由 b6/b9/c2/actuator-spawn 在运行时展开/生成的实体
  标记 `derivedFrom`,**永不写回持久化数据**(序列化只保留源行),随块销毁。

## 1. 类型总表

| typeId | 名称 | 一句话 | 槽位 § |
|---|---|---|---|
| `0x00a1` (161) | wall 墙 | 标准几何盒(语义:墙体) | §2 |
| `0x00a2` (162) | box 盒 | 标准几何盒,**恒为 solid**,支持贴图 | §2 |
| `0x00a3` (163) | light 光源 | 点光/聚光/平行光 | §3 |
| `0x00a4` (164) | module 模型 | 外部 3D 模型(GLTF/GLB/FBX/OBJ/DAE) | §4 |
| `0x00a5` (165) | water 水 | 标准几何盒(半透明水体,无碰撞) | §2 |
| `0x00a6` (166) | cone 锥 | 圆锥/圆台 | §2.1 |
| `0x00a7` (167) | ball 球 | 球体(视觉;碰撞球柱见 b4) | §2 |
| `0x00b4` (180) | stop 碰撞体 | 隐形碰撞体,**三形状**:盒/圆柱/楔形坡 | §5 |
| `0x00b5` (181) | item 物品 | 可拾取物品(模板+seed 确定性实例) | §6 |
| `0x00b6` (182) | particle 弦粒子 | SPP 弦粒子源,展开为标准附属物 | §7 |
| `0x00b8` (184) | trigger 触发器 | 事件+条件+动作;slot 6 可声明传送锚点 | [trigger.md](trigger.md) |
| `0x00b9` (185) | spawner 生成器 | 定时生成派生实体 | §8 |
| `0x00ba` (186) | npc 智能体 | 数据状态机驱动的自主 agent(可战斗/可对话) | §9 |
| `0x00c1` (193) | track 轨道 | Catmull-Rom 管道(过山车/导轨) | §10 |
| `0x00c2` (194) | motif 生成式 | 模板+seed 确定性展开为附属物组 | §11 |
| `0x00e1` (225) | link 链接 | 可点击 URL/QR 面板 | §12 |
| `0x00e2` (226) | audio 音频 | 空间音频源 | §13 |
| `0x00e3` (227) | video 视频 | 视频屏幕 | §13 |

## 2. 标准 7 槽(a1 wall · a2 box · a5 water · a6 cone · a7 ball)

```
[ size, pos, rot, resource, repeat, animation, stop ]           // a2 另有可选 slot 7
```

| 槽 | 字段 | 类型/缺省 | 说明 |
|---|---|---|---|
| 0 | `size` | `[E, N, Alt]`,缺省 `[1,1,1]` | 全长包围盒(米)。a7 取 `size[0]` 为直径 |
| 1 | `pos` | `[x, y, z]`,缺省 `[0,0,0]` | 几何中心相对地块原点 |
| 2 | `rot` | `[rx, ry, rz]`,缺省 `[0,0,0]` | 引擎系 Euler(见 §0) |
| 3 | `resource` | number,缺省 `0` | 颜色/材质索引(世界资源目录) |
| 4 | `repeat` | `[u, v]`,缺省 `[1,1]` | 贴图平铺 |
| 5 | `animation` | 动画对象/`null` | SPP 动画时间轴,见 [animation.md](animation.md) |
| 6 | `stop` | 任意/`null` | 非空 ⇒ solid(a2 无视此槽恒 solid) |
| 7 | `texture` | 资源 id/CID(仅 a2,可选) | 显式贴图;设置后按资源管线解析(可为 IPFS CID) |

### 2.1 a6 cone 的 size 语义(特例)

`size = [底半径, 高, 顶半径]`(而非包围盒)。顶半径 0 = 圆锥,>0 = 圆台。

## 3. a3 light 光源

```
[ lightType, pos, rot, color, intensity, distance, angle, shadow ]
```

| 槽 | 字段 | 缺省 | 说明 |
|---|---|---|---|
| 0 | `lightType` | `0` | `0` 点光 · `1` 聚光 · `2` 平行光 |
| 1 | `pos` | `[8,8,8]` | 光源位置 |
| 2 | `rot` | `[0,0,0]` | 聚光/平行光的指向 |
| 3 | `color` | `0xffffff` | 十进制/十六进制整数 |
| 4 | `intensity` | `1` | 强度 |
| 5 | `distance` | `0` | 点光/聚光射程(0=无限) |
| 6 | `angle` | `π/3` | 聚光锥角(弧度),其他类型忽略 |
| 7 | `shadow` | `0` | `1` = 投影(实现可按性能预算降级) |

## 4. a4 module 外部模型

```
[ size, pos, rot, resourceId, animation, stop ]
```

`resourceId` 经世界资源目录解析到模型文件(格式 GLTF/GLB/FBX/OBJ/DAE)。
装载语义:**占位盒 → 异步加载 → 替换**;同 id 多处摆放须**一次加载、多实例引用**。
模型缩放到 `size` 包围盒(authored 尺寸优先于模型原生尺寸)。骨骼动画剪辑名
契约见 [avatar-animation.md](avatar-animation.md)。

## 5. b4 stop 碰撞体

```
[ size, pos, rot, mode, animate, shape ]
```

| 槽 | 字段 | 缺省 | 说明 |
|---|---|---|---|
| 0–2 | size/pos/rot | — | 同标准槽 |
| 3 | `mode` | `1` | `1` BODY(全阻挡)· `2` FOOT · `3` HEAD(前向兼容;v1 一律按全体积) |
| 4 | `animate` | `null` | SPP 动画 |
| 5 | `shape` | `1` | **`1` 盒(AABB,旋转不参与碰撞)· `2` 球柱(半径=`size[0]/2`,高=`size[2]`,圆形足迹)· `3` 楔形坡(顶面从南缘 0 升到北缘 `size[2]`;碰撞只认竖直轴 yaw=`rot[1]`)** |

坡的顶面是**高度函数**(线性平面);行走引擎必须支持沿坡连续行走(参考实现:
step-over 通道逐子步骑行)。渲染体为半透明提示色;生产内容可配任意视觉。

## 6. b5 item 物品

```
[ pos, templateId, seed, count, rot? ]
```

实例属性由 `(templateId, seed)` 确定性推导(mulberry32,推导顺序逐位钉死)——
规范见 [item.md](item.md)(规范级)。`count` 缺省 1。拾取语义:点击交互、
原子入包(背包变更与地块数据重序列化同帧完成)。

## 7. b6 particle 弦粒子

```
[ origin, cells, theme ]
```

`cells` 为弦粒子胞元数据、`theme` 为展开主题(缺省 `'basic'`)。装载时经 SPP
展开器**确定性展开为独立的标准附属物实体**(墙/门洞/窗/触发器等),源行不渲染。
展开语义与相邻消除规则见 SPP 协议(`docs/features/spp*.md` 与独立 SPP 规范仓)。

## 8. b9 spawner 生成器

```
[ pos, template, interval, maxAlive, autoStart, seed ]
```

| 槽 | 字段 | 缺省 | 说明 |
|---|---|---|---|
| 1 | `template` | `null` | `[typeId, rawRow]` 内联模板;rawRow 的 pos 相对本生成器 |
| 2 | `interval` | `5` | 生成间隔(**仿真时间**秒,非墙钟) |
| 3 | `maxAlive` | `1` | 存活上限(生成物死亡/移除后释放名额) |
| 4 | `autoStart` | `1` | `0` 时等待触发器动作启动 |
| 5 | `seed` | `0` | 生成物 seed 派生源 |

## 9. ba npc 智能体

```
[ pos, visual, behavior, seed, hp, dialogue, interact, touch ]
```

| 槽 | 字段 | 说明 |
|---|---|---|
| 0 | `pos` | **家锚点**。运行时游走只改运行时状态,持久化数据永远存锚点 |
| 1 | `visual` | `{shape:'box'\|'sphere', size?, color?}` 或 `{module:<资源id>, size?}` |
| 2 | `behavior` | 行为文档(数据状态机),见 §9.1 |
| 3 | `seed` | 游走随机流种子(mulberry32) |
| 4 | `hp` | `>0` 可伤害;缺省/0 = 无敌氛围 NPC。运行时血量不持久化(块重载=满血) |
| 5 | `dialogue` | 对话树文档,见 §9.2;非空 = 可对话(点击优先进对话) |
| 6 | `interact` | `{when?, cooldown?(0.4s), actions[]}` — **玩家攻击动词**:点击无对话的 agent 按冷却执行动作(动作词汇见 trigger.md;`damage target:'self'`=打中我) |
| 7 | `touch` | `{damage, interval?(1s), radius?(1.2m)}` — **随体接触伤害**(仅 Game 模式落伤) |

### 9.1 behavior 行为文档

```jsonc
{ "initial": "idle",
  "states": {
    "<状态名>": {
      "move": { "kind": "stay"|"wander"|"follow"|"flee"|"return", "speed"?, "radius"?, "stopAt"? },
      "transitions": [{ "when": <JSONLogic>, "to": "<状态名>" }],   // 首个为真者生效
      "enter": [ <动作>… ]                                          // 进入状态时执行一次
    } },
  "onDeath": [ <动作>… ] }                                          // hp 归零时执行(掉落=spawn)
```

JSONLogic 上下文:`npc.{distToPlayer, distFromHome, state, timeInState}`、
`flags.*`、`inventory.*`、`time`、`weather`。**wander 目标公式为规范钉点**
(每目标恰好消耗 2 次 rng,家心圆盘均匀分布),见 [determinism.md](determinism.md)。

### 9.2 dialogue 对话树文档

```jsonc
{ "start": "<节点>",
  "nodes": { "<节点>": {
      "text": "…",
      "options": [{ "label": "…", "when"?: <JSONLogic>, "actions"?: [<动作>…], "to"?: "<节点>" }]
  } } }
```

点击可对话 agent(距离 ≤3.5m)开启;全局同时仅一段对话;对话中的 agent 定身;
`when` 过滤可见选项;`to` 缺失/无效 = 结束。任务系统**有意不设新原语**:
任务=「flags 写入 + 选项 when 读 flags/inventory」的配方。

## 10. c1 track 轨道

```
[ pos, path, radius ]
```

`path` = 控制点列表 `[[E,N,Alt], …]`(相对 pos),按 Catmull-Rom 样条挤出管道。
载具沿轨运动的会话语义(进入=Game 门控)由实现定义,几何为规范。

## 11. c2 motif 生成式内容

```
[ origin, template, seed, params ]
```

按 `template` 名查生成器目录,以 `seed`(mulberry32)+`params` **确定性展开**为
标准附属物组(当前一律 a2 盒行,solid)。源行是唯一持久化物;展开物为派生实体、
**不占地块行数预算**。同 `(template, seed, params)` 必须展开出逐字节相同的行
(iNFT 性质)——见 [determinism.md](determinism.md)。可选 `params.texture`
(内容 CID)供活图版等模板消费。

## 12. e1 link 链接面板

```
[ size, pos, rot, resource, repeat, animation, stop, url, texture? ]
```

标准 7 槽 + slot 7 `url`(字符串)+ 可选 slot 8 `texture`(QR/图片资源 id 或 CID)。
点击(主交互射线)→ 宿主打开 `url`(桌面实现:`window.open`;实现可加确认 UI)。

## 13. e2 audio / e3 video 媒体

```
e2: [ size, pos, rot, source, autoplay, loop, volume, refDistance ]
e3: [ size, pos, rot, source, autoplay, loop, muted, volume ]
```

`source` 经资源管线解析(id/CID/URL)。e2 为空间音频(`refDistance` 缺省 8m,
衰减模型实现自选但须随距离衰减);e3 为面板上的视频纹理(缺省 `muted=1`——
浏览器自动播放策略)。媒体随实体销毁必须完全释放。

---

*协议版本:v0.1(对应引擎 v0.1.0)。变更须同步 cn/en 双语并记入根 CHANGELOG。*
