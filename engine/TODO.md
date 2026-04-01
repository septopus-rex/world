# Engine Migration TODO

从旧引擎（backup/engine_back）迁移到新 ECS TypeScript 引擎的待办事项。

## Adjunct 类型

- [x] **basic_light** — 点光源/聚光灯/平行光 adjunct（`basic_light.ts`，typeId: 0x00a3）
- [ ] **basic_module** — 外部 3D 模型加载 FBX/GLB（旧: `basic_module.js`）
- [ ] **basic_stop** — 碰撞体/阻挡物 adjunct（旧: `basic_stop.js`）

## 核心系统

- [ ] **TimeSystem** — Septopus 时间系统，链上纪元换算（旧: `time.js`）
- [ ] **WeatherSystem** — 天气系统，雨/雪粒子效果（旧: `weather.js`）
- [ ] **SkySystem** — 天空盒 + 昼夜循环（旧: `sky.js`，当前 EnvironmentSystem 只有基础光照）

## 控制器 & 渲染器

- [ ] **Control2D** — 2D 俯视图控制器（旧: `control_2d.js`）
- [ ] **ControlObserve** — 观察者模式控制器（旧: `control_observe.js`）
- [ ] **Render2D** — 2D 地图渲染（旧: `render_2d.js`）
- [ ] **RenderObserve** — 观察者视角渲染（旧: `render_observe.js`）
- [ ] **RenderModel** — 3D 模型加载渲染（旧: `render_model.js`）
- [ ] **RenderTexture** — 纹理预览（旧: `render_texture.js`）

## 数据层 & IO

- [ ] **API Solana** — Solana 链上数据读取（旧: `api_solana.js`）
- [ ] **IPFS** — IPFS 数据存取（旧: `ipfs.js`）
- [ ] **Actions** — 用户操作队列（旧: `actions.js`）
- [ ] **Pages** — 页面/路由管理（旧: `pages.js`）

## 特效

- [ ] **CameraEffects** — 相机特效：fall、linger（旧: `effects/camera/`）
- [ ] **MeshEffects** — Mesh 特效：color、morph、move、opacity、rotate、scale、texture（旧: `effects/mesh/`）
- [ ] **SceneEffects** — 场景特效：lightning（旧: `effects/scene/`）

## 工具 & 插件

- [ ] **Touch** — 触摸手势处理（旧: `lib/touch.js`）
- [ ] **Builder** — 场景构建工具（旧: `lib/builder.js`）
- [ ] **Two.js** — 2D Canvas 绘图工具（旧: `lib/two.js`）
- [ ] **PlugLink** — 链接插件（旧: `plugin/plug_link.js`）
- [ ] **PlugQR** — 二维码插件（旧: `plugin/plug_qr.js`）

## 安全

- [ ] **AdjunctSandbox** — 第三方 adjunct 沙箱隔离加载（旧: `security/`）
