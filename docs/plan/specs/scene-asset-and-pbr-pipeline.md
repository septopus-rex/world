# 场景素材升级与 PBR 渲染管线落地规范

> 状态：草案 · 目标版本：v0.2 · 对应规划：提升 3D 世界场景素材精度至次世代 / 高精虚拟化身（Avatar）级别

---

## 1. 目标与背景

当前 Septopus 3D 虚拟世界的场景呈现以 Minecraft / 基础体素式的简单几何拼装为主，大部分表面仅依赖单张低分辨率（256~512px）的 Albedo/Diffuse 贴图，缺少法线凹凸、微表面光泽变化、环境光遮蔽（AO）及高精度模组构件。

为了让场景细节与拟真度达到高精 Avatar 级别（真实微表面质感、丰富光影层次、精细结构转折），制定本 4 阶段演进路线：

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           场景素材升级路线图                              │
├──────────────────────────────────────────────────────────────────────────┤
│ 阶段 1：PBR 多通道材质与贴图集升级 (法线/粗糙度/金属度/AO/自发光)         │
│ 阶段 2：模组化 3D 资产库扩充 (Modular Prefabs / 倒角构件 / 植被与微道具)  │
│ 阶段 3：渲染后期与环境氛围 (SSAO 接触阴影 / Bloom 泛光 / ACES 电影调色)   │
│ 阶段 4：关卡微观层次重构与风格包焕新 (Palace / Gallery / Modern / Oriental)│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 阶段 1：PBR 材质管线与贴图集规范（本期重点）

### 2.1 材质数据协议扩展

现有协议（`protocol/*/texture.md`）仅支持单个 `albedo` 贴图（`material.texture`）。升级后扩展为标准 PBR 材质集通道：

```typescript
export interface PBRMaterialRecord {
    /** 基础漫反射/颜色贴图 (sRGB) */
    map?: string;
    /** 法线贴图 (Linear, Tangent-Space Normal Map) */
    normalMap?: string;
    /** 法线缩放系数，默认 [1, 1] */
    normalScale?: [number, number];
    /** 粗糙度贴图 (Linear, Grayscale) */
    roughnessMap?: string;
    /** 金属度贴图 (Linear, Grayscale) */
    metalnessMap?: string;
    /** 环境光遮蔽贴图 (Linear, Grayscale) */
    aoMap?: string;
    /** 自发光贴图 (sRGB) */
    emissiveMap?: string;
    /** 复合 ORM 贴图 (R: AO, G: Roughness, B: Metallic) - 推荐打包格式 */
    ormMap?: string;
}
```

### 2.2 纹素密度与贴图规范

1. **纹素密度基准**：
   - 保持协议规定的 **512 px/m** 标准（1m×1m 面使用 512×512 贴图，2m×2m 使用 1024×1024）。
   - 全部贴图必须为 **POT（2 的幂次方）** 格式，确保 mipmap 与各向异性过滤（Anisotropic Filtering）生效。
2. **法线贴图格式**：
   - 使用切线空间法线（Tangent-Space Normal），OpenGL 格式（Y+ 朝上）。
3. **ORM 复合贴图打包标准**：
   - Channel R: Ambient Occlusion（环境光遮蔽）
   - Channel G: Roughness（粗糙度）
   - Channel B: Metallic（金属度）
   - 单张 3 通道贴图替代 3 次 HTTP 网络请求与显存开销。

---

## 3. 阶段 2：模组化 3D 资产库扩充（Modular Prefabs）

### 3.1 资产分类与标准

1. **自然环境组件（Nature Kit）**：
   - 3 种树木形态（带轻量树冠几何体与法线）、灌木丛、地表草斑（Billboard + AlphaTest）。
2. **建筑与构件（Modular Architecture）**：
   - 统一 1m / 2m / 4m 栅格吸附标准。
   - 带有精致倒角与接缝的柱基、檐角、窗台、门框、栏杆。
3. **微观道具与装饰摆件（Props & Clutter）**：
   - 古建/中式：石狮、宫灯、屏风、香炉、木案。
   - 现代/室内：极简沙发、壁灯、室内盆栽、地毯、书架摆设。
   - 赛博/地牢：管线转角、警告标志板、全息终端、火把/吊灯。

---

## 4. 阶段 3：渲染后期与环境氛围（Post-Processing）

1. **屏幕空间环境光遮蔽（SSAO / GTAO）**：
   - 解决物体与地面、墙角连接处的“漂浮塑料感”，提供深邃自然的接触阴影。
2. **选择性泛光（Selective Bloom）**：
   - 对自发光贴图（`emissiveMap`）与光源区域施加柔和辉光，提升赛博霓虹与地牢火把的视觉张力。
3. **ACES Filmic ToneMapping & 色彩分级**：
   - 提升高动态范围亮暗部宽容度，避免过曝发白，色彩更加电影化。

---

## 5. 阶段 4：关卡微观层次重构与风格包焕新

1. **核心关卡升级**：
   - 重构 `palace.level.json`（故宫紫禁城）与 `gallery.level.json`：用带倒角的模组构件与 PBR 地砖替换原有的单调立方体硬拼。
2. **风格包配置焕新**：
   - 升级 8 套 StylePack（terran, oriental, spanish, modern, cyber, dungeon, brick, ice），绑定完整的 Normal 与 Roughness 贴图资源。

---

## 6. 验证与门禁标准

- **门禁命令**：`cd engine && yarn test:run`（全量单元测试与内容一致性校验 100% 通过）。
- **材质生命周期与引用计数**：所有 PBR 贴图由 `ResourceManager` 统一持有引用计数，`MeshFactory` 释放时无显存与纹理泄漏。
- **渲染无副作用**：未配置 PBR 多通道贴图的现有旧资产保持 100% 向后兼容。
