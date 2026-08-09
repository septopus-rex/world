---
name: spp-particle
description: 创作或改进 SPP 粒子库（StylePack：一个单位胞的 open/closed 两池 option）。当任务是"做一套 X 风格的 SPP 粒子/StylePack""改进现有粒子库""让某个 stylepack 更像 Y"时使用。给出一条 生成→导入→看图→守卫→迭代 的闭环，替代凭空吐 JSON。
---

# 创作 SPP 粒子库

## 为什么需要这条流程

凭空写 StylePack JSON 的产物一律粗糙，原因不是模型不会建模，是**看不见结果**。
实例：`terran`（人族风格）8 个 option 全部只用 a2 盒子、`solid` 就是一个盒子——
渲染出来是一个纯白光板方块，与"星际争霸"毫无关系。它当时通过了所有客观校验。

所以：**客观对错交给守卫，好看不好看必须看图**。两者都不能省，也不能互相替代。

## 一次迭代

```bash
# 0. 编辑器要在跑（7779）
cd client/editor && npm run dev

# 1. 写/改一份 pack JSON（可先从内置的拷一份当骨架）
#    client/core/src/stylepacks/*.stylepack.json

# 2. 看它 —— 四个角度 + 守卫报告
cd client/editor
NODE_PATH=$(npm root -g) node tools/snapshot.mjs <pack.json> --out /tmp/spp-look --views 4
#    内置库直接: --builtin terran
#    只看"通"池: --faces open
#    要连 UI 一起拍(调试编辑器本身): --chrome 1

# 3. 读 /tmp/spp-look/view-*.png（真的看），读 guard.json
# 4. 改 JSON，回到 2。直到看着对
```

## 判据分工（别混）

**守卫判的（机器，`engine/src/core/spp/OptionGuard.ts`）**——出现即修，不必看图：

| code | 含义 |
|---|---|
| `part-out-of-cell` | 面内 u/v 越界，或深度穿透到对面 → 和邻格打架 |
| `part-overhang` | 向外挑出（`w<0`）。**合法**（屋檐/飘窗，spanish 就这么用），但会占邻格空间 |
| `part-zero-size` | 尺寸为 0，不产生几何 = 死数据 |
| `closed-empty` | 「挡」池里的空 option，语义与「通」无异 |
| `closed-thin` | 「挡」只覆盖极小面积，不成墙 |
| `open-sealed` | 「通」覆盖了整个面，过不去 |
| `parts-coincident` | 两个 part 完全重合 → z-fighting 闪烁 |

**眼睛判的**——只能看图：比例、层次、风格识别度、"这看着像不像 X"。

## 做出风格的几条实招

粗糙的产出几乎总是同一个毛病：**一个 option 一个盒子**。做出质感靠的是：

- **层次**：一个 option 用 3–8 个 part 堆出主面 + 凹槽 + 边框 + 装饰条，而不是一整块。
  参照 `stair_top`（13 个 part）与 `doorway`（4 个）的做法。
- **深度差**：`w`/`sw` 拉开前后关系（面板凸出 0.05、缝凹进 0.02），比同平面拼色有效得多。
- **调色板**：颜色走 raw 槽 3 的调色板索引（`core/utils/Palette.ts`，1..255 带材质），
  比字面色更统一；金属感靠调色板项自带的 roughness/metalness。
- **不止 a1/a2**：可用型由引擎枚举（14 种，`listOptionPartKinds()`）——a8 牌、e1/e3 屏、
  a6 锥、a4 模型都在里面。`terran` 当初只用 a2 是因为清单被写死成 5 个，现已解除。
- **六个面不必同款**：roof/deck/floor/stair_top 这类分工是 option 的意义所在。

## 规矩

- 产物是**数据**（`client/core/src/stylepacks/*.stylepack.json`），不写 TS。
  内容门禁 `unit/content-conformance.test.ts` 会逐文件校验，红了改内容不改测试。
- 面引用 option 用**稳定 key**（P4），不是数组下标。
- 改完跑 `cd client/editor && npm run test:e2e`（~40s）与引擎单测。
- 规格：`docs/plan/specs/spp-editors.md`（§3.2 组合 · §3.3 单位系 · §3.7 守卫）。
