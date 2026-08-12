# SPP 宣传片

同一套渲染器出的两支 10s 短片，60fps、无文字无声，各有横竖两版：

| 片子 | 讲什么 | 文件 |
|---|---|---|
| `reveal.html` | **一个粒子怎么变成一栋楼**：叠加态 → 坍缩 → 递归细化 → 生长 → 换风格 | `spp-reveal-16x9.mp4` · `spp-reveal-9x16.mp4` |
| `street.html` | **同一份数据，一整条街秒换风格**：线框铺开 → 坍缩波横扫 → 三次换皮 | `spp-street-16x9.mp4` · `spp-street-9x16.mp4` |

两支共用同一套视觉语言（暗底 + 青色叠加态 + 网格 + 光墙转场），单支能各自发，串起来是一支连贯的长片。

```bash
export NODE_PATH=$(npm root -g)                              # 全局 playwright
node docs/media/spp/render.js                         # reveal，两个画幅（约 2 分钟）
node docs/media/spp/render.js street.html             # 街区，两个画幅
node docs/media/spp/render.js street.html 16x9 --crf 24   # 单画幅 / 更小体积
```

## 这是概念动画，但几何是真数据

渲染器是手写的正交软渲染器（canvas 2D，不用 three），**只有渲染是自己画的，形状不是编的**：

- 面 option 直接 fetch `client/core/src/stylepacks/*.stylepack.json`，按 `Expander.partToBox`
  的同一套 (u,v,su,sv,w,sw) → 盒子映射展开；
- 颜色走 `core/utils/Palette.ts` 的 32 项索引表（照抄，不是近似色），贴图直接用
  `client/desktop/public/assets/*.png`（世界尺度 = `demo.manifest.json` 里那份 `size`）；
- 只有外表面出几何——照搬引擎的同层邻接消除，联排的相邻墙自动消掉；
- 换风格 = 同一套 `roles`（语义角色）换一个 pack 查 key，就是 `world.styleOverride` 的道理。

**改了粒子库，重跑命令视频就跟着变。** 反过来，`ROLE` 表里某个 pack 缺对应 key 时会落回该池
第一个 option——视频里那面墙变样了，多半是 pack 改名了。

## 分镜（都是 60fps / 600 帧）

**reveal**（时间轴常量 `B1..B6`）

| 帧 | 秒 | 内容 |
|---|---|---|
| 0–56 | 0.0–0.9 | 一颗粒子 → 长出单位胞线框 |
| 56–172 | 0.9–2.9 | 六个面各自的候选 option 轮换重影 = 叠加态 |
| 172–252 | 2.9–4.2 | 坍缩波自下而上，构件按自己的高度被"裁"出来 |
| 252–352 | 4.2–5.9 | 一分为八（refinement），子胞继承父面接口，各自再坍缩 |
| 352–482 | 5.9–8.0 | 以那一格为起点向外生长成一栋楼，相机同步拉远 |
| 482–600 | 8.0–10.0 | 光墙扫过，同一份几何换 brick → terran → ice → garden |

**street**（时间轴常量 `P1..P5`，布局在 `STREET`）

| 帧 | 秒 | 内容 |
|---|---|---|
| 0–64 | 0.0–1.1 | 整条街以线框叠加态逐栋铺开 |
| 64–206 | 1.1–3.4 | 坍缩波沿 +X 横扫，砖街一段段实体化 |
| 206–337 | 3.4–5.6 | 光墙扫过 → terran |
| 337–468 | 5.6–7.8 | → ice |
| 468–600 | 7.8–10.0 | → garden，末尾定格 |

街的布局是 `PLAN`：每项 = 一栋楼的 `{开间数, 层数, 立面语汇, 退线}`，`gap` 是巷子。
三种立面语汇（住宅 / 塔楼 / 带拱廊的商铺）在 `KIND` 里，商铺底层走 **open 池**，
所以街上真有一段是通透的拱廊——open/closed 两池同时在画面里。

## 已知的取舍

- 逐帧走 `canvas.toDataURL` + playwright，**不是实时**（约 50–90s / 600 帧）；确定性来自帧号驱动
  （无 `Date.now`/`Math.random`，随机全走 mulberry32）。
- **横向街道装不进 9:16**：72 m 的街塞进竖屏只会两端出画。竖版因此不是横版裁切，而是换机位——
  相机跟着波前走，看的是"街的一段被换掉"。reveal 的竖版则是同一套帧换构图参数重渲。
- 视频文件约 9–12 MB/条，**不入 git**（`.gitignore` 里 `docs/media/**/*.mp4`）。要片子就重跑。
