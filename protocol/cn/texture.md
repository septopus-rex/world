# Septopus 贴图协议 (Texture Protocol)

> 规范层 · 协议 v0.1 · cn/en 双语同步（改本文须同步 `../en/texture.md`）。
> 定义 3D 引擎如何**引用、缩放、平铺、锚定**表面贴图。这是**跨引擎法向契约**：另一
> 引擎（UE / Rust 参考引擎）实现同一套尺度/密度/锚定规则，才能逐面对齐观感。
> 相关：贴图**字节的存储与寻址**见 [资源协议](./resource.md)；贴图在 adjunct 里的
> **槽位**见 [附属物类型](./adjunct-types.md)；渲染 realize 总契约见 [附属物协议 §6](./adjunct.md)。

## 1. 范围

- 本协议覆盖表面的**漫反射 / 颜色贴图**（albedo `.map`）。
- **PBR 多贴图**（法线 / 粗糙度 / 金属度 / AO / 自发光）**不在 v1**，见 §8 路线。
- 目标三条：**密度恒定**（16m 地板与 1m 箱子一样清晰）、**可上链**（数字 id / CID）、
  **去重共享**（同一张图跨面/跨块共用一个 GPU 纹理，跨引擎逐面可复现）。

## 2. 引用与解析

- adjunct 用一个**字符串**引用贴图，三种形态：**数字资源 id** | **CIDv1**（`bafk…`）| **URL / data:**。
- 解析：数字 id → `IDataSource.texture([id])` → **贴图记录**；CID / URL 直连。
- **贴图记录** = `{ raw, format, size?, repeat? }`：
  - `raw` — CID / URL / 相对路径，经 `resolveUrl` 落到可加载 URL（CID→内容路由或网关）。
  - `format` — `png` | `jpg`（**须 POT**，见 §4）。
  - `size` — **物理世界尺寸**，见 §3。
  - `repeat` — 可选细乘子，见 §5。
- **加载一次、按 id 去重、引用计数释放**（同 id 全场共享一个 `THREE.Texture`）。

## 3. 世界尺度 `size` —— 一张图铺多大（用 scale 实现）

- 贴图记录字段 **`size = [w_m, h_m]`，单位米，默认 `[1, 1]`**。语义：这张图在世界中覆盖 `w×h` 米。
- 引擎按 **`repeat = [1/size_w, 1/size_h]`** 平铺 —— **世界尺度就是一个 scale**：
  `size = 1` → 一张图铺 1 米；`size = 2` → 同一张图摊到 2 米（更稀）。
- `size` 是**贴图属性**（per-id），对使用它的所有面一致 → `1/size` 也一致 → **单张共享纹理去重不破**。
- 图像本体建议**方图**；但物理 `size` **允许非方**（木板 `[1, 0.25]`、砖 `[2, 1]`）。

## 4. 纹素密度基准 —— **512 px/m**

- **基准 512 px/m（≈ 5.12 px/cm）。** 一张 `1m×1m` 标准贴图 = **512×512**。
- 密度 = `图像像素 / size(米)`。非方按同密度缩图像：`[1, 0.25]m → 512×128`；`[2, 1]m → 1024×512`。
- 三档（同一密度体系，按视距选）：

  | 档 | 密度 | 1m 方图 | 用途 |
  |---|---|---|---|
  | 低 | 256 px/m | 256² | 地面 / 远景 / 大面（永远看得远） |
  | **默认** | **512 px/m** | **512²** | 墙 / 普通表面（第一人称贴脸 ~0.5m 仍清晰） |
  | 高 | 1024 px/m | 1024² | 招牌 / 近读 hero / 细节道具 |

- **必须 POT**（256 / 512 / 1024）：`RepeatWrapping` + mipmap 需 2 的幂，NPOT 会被静默降级（掉 wrap、关 mipmap）。
- **依据（实时 / 低多边形 WebGL PWA 场景）**：最近可读距离由第一人称贴面 **~0.5m** 决定；
  512 贴脸仅略软，mipmap + 各向异性管远处、平铺再乘有效分辨率 → 512 对本风格绰绰有余，
  256 近墙会糊，1024 对平面着色是浪费（体积 / 显存 ×4）。

## 5. UV 平铺（密度恒定）

- **几何 UV 以「米」为单位**（1 UV 单位 = 1 米），原点见 §6。故采样 tile 数 = `米 × (1/size) = 米 / size`。
- 密度**只由 `size` 决定，与面大小无关** → 恒定。**跨引擎法向公式：**

  ```
  tiles_per_face_axis = faceSizeMeters / size_axis      // size_axis 默认 1（米）
  ```

- `material.repeat`（authored，默认 `[1, 1]`）= **叠加在上的细乘子**，用于局部微调，不改变默认密度。
- 仅**盒 / 墙的轴对齐面**保证该密度；球 / 柱 / 面 / 楔的世界空间 UV 见 §8 缺口。

## 6. 锚定 `[bottom, left]`

- 默认 **face-local `[bottom, left]`**：每个面从**左下角**起铺，**底行永远是完整一块**（砖从地起、不被下边裁半块）。
- 各面「bottom / left」约定（frame-neutral，任何引擎须一致）：
  - **竖面**（法线水平的 4 个侧面）：`v=0` 贴在**世界下方**（−up / 重力方向）一侧；`u=0` 贴在该面水平切向的**较小**一端。
  - **横面**（顶 / 底，法线朝上下）：原点取 **(min 东, min 北)** 角。
- **世界对齐**（相邻 adjunct 接缝处花纹对齐、大墙无缝）= **opt-in**：经 `material.offset = fract(worldCorner / size)` 逐面设定 → **破坏去重**（该面须 clone-on-write 独立材质）。默认不启用。

## 7. 材质与确定性

- 材质 `MeshStandardMaterial`；贴图赋 **`.map`**（sRGB albedo）。颜色索引 / hex → 基色 tint（贴图面用白底以显真色）。
- **去重**：同 id 共享一张 `THREE.Texture`；`repeat = 1/size` per-id 一致，故共享安全。仅 world-aligned / 视频 / 运行时改色走 clone-on-write。
- **确定性**：`size` / 密度 / UV 全部由**数据 + 面尺寸**推导，无随机 → 跨引擎逐面可复现（同 iNFT 性质）。

## 8. 缺口与路线（v1 之外）

- **PBR 多贴图**：贴图记录 + 材质加 `normal / roughness / metalness / ao / emissive` 槽（v2）。
- **`material.offset / rotation`**：当前声明未接线；world-aligned 锚定与贴图滚动依赖它，随之实现。
- **非盒几何 UV**：球 / 柱 / 面 / 楔的世界空间 UV（当前回落 0..1，密度不归一）。
- **墙 a1 raw 贴图**：当前墙 `raw[7]` 被当**颜色**用，从数据贴不了图（见 §9 勘误）；补 raw 贴图槽或改述。

## 9. 实现状态 · 迁移 · 勘误

- **已实现**：尺寸驱动 UV（现为全局 `TILE_METERS = 2`）、albedo `.map`、id / CID 解析、去重 + 引用计数、POT 告警、各向异性、sRGB。样例仅 3 张（`checker` id7 / `ground-forest` id1 / `ground-moon` id5）。
- **本规范的变更**：全局 `TILE_METERS = 2` → **贴图 `size`（默认 1m）**；新增 **512 px/m** 纹素密度基准；`[bottom, left]` 锚定；接通 `offset`；补墙贴图。
- **迁移**：给现有 `checker / ground-forest / ground-moon` 填 `size` 以保观感；按 512 px/m 重出为 POT。
- **勘误**：[附属物协议 §5](./adjunct.md) 的资源表曾写「图像 `raw[3]` = texture id」——**有误**。`raw[3]` 是**颜色 / 调色板索引**；**贴图在 a2 box 的 `raw[7]`**（可选）。以本协议 + [附属物类型](./adjunct-types.md) 为准。
