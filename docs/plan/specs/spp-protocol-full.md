# SPP 完整协议落地 + adjunct 正名 `spp` — 实现规格

Status: **A–E 全部已实现（2026-07-06）** · 见文末各 Workstream 的「实现」标注
真源: `../../../../spp-protocol/specs/SPP-Core-v1.0.md`（协议规范，CC BY-NC 4.0，独立仓 ff13dfly/spp-protocol）
关联: `spp-integration.md`（现状 M1–M2）· `spp-recursive-refinement.md`（refinement 设计稿）·
`coaster-via-spp.md`（coaster theme）· `protocol/cn|en/adjunct-types.md`（附属物规范）

> 术语纪律（CLAUDE.md 2026-07-04）：**SPP 专指弦粒子协议**（String Particle Protocol）。
> 本文把承载 SPP 数据的那个 block 附属物**正名为 `spp`**（辨识度高，见 §3.A）——它是
> "SPP 协议数据的载体 adjunct"，**不改变 "SPP=协议本身" 的用法**。坐标一律称 Septopus 轴序。

---

## 0. 目标与价值

把引擎里的 SPP 从"只实现了协议的 **Unfold（Stage 3）**"补齐到 **完整协议**，兑现协议
README 的招牌承诺 "Separate spatial logic from visual representation"：

| 价值 | 怎么来的 | 交付于 |
|---|---|---|
| **高速构建** | block 上只存**小矩阵**（cells + 面选项 + theme 引用），大的可复用几何库不进地块 | B + E |
| **风格可调 / 秒换** | 换一个 theme（StylePack）引用 → 同一份矩阵重展开成另一种风格 | **B** |
| **完整协议** | superposition（面=选项串）+ collapse（坍缩挑一个）+ refinement（递归细化）+ Option 外部库 | B/C/D |
| **辨识度** | b6 `particle` → `spp` | **A** |

现状一句话：引擎吃的是**已坍缩**的 cell 矩阵 + **代码里硬编码**的 mini-theme（`BASIC_THEME`），
展开成标准 adjunct。协议的三块招牌——**坍缩、递归、Option 库存 IPFS 外部化**——都还没落地。

---

## 1. 术语对齐（protocol ↔ 引擎，钉死不再混）

| 协议 (SPP-Core v1.0) | 含义 | 引擎现状对应 | 目标 |
|---|---|---|---|
| **String Particle / 弦粒子** | 空间**节点**（一格 `ParticleCell`）：position/size/faceStates/faceOptions | `SppCell`（简化版，`faces:[state,variantId][]`） | 补齐到 `faceOptions` 列表 + refinement |
| **Chunk** | 一组 cell 的容器（可递归） | b6 raw 里的 `cells: SppCell[]` | `ParticleChunk`（支持 refinement 嵌套） |
| **Option** | **面选项**：对**外部数据集**的引用（墙/门/楼梯），**id 可为 IPFS CID** | 无（现在面直接指 `variantId` 进硬编码 theme） | **StylePack（外部库，CID/URL 可寻址）** |
| **faceStates** | 6 位掩码：面开/闭 | `FaceState`（Open/Closed）✅ | 保留 |
| **Collapse** | 每面从"选项串"坍缩成"一个选项"（superposition→resolved） | 无（cell 喂进来就是 resolved） | **确定性 collapse（seed 驱动）** |
| **Unfold** | resolved → 3D 几何（Stage 3，出协议范围） | `Expander.expandParticle`（面→a1 墙、cell→c1 轨道）✅ | 保留、扩展 |
| **Refinement** | cell 内嵌 `ParticleChunk`，边界一致性不变式 | 无 | 见 `spp-recursive-refinement.md` |

> **纠正一个常见误解**："尺寸大、可复用、存 IPFS、通用"的那个东西，是协议里的 **Option（外部数据集）**，
> 不是"弦粒子"。协议里"弦粒子=矩阵里那一小格节点"。motif（c2）**不属于 SPP**——是另一条独立的
> 程序化物件通道，`Expander` 里出现 0 次；只有 `spp-recursive-refinement.md` 提出未来让**叶子 cell
> `fill` 指向 motif**（方向是 SPP叶子→motif，非反向）。

---

## 2. 现状 vs 协议 — 差距表（"愿景 ↔ 现状 ↔ 目标"）

| 协议能力 | 现状（已核对代码） | 目标 |
|---|---|---|
| 小矩阵放 block 上 | ✅ b6 raw `[origin, cells, theme]`，`SppCell.faces:[state,variantId][]` | 保留，字段升级（见 §4） |
| 面选项引用**外部数据集**（Option, 可 IPFS） | ⚠️ `theme` 是字符串 id → **代码硬编码** `BASIC_THEME`（`Variants.ts`） | **StylePack 外部化**（§3.B） |
| 换库=秒换风格 | ⚠️ 机制在（换 `theme` id 就重展开），但只有 2 主题、都硬编码 | **内容驱动、可 CID 引用、块/世界级覆盖**（§3.B） |
| superposition（面=选项串）+ collapse | ❌ 面是**单个** `[state,variantId]`，喂进来即 resolved（L2 `CollapseCodec` 标注 M3 未来） | **确定性 collapse**（§3.C） |
| refinement 递归细化 | ❌ 无（`core/types/ParticleCell.ts` 有预留类型但 Expander 未用） | §3.D → `spp-recursive-refinement.md` |
| L2 二进制（紧凑 CID 存储） | ❌ 开发期明文 JSON | §3.E |

---

## 3. 五条工作流（按 价值/风险 排序落地）

> 顺序原则：**先正名去风险 → 再交付"风格可调"这个头牌价值 → 再补协议完整性 → 最后做压缩**。
> 每条都独立可发、可回归；A/B 不依赖 C/D/E。

### Workstream A — 正名 `particle` → `spp`（机械、零行为变化、先做）

**typeId `0x00b6` 字节稳定不变**（已入 CID 的历史数据、`coaster.level.json` 等 b6 行照常工作）。
只改**人可读标识**：

| 位置 | 现在 | 改为 |
|---|---|---|
| `core/types/AdjunctType.ts` | `Particle: 0x00b6` | `Spp: 0x00b6`（保留 `Particle` 作 `@deprecated` 别名一版，避免 49 处引用一次性爆改） |
| `plugins/adjunct/adjunct_particle.ts` | 文件名 + `ParticleMeta/Transform/Attribute/AdjunctParticle` | `adjunct_spp.ts` + `Spp*`；`name:"spp"`, `short:"SPP"` |
| `core/services/AdjunctRegistry.ts` | `[AdjunctType.Particle, AdjunctParticle…]` | `[AdjunctType.Spp, AdjunctSpp…]`；注释 `b6 spp（SPP 空间定义）` |
| `core/edit/AdjunctDefaults.ts` | `label:'SPP Cell'` | `label:'SPP'`（默认 raw 不变） |
| `core/systems/BlockSystem.ts` | `[AdjunctType.Particle]: expandParticle` | `[AdjunctType.Spp]: expandSpp` |
| 文档 | `protocol/cn|en/adjunct-types.md`、CLAUDE.md 花名册、`spp-integration.md` | 术语随之更新（"b6 particle" → "b6 spp"） |

**验收**：`adjunct-registry.test.ts` 断言 `0x00b6` 名为 `spp`；`grep -rn "AdjunctType.Particle" engine/src`
仅剩别名定义处；coaster e2e + spp e2e 全绿（typeId 未变，数据零迁移）。

### Workstream B — Option/Style 库外部化（**交付"风格可调 / 秒换"**）

这是**最贴用户目标**的一条。把现在硬编码在 `Variants.ts` 的 theme 变成**可寻址的外部数据集**：

**B1. StylePack 数据 schema（纯数据，非代码）**——就是把现有 `SppTheme` 序列化成 JSON：
```jsonc
// StylePack —— 内容寻址（CID/URL/内置 id 三选一解析）
{
  "format": "septopus.spp.stylepack",
  "version": 1,
  "id": "brick",                 // 人读名
  "thickness": 0.2,              // 墙板厚度（米，嵌在 cell 内）
  "closed": [                    // faceState=Closed 的变体池，索引=variantId
    { "name": "solid",   "pieces": [{ "du":0,"dv":0,"su":1,"sv":1 }] },
    { "name": "doorway", "pieces": [ /* …归一化 (u,v) 面片，同 VariantPiece… */ ] }
  ],
  "open": [ { "name": "empty", "pieces": [] } ],
  "texture": { "closed": "<CID|url>", "repeat": [1,1] }  // 可选：Unfold 阶段贴到 a1 墙
}
```
- `pieces` 完全复用现有 `VariantPiece`（归一化 (u,v) 面片）；**纯几何描述，无 Three.js**，落在 `core/`。
- 可选 `texture` 是 Unfold 阶段的视觉皮：a1 墙已有 texture/repeat 槽，StylePack 提供 CID/URL，
  经 `ResourceManager`（与 model/audio/video 同一 `raw=CID/URL/path` 解析口）落地——**贴图才是
  "风格"的直观来源，且不破层界**（贴图在 render 层解析，core 只传引用）。

**B2. 加载通路**（复用现成 seam，不新造轮子）：
- `spp` raw 的 `theme` 字段升级为 **StyleRef**：内置 id（`'basic'`/`'coaster'`）| CID | URL。
- 内置 id → 走 bundled pack（**离线默认，零网络依赖**，`basic`/`coaster` 保留为内置 StylePack）。
- CID/URL → 经 `IDataSource`（`view`/内容解析口）异步取 JSON → 校验 → `registerSppTheme(cid, pack)` →
  展开。**与 audio/video 的 `{raw, format}` 同款异步资源模型**（`DataSource.ts` 已有先例）。

**B3. 换库 = 秒换风格**：
- 单块：改 `spp` 行的 `theme` StyleRef → BlockSystem 重展开（`derivedFrom` 派生体全替换，源行只留 b6）。
- 世界级"皮肤"覆盖（可选增强）：`world.styleOverride`（StyleRef）在 Unfold 时替换所有 spp 的 theme →
  **一键给整个世界换风格**，矩阵一字不改。这正是"风格可调"的最强形态。

**确定性**：StylePack 内容寻址（CID = canonical JSON UTF-8，同 CID 同几何）；无 CID 的内置 pack 版本化。
**层界**：pack=纯数据经 DataSource 加载；`VariantPiece`→box 在 Expander（core）；贴图引用→材质在 render。
`grep -r "from 'three'" engine/src/core engine/src/plugins` 仍须为 0。

### Workstream C — faceOptions 列表 + collapse（协议 Stage 1→2）

让引擎能吃**未坍缩**的 cell（协议的 superposition 形态），并**确定性坍缩**：

- **cell 升级**（向后兼容）：
  ```ts
  interface SppCell {
    position: [number,number,number]; level: SubdivisionLevel; rotation?: [number,number,number];
    faces?: Array<[FaceState, number]>;      // 既有：已 resolved（单选）—— 继续支持
    faceOptions?: Array<Array<[FaceState, number]>>;  // 新：每面一串候选（superposition）
    trigger?: TriggerLogicNode[];
  }
  ```
- **collapse（确定性，坍缩发生处 = BlockSystem 展开前）**：
  - 若 `faces` 已给（resolved）→ **跳过 collapse**（现状行为不变，纯兼容）。
  - 若给 `faceOptions` → 用 **mulberry32(seed)** 逐面挑一个候选，`seed = hash(blockX, blockY, cellIndex, faceIndex)`
    （PRNG 基准与抽取顺序钉进 `determinism.md`，与 item/weather 同款）。相邻面共享平面消除规则不变。
  - 出协议 §5：collapse 策略本身出协议范围 → 引擎选"seed 驱动均匀挑选"作默认策略，**可被 authored 权重覆盖**。
- **收益**：兑现协议 §8.1 forward flow —— **AI 产出 superposition（低维语义），引擎确定性坍缩**，
  同 seed 跨端同结果；authored 内容仍可直接给 resolved `faces`（零成本）。

### Workstream D — 递归细化 refinement（协议 §3.2.5）

**不在本文展开**——设计已在 `spp-recursive-refinement.md`（父子 `⌊pos/2⌋@level-1` 继承、边界一致性
不变式、LOD 门控展开深度、叶子 motif 填充、R1–R4 路线）。本文只定序：**D 排在 A–C 之后**，并在此
统一两个 cell 类型的落差——`core/types/ParticleCell.ts` 的**预留 `ParticleCell`**（position/level/
rotation/bitmask/options[6]/refinement?）作为**目标全态类型**，`SppCell` 收敛并进它；`Expander` 递归下钻。

### Workstream E — L2 二进制 `CollapseCodec`（紧凑 CID 存储，最后做）

开发期明文 JSON 先用着；成熟后把 resolved chunk 编成 L2 二进制（`core/protocol/CollapseCodec`
已占位），兑现"矩阵数据量很小"——**这是优化，非阻塞**，排最后。B/C/D 全程可跑明文。

---

## 4. 目标数据模型（引擎侧收敛形态）

```
spp raw 行（b6）:  [ origin, chunk, theme ]
  origin  [x,y,z]  Septopus 轴序，相对 block 原点
  chunk   ParticleChunk = { cells: ParticleCell[] }   // 现 cells[] 升级，支持 refinement 嵌套
  theme   StyleRef = 内置id | CID | URL               // 现 string id 升级
```
- **兼容**：旧 `[origin, SppCell[], 'basic']` 是新形态的子集（chunk=扁平 cells、theme=内置 id、面用
  resolved `faces`）——**旧数据零迁移直接工作**。
- 展开产物、`derivedFrom` 保真、`BlockSerializer` 只留 b6 源行——**全部不变**。

---

## 5. 确定性钉点（稳定后抽进 `protocol/cn|en/determinism.md`）

1. **collapse PRNG**：mulberry32；`seed = hash(blockX, blockY, cellIndex, faceIndex)`；逐面按 face 顺序
   0..5 抽取；候选均匀挑选（authored 权重可覆盖，覆盖后仍确定性）。
2. **StylePack 内容寻址**：CID = canonical JSON（UTF-8、键有序）；同 CID ⟹ 同 pack ⟹ 同几何。
3. **相邻面共享平面消除**：正方向面拥有共享平面（现规则不变，跨 refinement 层由父子继承延续）。
4. **theme 解析优先级**：内置 id → CID → URL；解析失败 fallback `'basic'`（告警一次，不崩）。
5. LOD/maxLevel **不入 CID**（同源同 CID，展开深度是渲染预算，见 refinement 文 §7）。

---

## 6. 兼容与迁移

- **数据**：typeId `0x00b6` 不变；旧 b6 行（明文 resolved cells + 内置 theme）原样工作 → **零迁移**。
- **关卡**：`coaster.level.json`、SPP demo 屋、`?level=world` 皆走 b6 → A 改名后仍绿（typeId 稳定）。
- **API**：`AdjunctType.Particle` 保留一版 `@deprecated` 别名 = `Spp`，避免 49 处引用一次性爆改。

---

## 7. 非目标（本轮明确不做）

- **完整 PBR/材质系统**：Unfold 仍产 box 面片 + 可选贴图引用；不引入法线贴图/PBR 通道（YAGNI）。
- **cell rotation 的任意角**：沿用协议"15°倍数 rotation"字段但 v1 只跑 0；旋转展开随 refinement 收口。
- **联网权威校验**：local-first 单机不设防；服务器时代同一份数据复用为权威（同 teleport 的定位口径）。
- **collapse 高级策略**（WFC 约束传播等）：v1 只做 seed 均匀挑选 + authored 权重；约束求解留 v2。

---

## 8. 测试

- **A**：`adjunct-registry.test.ts`（`0x00b6`=spp）；coaster/spp e2e 回归绿（零数据迁移证明）。
- **B**：headless —— 同一 cells 矩阵 × 两个 StylePack ⟹ 两组不同展开行（断言几何差异 + 确定性）；
  CID/URL 加载走 mock DataSource；bundled `basic`/`coaster` 离线可用。e2e —— 换 `world.styleOverride`
  → 同场景两种风格截图对比。
- **C**：headless —— 同 `faceOptions` + 同 seed ⟹ 同 resolved（跨"引擎实例"重放一致）；resolved `faces`
  路径跳过 collapse（兼容断言）。
- **D**：见 `spp-recursive-refinement.md` R1–R4。
- **E**：L2 编解码 round-trip = 明文（`CollapseCodec` 现有单测扩展）。

---

## 9. 风险

| 风险 | 缓解 |
|---|---|
| 改名波及 49 处 `AdjunctType.Particle` | 保留 `@deprecated` 别名一版，分批替换；typeId 不动 → 数据零风险 |
| StylePack 异步加载引入渲染前的"未就绪"帧 | 复用 audio/video 已验证的异步资源模型（占位→就绪 swap）；内置 pack 同步兜底 |
| collapse 破坏现有 authored 场景的确定性 | resolved `faces` 路径**完全跳过** collapse；只有显式 `faceOptions` 才坍缩 |
| 层界破坏（贴图/几何误入 core） | pack 纯数据经 DataSource；`VariantPiece`→box 在 core、贴图引用→材质在 render；CI grep 守卫 |
| 与 refinement 双 cell 类型分叉 | D 明确以预留 `ParticleCell` 为目标全态、`SppCell` 收敛并入，不新增第三种 |

---

## 10. 落地顺序小结

**A（正名，机械）→ B（StylePack 外部化，交付"风格可调/秒换"）→ C（superposition+collapse，协议完整）
→ D（refinement，接 `spp-recursive-refinement.md`）→ E（L2 codec，压缩）。**
A/B 先行即可让"在 world 里高速搭 + 一键换风格"落地；C/D/E 补齐协议全貌。

---

## 11. 实现记录（2026-07-06，A–E 全落地）

- **A 正名** ✅ `AdjunctType.Spp`（0x00b6，`Particle` 保留 @deprecated 别名）·
  `plugins/adjunct/adjunct_spp.ts`（`Spp*`, name `"spp"`）· `expandSpp`/`normalizeSppFaces` ·
  registry/defaults/BlockSystem/EditTaskExecutor/CoasterSystem/客户端全量改。`ParticleCell`/`ParticleFace`
  保留（协议正确名）。验证：engine 全绿 + 14 SPP e2e。
- **B StylePack 外部化 + 风格可调** ✅ `Variants.ts`：`SppTheme` 加 `color`/`texture` 槽、
  `registerStylePack`（数据校验注册）、内置 `brick`/`garden` 包、`setStyleOverride`/`getStyleOverride`
  世界级覆盖；`_shared.ts` a1 槽 7 显式色（向后兼容）；`Engine.registerStylePack/listStyles/setStyleOverride`
  + 活体重展开；`IDataSource.stylePack?` seam。**前端 UI**：SPP 沙盘 `风格` 切换器（basic/brick/garden，
  `spp-style-*` testid）活体切换。验证：`spp-stylepack.test.ts`(9) + e2e `spp-style.spec.ts`（同格
  brick 变色 / garden 变几何 / 清除，3D 截图实证）。
- **C superposition + collapse** ✅ `SppCell.faceOptions`（每面候选串）+ `collapseFace`（mulberry32，
  seed=FNV(bx,by,cellIdx,faceIdx)）；authored `faces` 跳过 collapse（兼容）；`BlockSystem` 透传块坐标。
  验证：`spp-collapse.test.ts`(8) + `spp-collapse-pipeline.test.ts`(2，真管线+重载确定性)。
- **D 递归细化** ✅ `SppCell.refinement`（嵌套 chunk）+ 父子面继承（边界继承父、内部默认 Open、
  子可 null 逐面继承/覆盖）+ 细者所有平面（`FACE_DIR` 消跨层双墙）+ LOD `maxLevel`/`budget`
  （粗回退 + `log` 不静默）；`expandChunk` 递归。验证：`spp-refinement.test.ts`(8) +
  e2e `spp-refine.spec.ts`（`?level=refine`：粗 4m + 细 2m 同源共存，真 3D 展开，26 墙=6 粗+20 细）。
  接续 `spp-recursive-refinement.md` R1；R2/R3/R4（LOD 接 BlockLODSystem / 叶子 motif / AI 分层）待续。
- **E L2 二进制** ✅ `CollapseCodec.encodePayload`（raw+RLE，补齐字节编码器）+ `spp/SppL2.ts`
  桥（resolved 基础主题 chunk ↔ L2；面码/触发存在位；position 结构性由调用方回填）；顺手删了
  `src/` 里误提交、遮蔽 `.ts` 的陈旧 `CollapseCodec.js`。验证：`spp-l2.test.ts`(5，字节 round-trip +
  桥同展开)。L2 v1 覆盖已坍缩基础形；superposition/refinement 更富，留在明文源（L2 按定义即已坍缩）。

**合计新增**：engine 单测 `spp-stylepack`/`spp-collapse`/`spp-collapse-pipeline`/`spp-refinement`/`spp-l2`
（32 例）+ e2e `spp-style`/`spp-refine`（2 spec）；engine 499 全绿、tsc、Three.js 边界、client tsc 均通过。
