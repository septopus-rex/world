# Septopus 虚拟化身动画协议 (Avatar Animation Protocol)

> 状态：**基础链路已实现**（内嵌剪辑解码→注册 mixer→每帧推进，**确实在播**）；
> **形象/动作分离、标准骨架契约、重定向、VRM/VRMA 未实现**（见 §7）。本协议规定"化身怎么动"的数据契约，
> 使**任何解释器**（当前 TypeScript 3D 引擎只是其中一个官方解释器）读同一份数据都得到
> 同一套动画。与[玩家协议 §3](./player.md) 配套；实现入口
> `engine/src/core/EntityFactory.ts`、`engine/src/render/RenderEngine.ts`、
> `engine/src/core/movement/CharacterController.ts`。

## 0. 核心原则：形象 / 动作 / 状态 三层分离

一个会动的化身由**三个可独立替换的层**组成。它们分开引用、分开分发，这样动作能
**跨形象复用**、形象能**换皮不换动作**：

| 层 | 含义 | 规范基准 | 数据引用 |
|---|---|---|---|
| **形象 (form)** | 模型 + 蒙皮 + 标准人形骨架 | glTF / VRM（骨骼遵循 §1） | `avatar.resource`（id / IPFS CID） |
| **动作 (motion)** | 与形象无关的人形动作库，按状态命名 | VRMA / glTF clips（遵循 §3） | `avatar.motion`（动作集 id / CID） |
| **状态 (state)** | 引擎按运动语义驱动的状态机 | **本协议 §2 定义** | 不入数据——由引擎从运动状态确定性派生 |

> 之所以能"分离 + 复用"，前提是**骨架被标准化**（§1）：动作和形象用同一套骨骼命名，
> 引擎才能把任意动作**重定向（retarget）**到任意形象上。这与 VRM/VRMA、Mixamo、
> Ready Player Me、Unity Humanoid 同一原理。

## 1. 标准骨架 (Normative Skeleton) — VRM 1.0 Humanoid

化身的骨架**规范采用 VRM 1.0 humanoid 骨骼定义**。一个合规化身满足以下之一：

- 本身是 **`.vrm`**（humanoid 骨骼为标准内建）；或
- 是 **glTF / FBX**，其骨骼**可映射**到 VRM humanoid 骨名（Mixamo 的 `mixamorig:*`
  有确定映射，见附录 A）。

### 必备核心骨骼（缺一则判为不合规）

```
hips
spine            head
leftUpperArm  leftLowerArm  leftHand
rightUpperArm rightLowerArm rightHand
leftUpperLeg  leftLowerLeg  leftFoot
rightUpperLeg rightLowerLeg rightFoot
```

可选骨骼（`chest` / `upperChest` / `neck` / 手指 / 眼球等）遵循 VRM 规范全集（~54 根），
缺失时重定向跳过对应通道。

### 朝向归一化

化身的**前进方向 = 引擎 −Z（北）**。导入器须把模型静止姿态（T/A-pose）的正面归一化到
该轴（VRM 1.0 静止朝 +Z，需绕 Y 旋转 180°；其它格式按各自默认朝向归一化）。坐标轴映射
沿用 [坐标协议](../../docs/architecture/coordinate.md)（Septopus Z=上 ↔ 引擎 Y=上）。

## 2. 动画状态集 (Normative State Set)

引擎从玩家运动状态**确定性派生**一个语义状态，再驱动动作层。状态集与转换规则是规范的一部分
（保证多解释器一致）：

| 状态 | 含义 | 循环 | 派生判据（规范） |
|---|---|---|---|
| `idle` | 站立待机 | 循环 | `isGrounded` 且 `hSpeed ≤ IDLE_MAX`（默认 0.5 m/s） |
| `walk` | 行走 | 循环 | `isGrounded` 且 `IDLE_MAX < hSpeed ≤ WALK_MAX`（默认 `maxSpeedWalk·1.2`） |
| `run`  | 奔跑 | 循环 | `isGrounded` 且 `hSpeed > WALK_MAX` |
| `air`  | 腾空（上升/下落统称） | 循环 | 持续 `!isGrounded` 超过 **AIR_COYOTE**（默认 0.12s）——见下方迟滞说明 |
| `jump` | 起跳瞬间（可选） | 单次 | 起跳冲量施加的那一帧；播完回落 `air` |
| `land` | 落地缓冲（可选） | 单次 | 由 `air` 转 `isGrounded` 的那一帧；播完回落 `idle/walk/run` |

- `hSpeed` = 水平速度模长（忽略竖直分量）。阈值常量随 `PlayerBodyComponent` 可调，但
  **语义与比较关系固定**。
- **air 需迟滞（规范要求,coyote time）**：许多角色控制实现中 `isGrounded` 在**平地上
  逐帧抖动**(grounded 时跳过重力→无下坠→探测不到落地→变 false→施重力→又落地→true,
  如此每帧翻转)。若把裸 `isGrounded` 直接喂状态机,会让 `walk/idle` 与 `air` **每帧
  互切**,每次切换 `reset()` 把循环剪辑打回第 0 帧——表现为**角色僵在起步姿势**(此坑
  已实证并修复,2026-07-04)。因此 `air` 判定**必须去抖**:腾空累计时长超过 `AIR_COYOTE`
  才算真 `air`;真跳跃/坠落远超此窗口,一帧的落地抖动被吸收。实现:`CameraRig` 累加
  `_airborneSec`,落地清零。
- **v1 核心**：`idle/walk/run/air`（与现有 `CharacterController` 一致）；`jump/land`
  为可选增强。
- **缺失回退链**（动作集未提供该状态时）：`run→walk→idle`、`air→jump→idle`、
  `land→idle`。任一状态最终都能回退到 `idle`，故**动作集至少须含 `idle`**。
- 状态切换默认 **crossfade 0.25s**（`RenderEngine.setAnimationState` 的 `fadeSec`）。

## 3. 动作库与重定向 (Motion Set & Retargeting)

**动作集 (motion set)** = 一组与形象无关的人形动作剪辑，**按 §2 状态名索引**。

- **格式**（优先级）：
  1. **VRMA**（`VRMC_vrm_animation`，开放人形动画格式，**推荐**）——天然形象无关；
  2. **glTF/GLB** 内含按状态命名的 `AnimationClip`；
  3. **Mixamo FBX**（动作-only 导出，骨名按附录 A 映射）。
- **剪辑命名契约**：剪辑名**须**等于状态名（大小写不敏感：`Walk`=`walk`），或在动作集元数据里
  声明别名映射 `{ "Armature|mixamo.com|Layer0": "walk", ... }`。
- **重定向**：因形象与动作共用 VRM humanoid 骨架，引擎在装载时把动作通道**按骨名重定向**到
  形象骨架（缺失骨骼跳过）。重定向是引擎职责，**不入数据**。

## 4. 数据引用 (Data Reference) — 形象与动作分开引用

`world config` 的 `player.avatar` 扩展为：

```json
"player": {
  "avatar": {
    "resource": 30,        // 形象：模型资源 id / IPFS CID（必填）
    "motion": 31,          // 动作集 id / IPFS CID（选填，省略=引擎默认动作集）
    "scale": [1, 1, 1],    // 体格缩放（预留）
    "max": 2097152         // 文件大小上限（预留）
  }
}
```

| 字段 | 说明 | 状态 |
|---|---|---|
| `resource` | **形象**模型资源 id（经 `IDataSource.module()` 解析） | ✅ 已消费 |
| `motion` | **动作集** id（独立于形象；省略时用引擎内置默认人形动作集） | 🚧 规范已定，未消费 |
| `scale` / `max` | 体格缩放 / 大小上限 | 🚧 预留 |

- **分离的意义**：任何解释器解析同一对 `(resource, motion)` 即得到同一套动画——形象与
  动作各自内容寻址（CID）、各自缓存、各自复用。换形象不动动作、换动作不动形象。
- **默认动作集**：引擎须内置一套合规默认人形动作集，使**任何合规形象在不指定 `motion` 时也能动**。

## 5. 表情 / 变形 (Expression) — 规划

VRM 定义了标准化表情系统（presets：`happy/angry/sad/relaxed/surprised` + 口型
`aa/ih/ou/ee/oh` + `blink/lookAt`）。化身表情**规范沿用 VRM expression presets**，经渲染层
morph/blendshape 落地（与 Septopus 动画的 `morph` 通道复用 `RenderEngine.setMorphInfluences`）。
**v1 不实现**，仅占位命名以免未来撞名。

## 6. 与 Septopus 动画的关系（别混淆）

本协议是**人形骨骼/运动**动画。它与 [Septopus 时间线动画](../../docs/systems/animation.md)
（adjunct/block 的声明式 `timeline`：move/rotate/scale/opacity/color/texture/morph）是**两套
独立机制**：前者驱动**有骨架的角色**，后者驱动**附属物变换**。二者都经渲染层落地，互不替代。

## 7. 实现现状与差距 (Implementation Status)

| 环节 | 现状 |
|---|---|
| 形象：load / scale-to-height / 占位 swap / 第一人称隐藏 | ✅ |
| 内嵌剪辑解码 + 注册 mixer（rigged `avatar.glb`；e2e `avatar.spec.ts` 断言 clipCount/mixerCount>0）| ✅ |
| 状态派生 + `setAnimationState` crossfade + **每帧推进 mixer**（`RenderEngine.updateAnimation`，`core/movement/CameraRig.ts:180-188`——`CharacterController` 将 avatar 姿态/动画委托给 `CameraRig`）| ✅ **内嵌剪辑确实在播** |
| 状态→剪辑映射 | ✅ **v1 已落地**：规范契约（§3 名称相等、大小写不敏感）优先 + §2 回退链（`run→walk→idle`、`air→jump→idle`、`land→idle`）+ §2 阈值派生（`IDLE_MAX 0.5` / `WALK_MAX = maxSpeedWalk×1.2` 线性，`CameraRig`）；旧正则启发式仅作**不合规素材的降级兜底**（`ANIM_STATE_PATTERNS`）|
| 朝向归一化(per-model facing) | ✅ **v1.1（2026-07-04）**：`AvatarComponent.facing`(yaw 弧度) 逐模型修正 GLTF 朝前差异，`CameraRig` 应用 `playerYaw + facing`；实证 3 素材:soldier −Z(0)、legacy+robot +Z(π)——**无通用值,每模型自带**。仍未做:骨架命名校验/humanoid 归一化 |
| **形象/动作分离**（`avatar.motion` 共享可重定向动作库）/ 重定向 / 内置默认动作集 | ❌ **动作必须内嵌进每个 avatar GLB，无法 Mixamo 式跨模型复用** |
| VRM / VRMA 原生加载（`@pixiv/three-vrm`）| ❌（`ModelLoader` 暂不支持 .vrm）|
| 表情系统 | ❌ |

> 一句话现状：**能动**（内嵌剪辑在播），但**动作绑死在形象里、状态切换靠剪辑名瞎猜、没有标准骨架与可复用动作库**——本协议要把这块规范化。

### 7.1 外部模型对齐参数(per-model correction)

引入外部 GLTF/GLB 化身时,单靠"缩放到身高"不足以归一化——**模型的"朝前"方向不统一**
(有的 +Z、有的 −Z),直接套用会导致人物背对/正对镜头颠倒。因此每个化身自带一组
对齐参数,把它修正到 Septopus 系:

| 参数 | 语义 | 来源 |
|---|---|---|
| **facing** | yaw 修正(弧度):`CameraRig` 实际施加 `playerYaw + facing`。align 模型 forward → Septopus 北(−Z) | 逐模型 author(客户端 avatar 目录) |
| **height→scale** | 均匀缩放使包围盒高 = 身体高(1.8m) | 自动(装载时 `bounds` 推导) |
| **footOffset** | 缩放后包围盒底相对原点的 Y;落地时 `feetY − footOffset` 使脚贴地(无论 pivot 在脚还是身体中心) | 自动 |

**实证对齐值(v1.1,3 个 demo 素材)**:

| 化身 | facing | 朝前约定 |
|---|---|---|
| legacy `avatar.glb`(旅者) | `π` | +Z |
| `soldier.glb`(三.js Mixamo) | `0` | −Z |
| `RobotExpressive.glb` | `π` | +Z |

**没有通用值**——soldier 与另两者相反,facing 必须逐模型标定。合规化身(§1 标准骨架)
未来可省掉手工 facing(骨架已朝向归一);当前非合规素材靠此参数兜住。

### 落地分期

- **v1（规范化状态契约）**：**已落地（2026-07）**——§2 状态集 + 阈值派生 + §3 剪辑命名（名称相等优先）
  + 回退链进引擎；旧正则启发式降级为不合规素材兜底。朝向经 §7.1 per-model `facing` 参数逐模型修正（v1.1）；**骨架命名校验/humanoid 归一化**仍随 v2 重定向一起做。
  动作仍取内嵌剪辑、暂不跨模型重定向。
- **v2（形象/动作分离）**：消费 `avatar.motion`；实现 humanoid 重定向 + 内置默认动作集；
  glTF/FBX 骨名按附录 A 归一化到 VRM humanoid。**这一步才真正实现"动作和形象分开"。**
- **v3（VRM 原生）**：引入 `@pixiv/three-vrm` / `@pixiv/three-vrm-animation`，原生加载
  `.vrm` / `.vrma`；表情 presets。

---

## 附录 A — Mixamo → VRM humanoid 骨名映射（节选）

| Mixamo (`mixamorig:`) | VRM humanoid |
|---|---|
| `Hips` | `hips` |
| `Spine` / `Spine1` / `Spine2` | `spine` / `chest` / `upperChest` |
| `Neck` / `Head` | `neck` / `head` |
| `LeftArm` / `LeftForeArm` / `LeftHand` | `leftUpperArm` / `leftLowerArm` / `leftHand` |
| `RightArm` / `RightForeArm` / `RightHand` | `rightUpperArm` / `rightLowerArm` / `rightHand` |
| `LeftUpLeg` / `LeftLeg` / `LeftFoot` | `leftUpperLeg` / `leftLowerLeg` / `leftFoot` |
| `RightUpLeg` / `RightLeg` / `RightFoot` | `rightUpperLeg` / `rightLowerLeg` / `rightFoot` |

> 完整 humanoid 骨骼全集与可选骨骼以 VRM 1.0 规范为准。
