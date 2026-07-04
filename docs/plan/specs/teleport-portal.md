# 传送 / 传送门(Teleport & Portals)

> 状态:**spec + v1 实现(2026-07-04 同日)**。
> 落点:b8 trigger 行 **slot 6 = anchor**(`{name, when?}`)+ `player.teleport`
> actuator 动作(只认锚点)+ `teleport.done/denied` 事件 + 2D 地图快速旅行
> (同一动作通道)。测试:headless `portal-teleport.test.ts` + e2e。
> 预决策(与用户确认,2026-07-04):**传送门=配方非新 adjunct**;**动作只认锚点、
> 不认裸坐标**;出发侧许可=trigger conditions(现有),到达侧许可=anchor.when(新)。

## 1. 动机:空间访问权是游戏性的地基

大地图(4096×4096 块)与未来多世界下,步行不是唯一移动方式。但**开放裸坐标
乱跳会摧毁游戏性**:任务节奏、区域解锁、战斗区的进出仪式感,全部建立在"空间
访问有序"上。设计目标:

- 作者可以用 stop 把一片块**完全围起来**,进出只走传送门;
- 传送必须**双侧合法**:出发侧(你有没有资格走这扇门)+ 到达侧(那个地方接不接受你);
- 快速旅行(2D 地图点击)与内容传送门走**同一条门控通道**——门控只管数据不管 UI 就是装饰。

同构先例:**Game 模式进入**——目的地声明(`block.game=1`)+ 引擎在 `setMode`
咽喉点强制。teleport 照抄:目的地声明(anchor)+ 引擎在动作咽喉点强制。

## 2. 数据词汇

### 2.1 锚点(b8 trigger 行 slot 6)

```
b8 raw = [ size, centre, rot, shape, gameOnly, events, anchor? ]
anchor = { "name": "shrine-north", "when": <JSONLogic>? }
```

- **name**:世界内容层面的锚点名(作者自管唯一性;重名时取先解析到者)。
- **when**(可选):**到达侧许可**——JSONLogic,读 `flags / inventory / time /
  weather`;不通过 → 传送拒绝(`teleport.denied`,reason `refused`)。
- 锚点的**位置=该 trigger 行的 centre**(含块 elevation);一块传送门 adjunct
  天然可以既是入口(events 带 teleport 动作)又是目的地(anchor)——双向门对
  = 两行互指。
- 挂在 b8 上而非新 adjunct:锚点是"可交互物的能力"(F 系列预决策的锚点原则),
  且 trigger 行本来就是门控逻辑的家。

### 2.2 `player.teleport` 动作

```jsonc
{ "type": "player", "method": "teleport",
  "target": "shrine-north",          // 锚点名 —— 不接受裸坐标
  "params": [[2048, 2052]] }         // 目的块提示(路由用,合法性不来自它)
```

- **target=锚点名**:没有锚点的块物理上不可达——乱跳被机制杜绝而非被规则禁止;
  落点精确(锚点自带位置);内容改版锚点随 adjunct 走,不留失效坐标。
- **params[0]=目的块 [nx,ny]**:纯路由提示(无全局索引的代价,与 2D 地图的
  视口流式同一取舍)。解析顺序:①活体实体扫描(块已加载,提示可被实际位置
  修正);②`dataSource.view(nx,ny,0)` 按需取 raw 扫描(未加载的远块)。
  提示块里没有该锚点 → 拒绝(reason `no-anchor`)。
- **任意模式可用**(同 setSpawn/enterGame):从 Game 区传出,GameZoneSystem
  的离区语义照常接管。
- 落地:写 Transform(锚点位 + 抬升 1.2m)+ 清速度;远块未加载时**悬停安全网**
  (`hasGroundBelow`=false → 等地面)+ `popOutIfEmbedded` 兜底落点嵌入——
  三件安全件全部复用,teleport 自身零新运动逻辑。
- 事件:`teleport.done { anchor, block }` / `teleport.denied { anchor, block, reason }`
  (reason: `bad-args` | `no-anchor` | `refused`)。

### 2.3 传送门=配方(零新 adjunct)

```jsonc
// 出发侧:b8 trigger('in')+ conditions(出发侧许可)+ fallbackActions(拒绝反馈)
{ "type": "in",
  "conditions": { ">=": [{ "var": "inventory.tpl_2" }, 1] },   // 持钥匙才放行
  "actions":  [{ "type": "player", "method": "teleport", "target": "shrine-north", "params": [[2048, 2052]] }],
  "fallbackActions": [{ "type": "sound", "target": "denied" }] }
```

视觉自便:发光 box、光柱、拱门 motif、e1 面板皆可——与"尖刺陷阱 = trigger +
damage"完全同构。

## 3. 快速旅行(2D 地图,同一通道)

- `DesktopLoader.fetchMapCell` 解析 raw 时顺带提取锚点 → `MapCell.anchors`;
  地图**只显示已流式过的 cell 的锚点** = 天然"已发现"语义,零全局索引。
- 点击锚点标记 → `Engine.requestTeleport(name, [x,y])` → **同一个 actuator
  动作**(到达侧 when 照常裁决)。地图上看得见 ≠ 去得了。
- dev/test 旁路:直接写 Transform 的 `loader.teleportSpp` 保留(与 `setMode
  force` 同例),不经门控。

## 4. 边界与定位

- **游戏性装置,非安全装置**:local-first 单机不设防(game.md §9)——控制台、
  Ghost、编辑器永远能绕过;防的是"误跳破坏节奏"。将来有服务器/多人时,同一份
  锚点+许可数据就是服务端校验的输入,按权威校验复用,不返工。
- **多世界**:管道已预留(`IDataSource.view(..., worldIndex)`、`BlockComponent.world`、
  DraftStore worldId),动作 params 将来可加可选 world 槽;运行时目前单世界,
  跨世界传送随多世界数据源一并落地(v2)。
- **锚点重名**:v1 不设全局注册表,作者自管;链时代锚点名可挂 CAS/合约命名空间。
- **半径/入口体积**:出发侧就是标准 trigger 体积;到达侧落点是点(锚点中心),
  多人同时到达的错位留给 popOut(v1 单机无此问题)。

## 5. 测试

- headless `portal-teleport.test.ts`:①无钥匙 → denied + fallback 反馈;
  ②持钥匙 → 传送成功(位置断言);③anchor.when 拒客(reason refused);
  ④提示块无锚点 → 拒绝(no-anchor);⑤远块传送悬停等流式。
- e2e:2D 地图锚点标记 + 点击快速旅行 + 门控拒绝路径。
