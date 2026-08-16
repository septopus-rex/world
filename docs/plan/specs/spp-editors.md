# SPP 双编辑器 — 源编辑器(在 world)+ 粒子库编辑器(独立) — 设计文档

Status: **设计（未实现）** · 2026-07-06 · 过程文档(非规范)
关联: `spp-protocol-full.md`（数据分离 A–E + ②）· `spp-recursive-refinement.md`（细化/叶子填充）·
`ai-authoring.md`（AI 造物）。参考锚点见文内 file:line。

## 0. 一句话

数据已经分成两份(`spp-protocol-full.md` ②),编辑器也随之分成两个,**各编一份、职责不重叠**:

- **Editor 1 — SPP 源编辑器**:在 **world 里**(现有"魔法球"沙盘),编 **`[origin, cells, theme]`**——
  grid 定位 + 每面 open/close 拓扑 + 选用哪号 option + 指向哪个库。**它读库、用库,不造库。**
- **Editor 2 — SPP 粒子库编辑器**:**独立开发、脱离 world**,编 **StylePack**(SPP 粒子 = option 词汇表)——
  按 open/closed 两池对 option **增删改查**,每个 option 是**一组 adjunct**。产出 = StylePack JSON → CID。

**world 只消费**:源按 CID 指向库 → `expandSpp` 合成 → 渲染。本文重点讲 **Editor 2 怎么做最稳**(§3)。

> **2026-08-14 追加 §9「组合件 Prefabs」**:同一把尺子量 adjunct,得到的不是「再建一个 adjunct 编辑器」,
> 而是把 Editor 2 从「只能产弦粒子的面变体」放宽成**归一化组合件库**。判据与实现见 §9。

---

## 1. 从数据分离推出两个编辑器

| | Editor 1 · 源编辑器 | Editor 2 · 粒子库编辑器 |
|---|---|---|
| 编的数据 | b6 `[origin, cells, theme]`(块上,每实例) | StylePack JSON(库,可复用/寻址) |
| 在哪 | **world 里**(空间放置本就是空间的事)<br>= `client/desktop` 的魔法球沙盘 | **独立工具**(2D 或单胞小预览,不进 world)<br>= `client/editor` 独立 app,7779(2026-08-05 起) |
| 干什么 | grid 定位 · 每面 open/close · 选第几号 option · 选 theme(指针) | 按 open/closed 两池 CRUD option;每 option = adjunct 组合 |
| 输出 | 更新块草稿(DraftStore) | StylePack JSON → **publish → CID** |
| 现状 | 沙盘 v0(`sandboxScene.ts`),但 state/variant 揉在一起 | **不存在**(现手改 `stylepacks/*.json`) |

---

## 2. Editor 1 — SPP 源编辑器（调整现有沙盘）

### 2.1 现状与问题

现有"魔法球"沙盘(`client/desktop/src/scenes/sandboxScene.ts` + `DesktopLoader` sandbox* + `App.tsx`
sandbox-bar)已能:定位 cell、点面循环状态、写回草稿。但**两个耦合要拆**:

1. **state 与 variant 揉在一起**:`FACE_CYCLE`(`sandboxScene.ts:40`)把"实/门/窗/空"写死成
   `[[1,0],[1,1],[1,2],[0,0]]`——**同时循环了 state(open/close)和 variantId**,而且**钉死 basic 库的 4 项**。
   库一旦丰富(§3),这个 4 循环就表达不了。
2. **不读活库**:面上能选的 option 是写死的,不是"当前 theme 实际提供的那些"。

### 2.2 目标调整（两步走）

把"点面循环"拆成**两级选择**,并**读活库**:

1. **先选拓扑**:open / close(纯语义,Editor 1 独占)。这决定从库的哪个池取 option。
2. **再选 option**:从 **`theme` 指向的库**在该 state 下的池里,列出**实际的 N 个 option**(不再写死 4 个),
   点选一个 → 写 `faces[f] = [state, <该 option 的标识>]`。
3. **选 theme(指针)**:源级选"这个 SPP 用哪个库"(一个 CID/id)。现"风格切换器"(`spp-style-*`)
   已是雏形,升级为"选库",而不只是 override。

**读库的接缝**:Editor 1 要能拿到"当前 theme 的 open/closed 池有哪些 option"——即引擎暴露
`Engine.listVariants(themeRef, state)`(名字/预览缩略)。这和运行时"源按 CID 拉库"是同一个"两头"(§4)。

> Editor 1 的调整量不大、且**依赖 §3 的库存在**(要有真实的多 option 才谈得上"从库里选")。所以**先做 Editor 2**。

---

## 3. Editor 2 — SPP 粒子库编辑器【本文重点：怎么做最稳】

### 3.1 定位与依赖架构:**独立于 World,不独立于引擎**

一个 option 定义在**归一化局部坐标系**里,自足、确定、可内容寻址,**跟"放在哪"无关**。所以 Editor 2 是
**独立内容工具**:输出即数据(StylePack JSON → publish 成 **CID**,复用 `engine.ipfs.put()` / `Engine.ipfs`,
`Engine.ts:345`),world 只认这个 CID;产法无关(2D / 单胞3D / AI / 手写都产同一份数据)。

**但"独立"要精确——它独立于 World 运行时,不独立于引擎代码库。** 因为组合 option = a4+b4(§3.2),编辑器
**必须能解析/渲染 adjunct**,而这份能力来自把**引擎当库 import**,不是跑一个 World:

| **需要**(引擎库) | **不需要**(World 运行时) |
|---|---|
| `AdjunctRegistry`——反序列化 a4/b4/a1 的 raw | 块流式加载 / `DataSource` 喂块 / 持久化 |
| `expandSpp`(纯函数)——option → rows | 玩家 / CharacterController / 相机跟随 |
| `MeshFactory`/`RenderEngine`/`ResourceManager`——单胞预览、a4 拉 GLB | 物理 / Trigger / Movement / 游戏循环 / game-zone |
| `Engine.ipfs`——publish→CID、a4 资源解析 | `bootWorld` / ECS 系统编排 / 仿真 |

**两条构建路径**(取舍:纯净 vs 省事):

- **(a) 引擎当库 + 单胞预览器（推荐,真独立）**:import 上表左列,**不 `bootWorld`**;起一个最小场景
  (一个单位胞 + 相机 + 光),`expandSpp(单 cell)` → `MeshFactory` 建 mesh → 一个 Three 视口。这要求引擎
  暴露一条**"孤立渲染一组 rows"的 seam**(§3.5)——引擎已分层(`core` 纯逻辑 headless 可测 /
  `render` 层 `MeshFactory.create()` 可独立建 mesh),所以是"包一层",非从零。
- **(b) 退化 World（省事,但耦合)**:`bootWorld` 一个只含单块、单 b6 源(=待编 option)的退化世界,
  复用整条管线。快糙猛能先跑,但把 World 运行时拉了进来——**不作为长期形态**。

**依赖分档——不是所有 option 都需要引擎库**:

| option 类型 | 要不要 adjunct 机器 | 编辑器形态 |
|---|---|---|
| **扁的面变体**(墙/窗/门框/屏风 = 纯 a1 = `VariantPiece{du,dv,su,sv}`) | **不要** | **2D 面网格编辑器**(u/v 平面画方块),零引擎渲染依赖 |
| **组合变体**(花瓶 a4+b4 / 柱列 / 家具) | **要**(registry + 渲染 + 资源) | 单胞 3D 预览(路径 a) |

⇒ **Editor 2 可以两档并存**:大量常见变体(墙/窗)走轻量 2D、无引擎依赖;富组合走单胞 3D、依赖引擎库。
两档产**同一份 StylePack 数据**。

### 3.2 编辑对象:StylePack = 两池 × 变体,变体 = **adjunct 组合**

```jsonc
StylePack {
  id, thickness?, color?, texture?,
  open:   Variant[],   // 语义 = 通;每项一个"通行"的实现
  closed: Variant[],   // 语义 = 挡;每项一个"阻挡"的实现
}
Variant {
  key:   string,       // ★ 稳定标识（见 §3.6）——不是数组下标
  name:  string,       // 人读名
  parts: VariantPart[] // ★ 组合：任意 adjunct，不再只是 a1（见 §3.4）
}
VariantPart {
  type: AdjunctTypeId, // a1 墙 / a4 模型 / b4 stop / a6 锥 / a7 球 / b8 trigger …
  frame: {…},          // 在归一化胞/面坐标系里的局部变换（§3.3）
  raw:  any[],         // 该 adjunct 自己的 raw 载荷（a4 的模型 CID、b4 的 stopMode…）
}
```

**关键升级**:现在的 `FaceVariant.pieces: VariantPiece[]`(`Variants.ts:22`)**只出 a1 墙**。Editor 2 要求把它
泛化成 `parts: VariantPart[]`(任意 type)——**这就是"option = adjunct 组合"**(前几轮定的:阻挡花瓶 =
`a4 花瓶 + b4 stop`)。展开侧的通道**已有一半**:`expandCell` 已能返回 `[typeId, raw][]`(coaster 用它出 c1),
把面变体也走这条即可。

### 3.3 归一化坐标系（unit frame）—— 尺度无关、跨层复用

option 在**单位系**里定义,展开时按 cell 实际尺寸(4/2/1/0.5m)缩放:

- **面变体**:面的 (u,v) 平面,各 0..1,沿法向向内挤 `thickness`(即现 `VariantPiece{du,dv,su,sv}` 的语义)。
- **体变体/组合**:cell 单位立方 `[0,1]³`,part 的 `frame` 给单位坐标里的 pos/size/rot。
- 好处:**同一个 option 在 4m 和 1m cell 上都成立**(缩放不变),这也是"细化时叶子复用同一套库"的前提。

### 3.4 "编一个 option" = 在 unit frame 里摆 adjunct parts（复用 palette）

Editor 2 的核心交互 **≈ 现有 adjunct palette 编辑器,但作用域换成"一个单位胞"**:

- 左侧 palette 放 part(a1/a4/a6/a7/b4/b8…),拖进单位胞,调 `frame`(单位坐标)。
- 一个 option 可含多个 part:**视觉件**(a4 模型 / a1·a6·a7 图元拼的程序化物件)+ **功能件**(b4 stop、b8 trigger)。
- 存盘:选"归入 open 池 / closed 池",起 `name`,分配/沿用 `key`(§3.6)。
- **不从零造**:这是"把 EditSystem 的放置能力,限定在单位胞 + 一个'存进某 StylePack 池'的动作"。

### 3.5 预览:单胞渲染 seam —— 同一 `expandSpp`,所见即所得

- **扁的面变体**(墙/窗/门框/屏风):**2D 面网格编辑器**(在 u/v 平面画/拖板片)就够,真·非 3D、零引擎依赖。
- **体/组合 option**(花瓶+stop/柱列):**单胞隔离 3D 预览**——一个 1×1×1 视口 + 绕轨相机。
- **两种预览都用同一个 `expandSpp`**:喂一个"只用该 variant"的合成 cell → 得到 rows → 渲染。
  **⇒ 编辑器所见 = world 所渲**,不会两套渲染对不上。

**要引擎新暴露的 seam(路径 a 的前提)** —— 一条"**无 World 渲染一组 rows**"的接口,概念签名:

```ts
// 给一批标准 adjunct rows,建 mesh 挂进一个外部 Three 场景/容器,返 handle。
// 内部走 AdjunctRegistry.deserialize + MeshFactory.create + ResourceManager，
// 但【不】碰 World / 系统 / 仿真。Editor 2 用它渲染 expandSpp(单 cell) 的产物。
RenderEngine.mountRows(container, rows: ExpandedRow[]): PreviewHandle
```

引擎侧材料齐备(`MeshFactory.create()` 已能独立建 mesh、`ResourceManager` 独立拉资源、`expandSpp` 纯函数),
这条 seam 是**把它们包成"单胞预览器"**,不是新管线。有它 → Editor 2 = 干净的"import 引擎当库"独立 app;
没它 → 只能走退化 World(路径 b)。**这条 seam 是 Editor 2 与引擎唯一需要新增的接触点。**

### 3.6 【关键】变体身份与版本 —— 别用数组下标,用稳定 key + CID 冻结

这是 Editor 2 最容易埋的雷,单独讲清:

**问题**:现在面存 `[state, variantId]`,`variantId` 是**数组下标**(`getVariant` 按 index 取,`Variants.ts:57`)。
一旦库编辑器**插入/删除/重排** option,下标全错位——所有引用该库的源**默默指向了别的 option**。这是经典的
"位置索引 vs 稳定标识"陷阱,对**可复用、可寻址、会演进**的库是致命的。

**解法(两层,都要)**:

1. **变体带稳定 `key`**(不是下标):源引用 `[state, key]`(或引擎按 key→变体解析)。库内**重排/插删不影响**已有引用。
   现 `FaceVariant` 已有 `name` 字段,可直接升格为 `key`。**代价**:面数据模型从 `[state, number]` → `[state, string]`,
   `getVariant`/坍缩/faceCodes 随之改(见 §6 迁移)。
2. **publish = 冻结成 CID**(内容不可变):一份发布的 StylePack = 其 canonical JSON 的 CID。源**钉住某个 CID**;
   编辑库 = 产出**新 CID 的新版本**,老源仍解析老版本、**纹丝不动**。升级 = 显式改源指向新 CID(opt-in)。

**合起来**:CID 管**跨版本稳定**(冻结),key 管**版本内可读 + 草稿期安全重排**。**编辑期在草稿上改(可自由增删重排),
publish 一刻冻结成 CID。** 这既是版本故事,也是"库怎么演进而不炸掉存量世界"的答案。

> **这不只是健壮性,是回到协议对齐。** SPP-Core v1.0 §3.2.4 明写 option `id` 是**对外部数据集的引用**,
> "MAY use database keys, **content hashes (IPFS CID)**, URIs"——即**不透明的稳定引用**,例子全是 key/CID/URI,
> **没有位置下标**。我们现在用数组下标 `variantId` 是对协议本意的**偏离(drift)**;换成稳定 key/CID
> **正是把 SPP 粒子的引用方式拉回 SPP-Core**。所以 §3.6 的修法 = 协议对齐 + 编辑器健壮性,一举两得。
> (治理层面,StylePack 本身的 schema 是否收进协议,见 §7。)

### 3.7 open/close 契约守卫(通/挡自检)

Editor 2 应**帮作者守语义契约**(§前文:open=可过、close=挡),给**提示不硬拦**:

- 存进 **open 池**时,跑一次足迹检测:若组合里的 stop 把通道封死 → 警告("这个 open 会挡路")。
- 存进 **closed 池**时:若组合**没有**能挡住整面的 barrier(如花瓶只占中间) → 警告("这个 close 挡不住,补个 b4 stop?")。
- 复用 `MovementCollider.footprintOverlap`(碰撞足迹)在单位胞上算一遍即可。契约最终仍是**作者责任**,守卫只是护栏。

### 3.8 产出与互通:JSON ↔ CID,导入/导出

- **导出**:StylePack → canonical JSON → `engine.ipfs.put()` → CID(与 texture/model 同一 CAS 通道)。
- **导入**:贴 CID/URL/JSON → 解析 → 进编辑器(用 §3.5 预览)。
- **内容寻址一致**:同内容同 CID(现 `stylepacks/index.ts` 的 `contentId` 已是同款 FNV;正式化到规范时对齐 canonical 序列化)。

### 3.9 AI 生成(可选,顺势白送)

因为 option **是数据**,AI 可直接产 StylePack JSON("给我 5 个窗变体""一套宋式栏杆")。Editor 2 = **人在环**审校:
AI 出 JSON → §3.5 预览 → §3.7 守卫过一遍 → publish。与 `ai-authoring.md` 同一条"生成文档 → 预览 → 建造/发布"链,
只是产物换成 StylePack。

---

## 4. 两个编辑器的接缝（编辑期"两头"）

```
Editor 1(源)  ──选"这面第几号 option"── 读 ──▶  Editor 2 发布的库(按 CID)
   面 = [state, key]                              open/closed 池里 key→variant
   theme = 库的 CID(指针)
```

- Editor 1 需要 `Engine.listVariants(themeCid, state) → {key, name, thumbnail}[]` 来列 option。
- Editor 1 改库(换 theme CID)→ 源**钉老 CID 则不变**,或显式升级到新 CID。
- **和运行时"源按 CID 拉库"是同一个两头**,只是发生在编辑期 vs 展开期。

---

## 5. 复用现有机件(不从零造)

| 需求 | 复用 |
|---|---|
| 摆 part / 选 adjunct | EditSystem palette + AdjunctDefaults(限定作用域到单位胞) |
| 预览 = 所见即所得 | 同一个 `expandSpp`(喂单 cell) |
| publish → CID / 导入 | `Engine.ipfs`(`.put`/`.get`,已在) + `stylepacks/index.ts` 内容寻址 |
| 面变体几何 | 现 `VariantPiece`/`pieceToBox`(泛化为 parts 后仍复用 a1 分支) |
| 契约守卫 | `MovementCollider.footprintOverlap` |
| 库注册/解析 | `registerStylePack` / `IDataSource.stylePack` / `Engine.registerStylePack` |

---

## 6. 路线（增量，每阶段独立验收）

- **P0 单胞渲染 seam** — 🔲 **暂走路径 b(退化 World)**:编辑器用 `StylePackPreviewLoader`(一个精简 Engine
  harness)预览,复用整条渲染管线,无新增引擎渲染码。真·`RenderEngine.mountRows`(路径 a,§3.5)留作精简。
- **P1 数据模型:`FaceVariant.pieces` → `parts: VariantPart[]`**(option=组合)+ 变体加 `key` — ✅ **已实现**。
  `partToBox` 泛化 `pieceToBox`(加内向深度 w/sw);legacy `pieces` 自动 lift 成 a1 parts;emitLeaf 出任意 type。
  测试 `spp-parts.test.ts`(5:花瓶 a4+b4、双柱 a4×2 无 stop、depth、props、确定性)。
- **P2/P3 Editor 2** — ✅ **v1 已实现(空间化重构 2026-07-06)**;**2026-08-05 剥离成独立 app `client/editor`
  (7779,自己的 package.json/vite/playwright)**,此前是 desktop 壳的 `?tool=stylepack` 分支。剥离理由不是减包
  (它只 825 行,desktop 主 chunk 7.4MB 的大头是引擎+世界内容),而是**这个工具还要长期长**(§6 剩余项:2D 面网格
  编辑、契约守卫、CID 冻结),没道理继续挂在玩家 app 的路由上;顺带兑现 §3.1「独立于 World 运行时」——它现在
  只 import `@engine`(当库)+ `@core` 的 bundled stylepacks,零 world loader。**副产品:它的 e2e 从背着整个
  世界启动变成 ~10s 独立跑。**入口 `StylePackEditor.tsx`(现 `client/editor/src/`):
  按用户模型——**建粒子(名字/尺寸)→ 主界面=粒子 cell → 选面(6 按钮)→ 面的 [通 open/挡 close] 双 tab →
  状态下加 adjunct/几何体(墙/盒/球/模型/stop,结构化 parts 编辑非裸 JSON)→ 坍缩控制盘(6 面 state+变体)
  驱动活体 3D 预览 → 导出/publish CID**。预览走 `StylePackPreviewLoader`(路径 b),新增
  `CharacterController.setObserveOrbit` 修好取景(旧 `cc._obs*` 私有字段是 no-op)。e2e `stylepack-editor.spec.ts`
  (加 a4+b4 → 预览重展开;翻面到 open → 该面组合消失)。**待补**:3D 点面选中(现用 6 按钮)、§3.7 契约守卫、
  a4 真模型(现占位)、2D 面网格编辑。
- **P4 面 `[state,number]`→`[state,key]`** + `getVariant` 按 key 解析 — ✅ **已实现(双读)**:string=稳定 key、
  number=legacy 下标都解析(`getVariant`,key 回退 name);面/faceOptions/collapse 类型放宽到 `number|string`;
  L2 保持 index 形(string 降级 solid)。测试 `spp-key.test.ts`(5)。**CID 冻结/版本**待补。
- **P5 调整 Editor 1(沙盘)** — ⏳ **两级选择 v1 已落地(2026-08-05,场景内演示形态)**:点 cell → Observe 轨道
  缓动推近该格(锚点=冻结玩家滑向格心+半径收缩,退出选中缓回全景;`SppStudio.focusCamera/easeCamera`);点面=
  **选中面**(不再盲循环),面板(`client/core/src/components/SppFacePanel.tsx`,共享核)列出**当前生效库**
  (styleOverride 优先)的 open/closed 两池——经 **`Engine.listVariants(theme, state)`** 读活库
  (`unit/spp-list-variants.test.ts`),点选即写 **`[state, key]`**(稳定 key,P4;legacy 数字引用解析为 key 做
  高亮)并 reexpand。e2e:`sandbox.spec.ts`(活库跟随风格包切换 · 相机推近/回退)+ `sandbox-drive.spec.ts`
  (真 UI 面板点选)。旧 实→门→窗→空 循环保留为 `sandboxCycleFace` API 缝(ray-free 快速雕刻/测试)。
  **仍待做**:源级选 theme(CID 指针,现只有世界级 override)、option 预览缩略图。
- **P6(可选)AI 生成 StylePack** — 🔲 待做。
- **P7 组合件 Prefabs** — ✅ **已实现(2026-08-14)**:StylePack 加第三个池 `prefabs`(`pack#key` 稳定引用、
  胞的 Bottom 面帧、`size` 声明尺度);`listPrefabs`/`getPrefab`/`Engine.listPrefabs` 读库缝;`expandPrefab`
  复用 `partToBox`;`checkPrefab` 免掉 `part-too-deep`、新增 `prefab-empty`;世界编辑 palette 第二排点击盖章
  (一次点击一步撤销、cap 按整件校验);`client/editor` 第三个折叠区 + 共享 `PartsEditor`;garden 首批
  `bench`/`tree`。完整设计与取舍见 **§9**。**剩余**:缩略图、按 pack 分组、CID 冻结、深数据模板(§9.6)。
- **规范抽取**:P1/P4 稳定后,变体身份(key)、unit frame、CID 冻结、契约语义抽进 `protocol/`(SPP 规范,双语)。

> 顺序要点:**P1 是地基(数据模型),Editor 2(P2/P3)先于 Editor 1(P5)**——因为 Editor 1"从库里选"要先有丰富的库。
> **进度(2026-07-06)**:P1/P4/P2-P3 已落地(engine 509 单测 + editor e2e);P0 走路径 b;P5/P6 + 契约守卫 + 取景待续。

---

## 7. 与 SPP 协议的关系与治理（哪些必须守 / 哪些自主 / 哪处 drift）

Editor 2 编的是"option 数据集",而 SPP 协议(`spp-protocol/specs/SPP-Core-v1.0.md`)对这块**主动划了界**——
分清"协议管的"和"协议留白的",才知道哪里是**对齐**、哪里是**合法自主**、哪里是**要修的 drift**。

**① SPP-Core 明确"不管"的(§2 Scope 原文)**:

> does NOT define: **Geometric models, materials, meshes, or any rendering data** · Binary encoding · Collapse
> algorithms · **The concrete type or format of option identifiers**.

⇒ **StylePack 的 schema(两池 / 变体 / parts / 几何 / 材质)= 协议主动授权的实现自主,不算漂移。** 我们发明
StylePack、把 option 做成 adjunct 组合、搞 unit frame——**是在填协议留的槽**。`spp-protocol` 仓里也确实**没有**
option-dataset 规范(specs 仅 Core / Spatial-Coverage / Inverse-Modeling / Related-Work)。

**② SPP-Core 明确"管"、而我们有一处真 drift 的(§3.2.4)**:

> Each `id` is a **reference to an external dataset** … MAY use keys, **content hashes (IPFS CID)**, URIs.

⇒ option 引用应是**不透明的稳定引用**(key/CID/URI);我们现在用**数组下标 `variantId`** 是 drift。**§3.6 的
key/CID 修法 = 拉回协议对齐**(必做,P4)。另有一处**受限子集**(非错):协议允许**逐面**引用不同 option 数据集,
我们简化成**一个源一个 `theme`**——比协议窄,够用,先不动。

**③ 治理选择(你是 `spp-protocol` 作者,可拍板)**:

- **保持实现层**:StylePack 作为 world 引擎的实现约定,合规、轻量。只你一家用就够。
- **提升为协议配套规范**:若要**跨引擎复用弦粒子库**(别的实现也能吃你的 option 库),新增
  `spp-protocol/specs/SPP-Option-Dataset.md`(或 `SPP-StylePack`),规定 schema(两池/变体/parts/unit frame/
  **key**/CID/契约语义)。**这样它从"我们的约定"变"协议的一部分",漂移从根上消掉。**
- 无论选哪个:**② 的身份 drift(下标→key/CID)都要修**,因为那是对齐**现有** SPP-Core,不涉及扩协议。

---

## 8. 非目标 / 风险

- **不做完整 DCC**:Editor 2 是"单位胞 + 少量 part"的轻编辑器,不是 Blender;复杂网格还是外部 GLB 经 a4 引入。
- **变体身份是头号风险**:必须上 §3.6(key + CID 冻结),否则库一演进就静默错位。P4 不能省。
- **契约靠自律 + 护栏**:§3.7 是提示不是强制;跨信任边界(服务器权威)再谈硬校验。
- **别把"能编库"当"做出了游戏"**:库/源只解决场景与接口;玩法回路仍在逻辑层(trigger/actuator/flag/dialogue)。

---

## 9. 组合件 Prefabs —— 同一把尺子量 adjunct（2026-08-14 落地）

### 9.1 问题:「adjunct 也搞个独立编辑器」合理吗

提法是:仿照 SPP 的双编辑器,给 adjunct 也做一个——世界里管定位,独立 app 管精细化。
**方向对,但要迁移的是判据不是形态。**

Editor 1/2 能拆,根因**不是「粗调 vs 精调」,是数据先拆成了两份**(`spp-protocol-full.md` ②):
源绑块、每实例一份;StylePack 是库、可复用、可寻址。§3.1 那句"跟'放在哪'无关"讲的就是这个。
所以真正的尺子是:

> **编辑器边界 = 数据边界。能命名、能复用、能算出 CID 的 → 独立 app;
> 只能存在于「某块某行」里的 → 留在世界里编(必要时用 2D 页面栈)。**

按这把尺子量 adjunct:**一行 adjunct raw 就是一份数据,没有第二份。**
`core/edit/AdjunctDefaults.ts` 的 `defaultRawFor` / `defaultTailFor` 之分(2026-08-05)已经把缝找出来了
——`[size, pos, rot]` 是 where、`tail`(槽 3+)是 what,且 tail **确实与位置无关**。
但**位置无关 ≠ 可复用**:tail 内联在某块某行里,没法命名、没法发 CID,把它拖到世界外编,
产物只能写回那一行,于是编辑器必须知道是哪个世界哪个块哪个实体——退化成 §1 判过的
「编辑器带个小预览窗」。

### 9.2 真能拆出去的那一档:组合件——而且它已经存在

§3.2 早就写了 **option = adjunct 组合**;P1 把 `pieces` 泛化成 `parts: VariantPart[]`(任意 type + 归一化 frame)。
「一组 adjunct 在归一化单位胞里」**正是一件家具的定义**。所以正确动作不是新建 adjunct 编辑器,
而是**放宽 Editor 2 的归属规则**:

| | 之前 | 现在 |
|---|---|---|
| 编的东西 | 一组 adjunct parts,在归一化单位胞里 | **不变** |
| 必须归到哪 | 某个面的 open / closed 池 | 池**之外**也能存:一个独立命名的 **Prefab** |
| 引用形态 | 面写 `[state, key]` | `packId#key` |
| 产出 | StylePack JSON → CID | **同一条通道**(同一个文件、同一个 CID) |
| 世界里怎么用 | b6 源选第几号 option | 编辑 palette 第二排「从库里放」 |

**不在里面的两件事**(容易混):① **不是**把世界里某个 adjunct 实例拖到 editor 里改
——那个仍在世界里编(它有位置、有场景引用,出了世界就没意义);② **不是** 21 型的通用属性表单
(§8 的 DCC 陷阱)。放宽的是「能不能不进池」,不是「能编多少字段」。

### 9.3 数据形态

```jsonc
StylePack {
  id, thickness, closed[], open[],
  prefabs?: Prefab[],        // ★ 新增,可选——没有家具的包仍是完整的包
}
Prefab {
  key:   string,   // ★ 必填。组合件是新东西,一出生就在 §3.6 的正确一侧:
                   //   只能按 pack#key 引用,不存在下标形态可漂移
  name:  string,
  size?: number,   // 作者声明的单位立方边长(米),默认 2 = 家具尺度
  parts: VariantPart[],
}
```

**帧 = 胞的 Bottom 面帧**(§3.3 的「体变体」):`u→X 东 · v→Y 北`(地面足迹)、`w/sw→Z 上`(离地高度 / 自身高度)。
展开直接复用 `partToBox(ParticleFace.Bottom, …)`——**这是定义不是巧合**:面 option 与组合件走同一段几何代码,
§3.5 的「编辑器所见 = world 所渲」对家具才同样成立。

### 9.4 「盖章」而不是「实例」——一个刻意的取舍

`expandPrefab` 是**创作期**操作:落到块草稿里的是 **N 个普通的 authored adjunct**,
**不标 `derivedFrom`**。后果是双向的,两边都想清楚了:

- ✅ 盖下去的长椅是**作者从此拥有的数据**——能挪、能改色、能拆开单独调一件;
- ✅ 后来编辑风格包,**已经盖出去的不会跟着变**(存量世界不会被库的演进悄悄改掉);
- ❌ 反过来也就没有「改库 → 所有副本跟着变」的联动。

要联动就得**新开一个 adjunct 型 + 运行时依赖库可解析**——那是**另一个特性,不是这个特性的更好版本**。
现在不做。

### 9.5 落点(已实现)

| 层 | 东西 |
|---|---|
| 数据 | `Prefab` / `StylePack.prefabs` / `SppTheme.prefabs`(`core/spp/Variants.ts`);内容门禁校验 key 唯一、parts 非空、size 为正 |
| 读库缝 | `listPrefabs(themeId?) → PrefabInfo[]` · `getPrefab('pack#key')` · `Engine.listPrefabs()`——与 `listVariants` 同款,**palette 列的是活库不是硬编码菜单** |
| 展开 | `expandPrefab(prefab, origin, size)`(`core/spp/Expander.ts`),复用 `partToBox` |
| 守卫 | `checkPrefab`(`OptionGuard`)——几何检查共用 `geometryIssues`;**`part-too-deep` 不适用**(那条规则把 option 读作「贴面的皮」,而组合件按定义是体,全高衣柜是常态);新增 `prefab-empty` |
| 世界 | `EditSystem` palette 第二排(`⬚ 名字 (件数)`)→ 点面盖章;**单位立方站在点击点上**(点击点 = 底面中心);`block.max` 按整件校验,**不会盖出半张长椅** |
| undo | `HistoryEntry.also[]`——**一次点击 = 一步撤销**,不管产生了几行 |
| 编辑器 | `client/editor` 第三个折叠区「组合件 Prefabs」;parts 面板抽成共享的 `PartsEditor`(**面/胞两帧只有轴标签不同**,别做第二份);预览走 `show(pack, prefab)` 单一入口,面标签与坍缩盘在组合件模式下收起 |
| 内容 | `garden.stylepack.json` 六件:`bench` 长椅 · `tree` 小树 · `lamp` 园灯 · `table` 石桌 · `planter_pot` 花盆 · `fountain` 喷泉(2026-08-16 扩充) |
| 看图 | `client/editor/tools/snapshot.mjs --prefab <key>|all`(2026-08-16)——**b4 stop 默认不入镜**(世界里它本就不渲染,带着拍的不是世界会呈现的样子),`--stops 1` 找回 |
| 测试 | `unit/spp-prefab.test.ts`(15)· `systems/prefab-placement.test.ts`(5)· editor e2e「组合件 Prefabs」· desktop e2e「组合件 palette」(**该测试钉死 bench 的 b4 中心 = 点击点**,改 bench 的 stop 要保持 u,v 中心 .5) |

**轴标签必须分开**(`FACE_AXES` / `PREFAB_AXES`):同样是 u/v/w,面帧的 `v` 竖着走墙、`sw` 向内咬,
胞帧的 `v` 向北铺地、`sw` 是高度。两处标一样,作者就会做出一张**躺着的长椅**。

### 9.6 剩下没做的

> 2026-08-16 补:**看图闭环已补上**(`--prefab`,见 §9.5)。此前组合件是唯一**没有眼睛**的产物
> ——`snapshot.mjs` 只会把六面坍缩到某个 option 上拍,组合件不属于任何面,于是永远不入镜,
> 首批两件是盲写出来的。补上当天就逮到三处只有画面能看见的问题:小树的树冠球**圆心全落在
> 主球半径内**(7 个 part 齐全、守卫 clean,画面是个棒棒糖)、花盆的 stop 与盆身**共面**导致
> 盆身发黑、石桌的 stop 顶面与桌面齐平长出一块 z-fighting 绿方块。**`parts-coincident` 只报
> 完全全等的盒子,「共面但不全等」是守卫的盲区**——判据与坑写进了 `spp-particle` skill。

- **组合件的缩略图 / 预览图**:palette 现在只有文字按钮(与 option 缩略图同一笔欠账,见 P5)。
  注:`snapshot.mjs` 已能离屏产出每件的多视角 PNG,是缩略图的现成前身;缺的是**运行时**那一半
  ——`RenderEngine` 没有截图 API 且未开 `preserveDrawingBuffer`,裸 `toDataURL()` 会拿到白图。
  注入点是干净的:`UIButtonConfig` 已有 `icon` 槽,`EditSystem` 现在把 `⬚` 烤进 label 没用它。
- **世界内「从库里选」的第二级**:现在是一个扁平列表;包多了要按 pack 分组。
- **CID 冻结**:与 §3.6 的第 2 层同一笔——`prefabs` 随包一起冻结,单独的版本故事还没写。
- **深数据的可复用部分**(animation 时间轴 / npc 行为模板 / motif 模板):按 §9.1 的尺子,
  **模板可抽,实例上的场景引用(触发哪个实体、读哪个 flag、传送到哪个锚点)不可抽**——
  那些该做成 2D 页面栈里的一页,不是第二个 app。尚未动手。
