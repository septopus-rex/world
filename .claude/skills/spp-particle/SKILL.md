---
name: spp-particle
description: 创作或改进 SPP 粒子库（StylePack：一个单位胞的 open/closed 两池 option）。当任务是"做一套 X 风格的 SPP 粒子/StylePack""改进现有粒子库""让某个 stylepack 更像 Y"时使用。给出一条 生成→导入→看图→守卫→迭代 的闭环，替代凭空吐 JSON。
---

# 创作 SPP 粒子库

## 为什么需要这条流程

凭空写 StylePack JSON、或凭数据"读"出效果，两种都会错。真实案例（2026-08-09）：

`terran` 被认为"粗糙、只会堆灰盒子"——数一数确实全是 a2，预览里也确实是一堆白盒子。
**结论是错的。** 它的每个 option 都正确引用了精心制作的装甲板贴图，在世界里一直渲染正常；
灰盒子是**编辑器预览的 bug**（`IDataSource.texture()` 是个 `return {}` 空桩）。差点因此
去"修"一个数据里根本不存在的问题。

两条教训，都写进流程里：

1. **看图之前先确认预览可信。** 工具会说谎，而且说得很像真的。
2. **客观对错交给守卫，好看不好看必须看图**——但"数据里有什么"不等于"渲染出什么"，
   数几个 part、什么型，推不出观感。

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

**守卫看不见的（2026-08-09 实测，别把 clean 当"没问题"）**：

- **`rot` 完全不参与判定。** `part-out-of-cell` 算的是轴对齐 AABB，转过之后捅出胞外它照报 clean。
- **`part-too-deep` 假设 option 是「面覆层」。** 对**体量型** option（`stair_top` 那种填满整个胞的楼梯）它是**误报**——见下面的坑④，照它改会把楼梯改到走不上去。
- **`part-overhang` 没有量级概念。** `w=-0.01`（4cm 窗台线脚）和 `w=-0.36`（1.44m 烟囱伸出去）同一条 warn、同样措辞。一个用了线脚的库能刷出几十条，真危险的那几条淹在里面。**读 overhang 报告要自己看数值。**
- **看不见"这东西被别的 part 挡住了"**（坑⑤）。

## 五条会让你白干一轮的坑（2026-08-09 实测）

**① `w`/`sw` 是【格子比例】，不是「厚度比例」。** `sw=0.85` 不是"85% 厚"，是
`0.85 × 4m = 3.4m`——几乎穿透整格。单看这个 option 没问题，**六个面一起用时，每个面的
深构件横在其他面的造型前面，你会看不见自己刚做的东西**。内建包的量级是 `0.0625`(0.25m)。
面构件一律 ≤0.11。守卫的 `part-too-deep` 就是为这条加的。

**② 层次靠「贴图面 ⟷ 纯色件」的材质对比，不是「贴图叠贴图」。** `terran-wall.png`
自带强烈的分块面板图案，再用同一张贴图去做框/门扇/百叶，两套网格互相淹没——实测门扇
整个消失在墙里。做法：大面走贴图，构件走调色板纯色（`STEEL 11` / `DARK 13` / `SLATE 9`
/ `BLACK 31` / `AMBER 24`，自带 roughness/metalness）。

**③ `rot` 在面变体里不能用，a6 / a8 也不能。** 三者同一个根因：`partToBox`
（`Expander.ts:169`）无条件把 part 尺寸按面朝向填成 `[x,y,z]` 包围盒，而 `rot` 是**引擎系
绝对旋转**、不随面变换——同一个 part 映射到六个面朝向各不相同，做不了"绕面法线转 45°"
的斜砌/人字纹。**a6 锥**的 slot 0 是 `[底半径, 高, 顶半径]`（协议 §2.1）不是包围盒，`su/sv/sw`
填进去顶底半径相等 ⇒ **渲染成圆柱**，半径还按格宽算所以撑爆单位胞（旧版这里记的"朝向不受控、
锥尖朝外"是**归错因了**）。**a8 牌**的 slot 0 是 `[东西, 南北]` 两元组且 `rot=0` 时**平躺**，
在面变体里立不起来。要斜的/锥的/牌子，用盒子堆，或走 a4 模型。

**④ 体量型 option 的深构件不是错，别照守卫改（血的教训，2026-08-09）。**
`stair_top` 是一座**双跑楼梯**：flight A 沿 `w 0.9→0.6` 上行、半平台 `w 0.5`、flight B 沿
`w 0.4→0.1` 折返，最后那个 `sw=0.375` 的薄片是**两跑之间的隔墙（flight divider）**，必须有
那个深度才能把两条梯段分开。守卫报它 `part-too-deep`（因为守卫假设 option 是覆层），照着
"修"掉之后楼梯塌成单跑、每级 0.62 m，**玩家爬不上去**。brick 有 `spp-tower-stairs-walk.test.ts`
当场逮到；garden 没有，于是坏着提交推送了。**改任何共享 option 之前先
`grep -rl "<option key>" engine/tests/`**——brick / garden / spanish 的 `stair_top` 是同一个模板。

**⑤ 凹龛、凹槽、洞：减法只能靠"不放东西"表达。** 这是一套纯加法的几何。把深色背板推到
`w` 更大的地方**不会**得到一个凹龛——它会被前面那张实心主面**整个挡住**（盲拱廊第一版就是
这样，三个龛一个都没渲染出来）。正解是把主面**拆成块、让开龛的位置**，龛才是真的洞。
同源的一条：石墙的"砌缝"画成深色细条是看不见的（明度差不够 + 浅凹槽不投影），
**留 0.015 的真空隙让阴影自己去画**。

## 看整栋，不只看单胞

```bash
node tools/snapshot.mjs --builtin terran --house cells.json --views 2 --radius 24
```
`cells.json` = `[{position:[gx,gy,gz], level:0, faces:[[state,key]×6]}, …]`，
面序 `0 顶 · 1 底 · 2 南 · 3 北 · 4 西 · 5 东`。**option 齐不齐、能不能坍缩成建筑，
只有搭起来才知道**——单胞好看不代表拼得成房子。

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
- 改完跑 `cd client/editor && npm run test:e2e`（~40s）与引擎单测。**引擎单测不是走过场**：
  它是唯一能证明"楼梯还能走、门还能过"的东西，守卫和截图都证明不了可通行性。
- **给内容加细节前先看它有没有被测试当夹具读。** `spp-tower-stairs-walk.test.ts` 直接读
  `brick.stylepack.json`，并且按「box 高度 < 2m」把踏步和墙分开——所以往 brick 的 `solid`
  或 `floor` 上加一条线脚，都会变成幽灵踏步让它红，而报错只是一串对不上的数字。
- 规格：`docs/plan/specs/spp-editors.md`（§3.2 组合 · §3.3 单位系 · §3.7 守卫）。
