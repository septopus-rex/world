# 音视频媒体 adjunct —— 空间音频 emitter (e2) + 视频屏幕 (e3)

> **用途**：把「在 3D 世界里放音频 / 放视频」做成两个一等 adjunct，并**文档化整条音视频链路**，避免后期重复造轮子。核心判断：**取资源那半（id→record→resolveUrl→CID→IPFS→有界缓存→revoke）在音频、视频、模型、纹理之间是同一条脊，直接复用**；**拿到之后那半，音频（解码进内存的死 buffer）和视频（流式、有状态的活 `<video>`）是两种东西**，缓存/生命周期/每帧成本各自处理。
>
> **由来**：先做了 IPFS 资源回收（`c06d47e`：blob-URL revoke + 音频升为有界 LRU 资源）。本文在其之上，把「播放」这一层补成可放置、可 trigger 触发的 adjunct。
>
> **边界铁律**：plugin（`plugins/adjunct/`）**纯 TS、零 Three、零 DOM**——只声明「这是个视频面 / 音频源 + 参数」；`<video>` / `VideoTexture` / `PositionalAudio` 的实体化全落在 **render 层**（RenderEngine）。core 的 `AdjunctFactory` 只 `world.renderEngine.*` 调用，不碰 Three/DOM。
>
> **状态**：🟡 **MVP 规格 + 首个可跑切片**。MVP = 数据/plugin/注册/默认 + RenderEngine 实体化 + demoScene 试跑 + 数据层单测。**明确推迟**（见 §10）：点击 play/pause 控制、视频声空间化打磨、LOD 暂停、多人同步、edit form、master volume。

## 图例
| 标记 | 含义 |
|---|---|
| ✅ 已落地 · 🟡 方案定/部分落地 · 🔲 待办 · ⚠️ 坑（先知道） · ❌ 有意不做 |

---

## 1. 目标 / 非目标

**目标（MVP）**
- 两个可放置 adjunct：`e2` 空间音频 emitter、`e3` 视频屏幕。
- 复用已加固的资源链路（IPFS/CID + 有界缓存 + revoke），源可以是 CID、URL、路径。
- 可**自动播放**（进块即播）+ 可被 **trigger / 点击**触发（play/pause）。
- 在 demoScene 里能真的看到 / 听到。

**非目标（❌ / 推迟）**
- ❌ **YouTube 贴到 3D 面上**——技术不可能（YouTube 只给沙箱 iframe，跨域 iframe 不能采样进 WebGL）。要 YouTube 只能 DOM iframe 叠层（2D、无遮挡），本规格不做，见 §9。
- 🔲 多人**同步播放**（同帧时间戳）——设计轴见 §8，MVP 只做本地。
- 🔲 视频声的空间化（`MediaElementAudioSource → PositionalAudio`）打磨、LOD 暂停、master/mute 总控、edit form ——见 §10。

---

## 2. 共享资源脊（音/视/模/纹 同一条，复用）

已存在（`c06d47e`）：`ResourceManager` 里 `id → record → resolveUrl(raw) → (CID→IpfsRouter | gateway | path/data) → URL`，配 **有界 LRU 缓存 + blob-URL revoke**（`revokeIfUnused` / `IpfsRouter.revoke`）。

- **音频**：`getAudioUrl(idOrUrl)`（可选 `datasource.audio()` 通道，否则退 `module`）→ URL；`audioUrls` LRU cap，逐出即 revoke CID。
- **视频**：**同法**，加一个可选 `datasource.video()` 通道（退 `module`）；视频的 URL 缓存同样 LRU + revoke。**视频文件大，回收比音频更值。**
- 直连：URL（`http/data/blob/file`）/ CID 直接当 locator，不查 datasource（和 texture 的 `direct` 分支一致）。

> 结论：**「拿到 URL」这一段，视频照抄音频照抄纹理，零新轮子。** 差异全在「拿到之后」。

---

## 3. 音频链路（已存在 + 本次补 loop）

- 解码：`RenderEngine` 用 `THREE.AudioLoader` 把**整段**解码成 `AudioBuffer`（PCM 驻内存），`audioBuffers` LRU cap（`c06d47e`）。
- 播放：`playSpatialSound(url, position, volume)` → 有坐标 `PositionalAudio`（距离衰减）/ 无坐标平铺 `Audio`。**一次性 fire-and-forget**。
- **本次补**：`playSpatialSound(..., { loop })` —— ambient emitter（喷泉/火/背景乐）要循环。循环声要能**停**（离块/停止），故返回一个**句柄**用于 stop（见 §5 e2 生命周期）。

⚠️ **AudioContext 手势门**：WebAudio 在用户手势前 suspended（`RenderEngine:868` 那个良性 catch）。ambient 自动播会在**首次手势后**才真正出声。

---

## 4. 视频链路（新）—— 和音频根本不同

| | 音频 | 视频 |
|---|---|---|
| 取得 | 整段解码 `AudioBuffer` | **流式** `<video>` 边下边解逐帧 |
| 缓存对象 | 解码 buffer（可反复播） | **有状态的 `<video>` 元素** + `VideoTexture` |
| dedup | load-once instance-many 随便 | **仅同步同源可共享**一个 `<video>`→贴 N 面；独立时间线各一个 |
| 每帧 | 0 | `THREE.VideoTexture` **在 render 时自动刷**（无需手动 `needsUpdate`）|
| 生命周期 | 播完即止 | 需**按可见性/LOD 暂停** + 离块 dispose |

**实体化（render 层，新 `RenderEngine.attachVideoScreen`）**：
1. 建 `<video>`：`src=url`、`crossOrigin='anonymous'`（CORS 纹理必需）、`loop`/`muted`/`playsInline` 按参数、`autoplay` → `.play()`。
2. `new THREE.VideoTexture(video)`（自动逐帧刷），`colorSpace=SRGB`。
3. **clone-on-write** 目标 mesh 的材质（复用 `isolateMaterial` 那套，别染共享材质），`material.map = videoTexture`、`side = DoubleSide`。
4. 把 `{ video, texture }` 挂到 handle，`removeHandle` 时 `pause + src='' + texture.dispose + revoke CID`。

⚠️ **自动播放策略**：浏览器在用户手势前**禁止带声**自动播；`muted` 自动播是允许的。所以「进门自动带声播」会被拦——**默认 `muted:true` 自动播**，声音留给点击/手势解锁。
⚠️ **CORS**：跨域视频没 CORS 头 → 纹理被污染 → WebGL 拒绝。自托管 / CID 天然绕开。
⚠️ **编解码**：`<video>` 吃 MP4/H.264、WebM；HLS 要 hls.js。整文件 CID 没问题；IPFS 上流式 HLS 更麻烦（本 MVP 只整文件）。

---

## 5. 两个 adjunct

### e2 — 空间音频 emitter（`0x00e2`）
- **raw**：`[ size[E,N,Alt], pos[ox,oy,oz], rot, source, autoplay, loop, volume, refDistance ]`
  - `source`：音频 id / URL / CID。`autoplay` 0/1、`loop` 0/1、`volume` 0..1、`refDistance` 衰减半径。
- **视觉**：小 box 标记（可见、可点）。（后续：Edit 模式显 gizmo、Play 模式隐身。）
- **播放**：`autoplay` → 建块即 `playSpatialSound(url, pos, { loop })`（AudioContext 手势后出声）；点击（`interact.primary`）→ toggle（MVP 先只 autoplay，点击控制见 §10）。
- **生命周期**：句柄挂 handle，**block 驱逐 → stop + 清理**（ambient 不能漏音）。

### e3 — 视频屏幕（`0x00e3`）
- **raw**：`[ size[E,N,Alt], pos[ox,oy,oz], rot, source, autoplay, loop, muted, volume ]`
  - 渲染成一块**薄面板 / plane**（`size` = 屏幕宽高、厚极薄）。`source` 视频 id/URL/CID。
- **视觉**：plane（`DoubleSide`）贴 `VideoTexture`；未加载时先显纯色占位（和纹理 swap 一样「先色后贴」）。
- **播放**：`autoplay` 默认 `muted` 自动播（满足策略）；点击 → play/pause + unmute（MVP 见 §10）。
- **声音**：MVP 走 `<video>` 自带音轨（非空间）；**空间化**（`MediaElementAudioSource → PositionalAudio`）留 §10。
- **生命周期**：同 e2，驱逐即 `pause + dispose + revoke`。

---

## 6. 触及的扩展点

| 层 | 改动 |
|---|---|
| `core/types/AdjunctType.ts` | `Audio: 0x00e2`、`Video: 0x00e3` |
| `plugins/adjunct/adjunct_audio.ts`、`adjunct_video.ts` | 新 plugin（纯，仿 `adjunct_link`）|
| `core/services/AdjunctRegistry.ts` | 注册两者 |
| `core/edit/AdjunctDefaults.ts` | `PLACEABLE_ADJUNCTS` + `defaultRawFor` |
| `core/services/DataSource.ts` | 可选 `video?()` 通道（退 `module`；`audio?()` 已加）|
| `render/RenderEngine.ts` | `attachVideoScreen` / `attachAudioEmitter(loop)` + `removeHandle` 清理 |
| `core/factories/AdjunctFactory.ts` | mesh 建好后：`material.video` → attachVideoScreen；`media.audio` → attachAudioEmitter（只 `renderEngine.*`，不碰 Three）|
| `tests/helpers/null-render-engine.ts` | 两个新方法的 no-op stub |
| `client/.../DesktopLoader.ts` | （§10）`interact.primary` 扩成 media play/pause |
| `client/.../scenes/demoScene.ts` | 放一台电视 + 一个 emitter 试跑 |

---

## 7. 分层合规
- plugin 纯净：只产出带 `material.video=source` / `media.audio=source` 提示的 RenderObject，**不 import Three/DOM**。
- `AdjunctFactory`（core）：仿现有 `scheduleModuleSwap`/`scheduleTextureSwap`，见到提示就 `world.renderEngine.attach*(...)`——**只调 renderEngine 方法**。
- `RenderEngine`（render）：唯一碰 `<video>`/`VideoTexture`/`AudioContext` 的地方。
- 验证：`grep -r "from 'three'" engine/src/core engine/src/plugins` 落地后仍无输出。

---

## 8. 设计轴：本地 vs 同步（MVP 本地）
- **本地**（MVP）：trigger/autoplay 直接控本地 `<video>`/`PositionalAudio`，单人够用，各看各的。
- **同步**（未来）：播放状态（url / currentTime / paused）进 world 数据、经 **actuator + 事件**广播对齐（像游戏状态那样）。**trigger→actuator 这个缝对两者都对**——同步只是让 actuator 写状态/发网络事件，adjunct 接口不变。

---

## 9. YouTube（❌ 贴不上去，记录原因）
两道硬墙：① YouTube 只给官方 IFrame Player（沙箱跨域 iframe），ToS 不许抽裸流；② 跨域 iframe **不能采样进 WebGL**（`texImage2D` 只吃 img/video/canvas/ImageBitmap）。唯一走法 = DOM `<iframe>` 叠层（CSS3D）盖在 canvas 上：真 YouTube，但 **2D 图层**——无 3D 遮挡、透视近似、VR/后处理失效。**真 in-world 视频只能自托管 / CID / CORS 源。**

---

## 10. MVP 边界 / 分期
- **本切片（P0）**：类型 + plugin + 注册 + 默认 + RenderEngine 实体化（autoplay/muted 视频、autoplay/loop 音频）+ removeHandle 清理 + demoScene 试跑 + 数据层单测。
- **P1 点击控制**：`DesktopLoader` `interact.primary` → media play/pause/unmute（复用 link 那条 `stdData` 读取路径）。
- **P2 视频声空间化**：`MediaElementAudioSource → PositionalAudio`。
- **P3 LOD 暂停**：挂 `BlockLODSystem` / 可见性 → 远/隐即 pause，省解码。
- **P4 同步**：actuator media 动作 + 播放状态进 world 数据。
- **P5 打磨**：edit form、master/mute 总控、HLS。

---

## 11. 测试
- **数据层（engine 单测，可 headless）**：两个 plugin 的 serialize/deserialize 往返、RenderObject 形状（video 面带 `material.video`，audio 带 `media.audio`）、注册表命中、`defaultRawFor` 产出。
- **实体化（不可 headless）**：`<video>`/`VideoTexture`/WebAudio 需真浏览器 → NullRenderEngine 只 no-op stub；真播放留 **Playwright e2e / 手动 `npm run dev` 试跑**。
- **边界**：`grep "from 'three'" core/plugins` 无输出；engine+client tsc 绿。
