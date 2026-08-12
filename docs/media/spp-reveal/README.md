# SPP 展开宣传片（10s）

`spp-reveal-16x9.mp4`（1920×1080）· `spp-reveal-9x16.mp4`（1080×1920），60fps，无文字无声。

```bash
export NODE_PATH=$(npm root -g)          # 全局 playwright
node docs/media/spp-reveal/render.js     # 两个画幅都出（约 2 分钟）
node docs/media/spp-reveal/render.js 16x9 --crf 24    # 单画幅 / 更小体积
```

## 这是概念动画，但几何是真数据

`anim.html` 是一台手写的正交软渲染器（canvas 2D，不用 three），**只有渲染是自己画的，
形状不是编的**：

- 面 option 直接 fetch `client/core/src/stylepacks/*.stylepack.json`，按 `Expander.partToBox`
  的同一套 (u,v,su,sv,w,sw) → 盒子映射展开；
- 颜色走 `core/utils/Palette.ts` 的 32 项索引表（照抄，不是近似色），贴图直接用
  `client/desktop/public/assets/*.png`（世界尺度 = `demo.manifest.json` 里那份 `size`）；
- 换风格 = 同一套 `roles`（语义角色）换一个 pack 查 key，就是 `world.styleOverride` 的道理。

**改了粒子库，重跑这条命令视频就跟着变。** 反过来，`ROLE` 表里某个 pack 缺对应 key 时会
落回该池第一个 option——视频里那面墙变样了，多半是 pack 改名了。

## 分镜（60fps，600 帧）

| 帧 | 秒 | 内容 |
|---|---|---|
| 0–56 | 0.0–0.9 | 一颗粒子 → 长出单位胞线框 |
| 56–172 | 0.9–2.9 | 六个面各自的候选 option 轮换重影 = 叠加态 |
| 172–252 | 2.9–4.2 | 坍缩波自下而上扫过，构件按自己的高度被"裁"出来 |
| 252–352 | 4.2–5.9 | 一分为八（refinement），子胞继承父面接口，各自再坍缩 |
| 352–482 | 5.9–8.0 | 以那一格为起点向外生长成一栋楼，相机同步拉远 |
| 482–600 | 8.0–10.0 | 光墙扫过，同一份几何换 brick → terran → ice → garden |

时间轴常量在 `anim.html` 的 `B1..B6`；建筑布局在 `buildingCells()`（外表面才出几何，
照搬引擎的同层邻接消除）。

## 已知的取舍

- 逐帧走 `canvas.toDataURL` + playwright，**不是实时**（约 50s/600 帧）；确定性来自
  帧号驱动（无 `Date.now`/`Math.random`，随机全走 mulberry32）。
- 竖版是同一套帧换构图参数（`PORTRAIT` 分支）重渲，不是横版裁切。
- 视频文件约 12 MB/条。要不要入 git 自己定，不想入就在 `.gitignore` 里加
  `docs/media/**/*.mp4`。
