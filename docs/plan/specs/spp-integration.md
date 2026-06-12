# SPP（弦粒子）引擎集成 — 落地规格

Status: **M1–M2 实施中**（2026-06）。设计来源：`docs/features/spp.md`（引擎侧设计）、
`docs/features/spp-protocol.md`（链上 L2 二进制，外部授权协议）。

## 架构决策

**BlockSystem 级展开**：弦粒子注册为 adjunct 类型 **`b6`（0x00b6）**；BlockSystem
解析 raw 遇到 b6 行时调用纯函数展开器，产出**标准 adjunct raw 行**（a1 墙 / b8
触发器），每个构件作为独立实体走原管线——碰撞（SolidComponent）、触发器、LOD、
编辑选中全部复用，零新渲染路径。

被否决的备选：在 `stdToRenderData` 内展开为单实体多子网格——墙的碰撞
（SolidComponent 按实体挂载）与单元内 trigger 无处安放。

### 序列化保真（关键规则）

展开产物的 stdData 携带 **`derivedFrom: <SPP 源 adjunctId>`**；
`BlockSerializer` 跳过 derived 实体（与自动 ground 同模式），只序列化 b6 源行。
否则任意一次编辑保存就会把弦粒子"烤死"成散件，丢失空间逻辑源。

## 数据格式

### b6 raw 行（M2 开发期：明文 JSON）

```
[ origin, cells, theme ]
  origin  [x,y,z]  SPP 米，相对地块原点
  cells   SppCell[]（见下）
  theme   主题 id（字符串，注册于 VariantRegistry）
```

L2 二进制（CollapseCodec）**不在 M2 范围**——随 M3 编辑/塌陷交互接入
（届时 b6 raw 切换为 chunk，开发期明文保留为调试通道）。

### SppCell（紧凑形）

```ts
{ position: [gx,gy,gz],      // 单元网格坐标（步长 = 单元尺寸）
  level: 0|1|2|3,            // 尺寸 4m × 0.5^level
  faces: [ [state, variant] ×6 ],   // 按 ParticleFace 枚举序（Top,Bottom,Front,Back,Left,Right）
  trigger?: TriggerLogicNode[] }    // 占满单元内部的 b8（引擎原生节点格式）
```

**v1 约束**：不支持 cell rotation（引擎碰撞为 AABB；旋转待 OBB 落地后随
spp.md 的 15° 步长恢复）。faces 缺省 `[1,0]`（Closed·solid）。

## 展开语义（core/spp/Expander.ts）

- **面→构件**：每面按 (state, variant) 查主题构型；构型 = 面局部 (u,v) 归一化
  片段列表（厚度 0.2m，嵌入单元内侧），按面朝向映射为 SPP 盒（a1 墙，stop=1）。
- **相邻消除**：共享面由**低坐标单元的正向面（Right/Back/Top）独占生成**；
  负向面（Left/Front/Bottom）在存在同 level 相邻单元时跳过（spp.md
  "只在低坐标单元生成"）。
- **CellTrigger** → b8 行：体积 = 整个单元内腔，events 直传。
- **确定性**：纯函数，同输入同输出（无随机/墙钟），单测固定快照。

### basic 主题（内置）

| state | variant | 构件 |
|---|---|---|
| Closed | 0 solid | 整面墙 ×1 |
| Closed | 1 doorway | 两侧门垛 + 门楣 ×3（门洞 u 0.3–0.7） |
| Closed | 2 window | 下墙/上楣/左右垛 ×4（窗洞 u 0.25–0.75, v 0.4–0.85） |
| Open | 0 empty | 无构件（通行） |

## 分期

| 期 | 内容 | 状态 |
|---|---|---|
| M1 | VariantRegistry + Expander + 确定性单测 | 实施中 |
| M2 | b6 注册、BlockSystem 展开、序列化保真、演示小屋、e2e（census/碰撞/trigger/reload 保真） | 实施中 |
| M3 | palette 放置 + 面状态/构型编辑；CollapseCodec L2 接入 draft/导出 | 规划 |
| M4 | L1 Definition Reference → URL/IPFS（随 P3）；上链（随 P4） | 规划 |

## 已知边界

- 展开产物在运行期**只读**（编辑应改塌陷选择再重展开——M3）；直接编辑 derived
  实体的改动不会被序列化（derivedFrom 跳过），刷新即还原。
- 跨 level 相邻消除未做（不同尺寸单元贴面会双层墙）；v1 文档化。
- 一块内大量单元 → 数百 derived 实体：Block LOD 已兜渲染；实体量若成瓶颈，
  这是 InstancedMesh（无交互静态层）真正值得做的时刻（见 performance.md）。
