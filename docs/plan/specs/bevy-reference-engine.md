# Bevy/Rust 参考引擎 —— 无头一致性内核（差分裁判）

> 状态:草案 v0.1（2026-07-08）。过程/规划文档（`docs/plan/`），非规范。
> **配套文档**:[`full-data-migration.md`](./full-data-migration.md) —— 本文是那份迁移的**可执行裁判**:它定义"全数据化"的验收(AC-1/2/3),本文定义"用什么、怎么建"来判定验收是否达成。两份一起读。

## 0. 定位:它是什么、不是什么

- **是**:一个**独立实现**的第二引擎,只读「块数据 + `protocol/`」,不含本项目任何 TS 运行时代码。它是"数据是否完备、有没有配置外隐藏处理"的**差分裁判(differential oracle)**。
- **不是**:不是要替代 TS 引擎,也不是一上来就做完整可玩客户端。第一层交付是**无头一致性内核**,只做"解码→展开→解析语义→状态哈希",体量远小于完整引擎。
- **判据**:凡是"只看协议 + 数据、在本参考引擎里实现不出来"的地方 = 迁移文档里一个隐藏处理缺口被当场逮住。所以它应**尽早并行启动**,当迁移 P0–P4 的拉动器,而不是最后才写。

## 1. 两层架构（别绑在一起）

```
第 1 层 · 无头一致性内核（纯 Rust,先做,不依赖 bevy）
    decode(块数据) → expand(SPP/motif) → resolve(碰撞/触发/actuator 语义)
    → snapshot(canonical 世界状态) → hash → 与 golden vector 对拍
第 2 层 · Bevy runtime（后做,可选)
    把内核的 world 状态喂给 bevy 0.19(Rust data-driven ECS)做渲染/输入
    → 一个可玩的第二客户端;观感自定,不参与一致性判定
```

- **证明"数据完备"的是第 1 层**,第 2 层是"想要第二个能玩的客户端"时才做。两者解耦:第 1 层的 crate 被第 2 层依赖,但第 1 层不依赖 bevy。
- **bevy 现状(2026-07)**:0.19,Rust,data-driven ECS,与本引擎 ECS 心智直接对应;但 ECS **默认并行、系统顺序非确定**(须显式 `.before/.after` + fixed timestep)。所以见 §3 的纪律。

## 2. 核心纪律:比对在数据/状态层,不在帧仿真层

**不要**试图让第二引擎的调度/渲染循环与 TS 引擎逐帧对齐(bevy 并行调度本就非确定,强行对齐既难又无意义)。**要**比的是:

```
输入(块 raw | 关卡文档) --[两个引擎各自实现]--> canonical 世界状态 --> stateHash
两个 stateHash 逐位相等 = 该 vector 通过
```

- 绝大多数 vector 是 **steps=0**(纯展开):最强、最纯的确定性检查——SPP/motif 把源展开成派生实体,不涉及时间。
- 少数 vector **steps=N**:验证触发/actuator/NPC 游走(仍确定:固定 `dt` + 钉死 PRNG)。
- 物理(tumble)单独一条轨(见 §7 与迁移 P6)。

## 2.5 它证明什么 / 不证明什么（含:人 3D 核实何时介入）

差分裁判有软肋:**两个实现一致 ≠ 一致的行为就是对的**。先把三个别混的问题分开:

| | 问题 | 谁来答 |
|---|---|---|
| **Q1 一致** | 两引擎对同一份数据是否一致 | 无头哈希对拍 ✅(内核主职) |
| **Q3 完备** | 数据/协议是否完备(无隐藏处理) | clean-room "只看协议实现得出来吗" ✅(内核主职) |
| **Q2 正确** | 一致的行为**对不对 / 是否合意** | **不归内核** —— 人 + 不变量 + 视觉 |

**行为一致 = 状态轨迹 + 事件日志(无需渲染)。** 行为是确定性的状态演化,渲染只是它的视图、不带额外信息。一条行为 vector = `{数据, 输入脚本, dt, 步数}` → `{每步状态哈希轨迹, 事件序列}`;两引擎喂同一份必产出同一条。我们现在的 e2e(`setPlayerMoveIntent`+`engine.step(dt)`+断言)就是无头驱动行为,内核只是把断言换成轨迹对拍。

**破"两个实现一起错"的循环——真值不靠第二引擎:**
1. **人工钉死的 golden**:关键 vector 的期望输出由人算/写死(如"这个 b6 必须展开成正好这 5 面墙、在这些坐标"),**独立于两个引擎**;TS 和 Rust 都得对上它,不循环。
2. **不变量 / 属性测试(无需 oracle)**:无墙重叠、门洞可通行、碰撞对称、派生实体不出块界……对错的**绝对判据**,专抓差分看不见的"共同盲区"。
3. **视觉真值**:现在就在 TS 侧做(e2e 截图 + 人眼)。

地位是**不对称的**:TS 引擎是被 ~37 个 e2e + 人眼截图长期验证过的**事实基准**;golden 把它的行为固化;Rust clean-room 复现 = 测**规范完备性**。**分歧**(Rust ≠ golden)才是产出:要么协议缺一块(正要找的)、要么 Rust bug、要么 TS 有隐藏处理。

### 人 3D 核实何时介入?——两条轴,别混

- **轴 A「谁判」**:机器(哈希/不变量) ⟷ 人(眼)。
- **轴 B「哪个引擎」**:TS(引擎 1) ⟷ Rust/bevy(引擎 2)。

|  | 机器判 | 人 3D 判 |
|---|---|---|
| **TS 引擎** | ~37 e2e(现有 ✅) | e2e 截图 + 手玩(**现在就在做,从不关**) |
| **Rust 引擎** | 差分哈希 + 不变量(B0–B4,现在建) | bevy 渲染(**B6,按需**) |

1. **人的 3D 核实现在就在进行**——在 TS 侧。这条是 Q2 的当下真值,永不关闭。
2. **无头机器闸门永不切走**——Q1/Q3 的常驻 CI 裁判,有了 bevy 也不退役。所谓"切换到人 3D"**不是交接、不是关掉无头,是并行叠加**。
3. **给第二引擎(Rust)上 3D 的时点 = B6,且需同时满足**:
   - **前置门槛**:无头内核先绿(B1 SPP、B4 关卡)。渲染一个状态还算错的世界,只是把错误画得好看。
   - **触发条件(任一成立才值得做)**:
     - (a) **产品需要**:要发一个 Rust/native/非 web 的可玩第二客户端;
     - (b) **调试需要**:哈希对不上、光看 entity dump 找不出哪错(如"屋顶转了 90°"),想两边并排看;
     - (c) **独立视觉真值需要**:怀疑"TS + 协议共同盲区",想要第二双眼睛。
   - 反过来:**只为"证明数据完备"不需要 bevy 3D**——那是 Q1/Q3,无头就够。

## 3. 内核数据管线（对照 TS 引擎,但只依赖协议）

| 阶段 | TS 引擎对应 | Rust 内核要实现 |
|---|---|---|
| 解码 | `BlockRaw`/`normalizeBlockRaw`/`validateBlockRaw` | 按 `protocol/…/block §3` 解 5 槽 `[elevation, status, adjuncts, animations, game]`,逐 adjunct 按 `adjunct-types.md` 槽位解 |
| 展开 | `BlockSystem.SOURCE_EXPANDERS`(`expandSpp`/`expandMotif`) | SPP 递归展开(坍缩种子=块+cell+面,mulberry32)、motif 模板生成;派生实体带 `derivedFrom` |
| 语义 | 碰撞形状(b4 三形状)、`Actuator` 触发→动作、item/npc 语义 | 从 raw 推导碰撞体;steps>0 时按协议跑触发/actuator/flag/npc 状态机 |
| 快照 | live 实体的 `TransformComponent`+`stdData` | canonical 世界状态(§4) |
| 哈希 | (新增,双方共用) | 稳定哈希(§4) |

关键:内核**只**能从 `protocol/` + 数据推导。任何"必须去翻 TS 源才知道怎么做"的点,记进迁移文档缺口清单。

## 4. 状态哈希口径（canonical world state）—— 本文的技术核心

差分对拍的成败全在"两个引擎对同一份数据是否算出逐位相同的状态"。定义如下,稳定后并入 `protocol/`。

### 4.1 进入哈希的内容
- **每个 live adjunct 实体**(含 SPP/motif 派生;**源实体不入**,派生入——与 `BlockSerializer` 跳过 `derivedFrom` 的存储侧对称,只是方向相反):
  - `typeId`
  - `derivedFrom`(源稳定键,或 `null`)
  - `pos [x,y,z]`、`rot [x,y,z]`、`size/scale`(**Septopus 轴序**,量化见 §4.3)
  - **类型显著属性尾**(只取影响世界语义的,不取渲染细节):
    - wall/box/cone/ball:texture/color、solid(stop) 标志
    - trigger(b8):shape、gameOnly、**events 签名**(事件类型 + 动作 method 列表,不含闭包)
    - item(b5):templateId、seed、count
    - npc(ba):behavior.initial(steps=0 时)/当前状态(steps>0 时)、seed
    - link/book/video/audio:意图字段(url / pages 长度或哈希 / source id),**不含呈现**
- **块级**:block 坐标、`elevation`、`game` 标志、`globalFlags` 快照(steps>0 且触发改了 flag 时)
- **不入哈希**:引擎观感(相机、粒子、阴影、LOD)、渲染资源实际字节、事件时序(除非该 vector 显式验证事件序列)

### 4.2 排序(消除实体创建顺序/存储差异)
入哈希前按稳定键排序:`(derivedFrom ?? "", typeId, pos.x, pos.y, pos.z, localIndex)`。因为两个引擎的 ECS 实体 id / 存储顺序必然不同,排序后才可比。

### 4.3 浮点量化(消除 fp 噪声误判)
- 位置/旋转/尺寸在入哈希前**量化到固定精度**(建议 `1e-4` m / rad),避免两引擎 sin/cos 等超越函数末位差异造成假阳性。
- **原则**:SPP/motif 的几何推导尽量走**有理/整数**运算(cell 尺寸、面偏移都是网格量),让量化只当安全网而非遮羞布。凡是被迫依赖超越函数的地方,在协议里标注允许量化容差。

### 4.4 哈希算法
canonical 序列化(定长字段 + 排序后的实体流)→ `blake3`(或 `sha256`),输出 `blake3:<hex>`。序列化格式在协议里定死(字段顺序、字节序、量化编码),两引擎共用。

## 5. Golden vector 文件格式与目录

- 目录:`engine/tests/golden/`(TS 引擎与 Rust 内核**共享**;TS 侧产出/校验,Rust 侧对拍)。
- 单个 vector(JSON):

```jsonc
{
  "name": "spp-hut-basic",
  "input": { "kind": "block", "coord": [0, 0], "raw": [ /* 5 槽块 raw */ ] },
  "steps": 0,                          // 0 = 纯展开;N = 跑 N 个确定性步
  "dt": 0.016,                          // steps>0 时的固定步长
  "expect": {
    "stateHash": "blake3:…",
    "entities": [ { "type": 161, "derivedFrom": "…", "pos": […], "rot": […], "size": […] } ]
    //  ↑ 可选全量 dump,仅供 hash 不一致时人肉 diff;裁判只看 stateHash
  }
}
```

- **TS 侧**:一个 `yarn conformance:emit` 类脚本,跑现引擎产出 `stateHash`(+可选 dump),写进/校验 vector。这是 P0 的 golden 夹具。
- **Rust 侧**:`septopus-conformance` CLI 读同一 vector,算 actual hash,与 `expect.stateHash` 比;不等则 dump entities 供 diff。
- **first vector**:一个 `basic` 主题的 b6 小屋(单 cell,6 面 通/挡)——展开成若干 a1 墙 + 触发器,steps=0。它同时是内核 B1 里程碑的验收。
- **两类 vector(破循环,见 §2.5)**:① **捕获型**——期望从 TS 抓,防回归、验一致(Q1);② **钉死型**——期望由人算/写死,是**独立于两引擎的真值**(Q2)。基础/关键 vector 应有钉死型。
- **另设不变量测试(无 oracle)**:无墙重叠 / 门洞可通行 / 碰撞对称 / 派生实体不出块界——抓差分看不见的"共同盲区"。

## 6. 内核范围（做 / 不做）

- **做**:块解码;逐 adjunct 槽位解析;SPP 展开(叠加态坍缩 + 递归细化 + LOD 预算门控);motif 展开;碰撞形状推导(b4 box/ball/slope);触发/actuator/flag 语义(足以到达可比状态);item/npc 语义;确定性 PRNG(mulberry32);canonical 快照 + 哈希;golden 对拍 CLI。
- **不做(第 1 层)**:渲染、输入、实时循环(只做确定性 `step`)、网络、编辑器、UI、音视频呈现。
- **可选(物理轨)**:tumble 用 native `rapier3d` + `enhanced-determinism` 与 TS 侧 WASM rapier 对拍(见 §7)。
- **第 2 层(bevy)**:渲染/输入/观感,不参与一致性判定。

## 7. Rust 工程结构与依赖

新增顶层 `reference/`(独立 Cargo workspace,自带 toolchain,不进 npm/yarn):

```
reference/
├── Cargo.toml                 # workspace
├── crates/
│   ├── septopus-protocol/     # 类型 + 解码 + 校验(镜像 protocol/,唯一"规范翻译"层)
│   ├── septopus-expand/       # SPP + motif 展开 + 确定性 PRNG(mulberry32)
│   ├── septopus-sim/          # 碰撞形状 + 触发/actuator/flag/npc 语义(到可比状态)
│   ├── septopus-conformance/  # golden runner + 状态哈希 + CLI（差分裁判入口）
│   └── septopus-bevy/         # 【第 2 层,后做】bevy 0.19 app 包装上面几个 crate
```

- 依赖:`serde`/`serde_json`(数据)、`blake3`(哈希)、`glam`(数学);物理轨 `rapier3d`(feature `enhanced-determinism`);第 2 层 `bevy = 0.19`。
- `septopus-protocol` 是**唯一**允许"参照 protocol/ 规范手写"的地方;其余 crate 只依赖它,不得偷看 TS 源——这条纪律保证它是干净房间。

## 8. 对拍机制与 CI 门禁

- **谁是基准**:迁移期 TS 引擎是事实基准(产出 golden);Rust 内核 clean-room 复现。长期两者对等,golden 是唯一裁判。
- **CI**:
  - TS:`engine` 跑 `conformance:emit --check`(现引擎对全部 vector 自洽,防回归)。
  - Rust:`reference` 跑 `cargo run -p septopus-conformance -- engine/tests/golden`,全 vector hash 一致。
  - 任一 vector 不一致 = 失败,且 dump 双方 entities 到工件供 diff。
- 与迁移文档 §5 的"无隐藏处理审计"门禁并列:一个防新内容藏进客户端代码,一个防两引擎解释分叉。

## 9. 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **B0** | `reference/` 脚手架 + `septopus-protocol` 解块 + 状态哈希口径 + golden 格式 | 一个"空块/纯 box"vector 双侧 hash 一致 |
| **B1** | `septopus-expand` SPP 展开(坍缩 + 细化 + LOD) | `spp-hut-basic` 等 SPP vector 全绿(§5 first vector) |
| **B2** | motif 展开(house/road/building/maze) | motif vector 双侧逐位一致(依赖迁移 P3 把算法写进协议) |
| **B3** | `septopus-sim` 碰撞形状 + 触发/actuator/flag(steps>0) | 触发门类 vector 全绿 |
| **B4** | 关卡文档(`AuthoredLevel` + `include`)整关加载 | gallery / world 关卡级 vector 全绿(依赖迁移 P1/P7) |
| **B5** | 物理轨:native rapier + enhanced-determinism ↔ WASM rapier | tumble 同初态对拍,确认 P6 (a) 是否成立 |
| **B6** | 【可选,按需】`septopus-bevy` 渲染第一个关卡——**时点/触发条件见 §2.5**(前置:B1/B4 先绿;触发:产品/调试/独立视觉三选一) | 可玩第二客户端跑起来(**给人看,不参与一致性判定**) |

## 10. 风险与开放问题

- **浮点跨引擎/跨平台**:几何尽量有理化 + 量化容差(§4.3);物理靠 rapier `enhanced-determinism`(WASM vs native 需实测)。
- **协议未定项**:每逮到一个"实现不出来",回填迁移文档缺口清单;这正是它的价值。
- **双份维护成本**:内核只做"解码+展开+语义",范围有限;且它是防"数据不完备"的唯一硬手段,值这个成本。
- **谁先谁后**:B0–B1 应与迁移 P0/P1 并行启动,不要等迁移做完——早写早逮缺口。

## 11. 关联文档

- [`full-data-migration.md`](./full-data-migration.md) —— 本文的"为什么/验收标准"(AC-1/2/3、缺口清单、P0–P8);本文是它的 **P0.5 无头内核 + P8 第二引擎**的展开实现。
- `protocol/cn|en/adjunct-types.md`(逐槽位,内核解码依据)· `determinism.md`(PRNG/坍缩/顺序,内核必须逐位复现)· `block §3`(块 raw 结构)
- `docs/plan/specs/spp-protocol-full.md`、`spp-recursive-refinement.md`(SPP 展开算法,内核 B1/B2 依据)
- `core/spp/Expander.ts`、`core/systems/BlockSystem.ts`、`core/services/Actuator.ts`、`core/utils/BlockSerializer.ts`(TS 侧对照实现;**仅作对照,内核不得依赖**)
