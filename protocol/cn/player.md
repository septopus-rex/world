# Septopus 玩家协议 (Player Protocol)

在 **Septopus 引擎** 中，“玩家 (Player)” 不仅是一个视点，而是一个遵循物理规则并在世界中具有实体表现（Avatar）的交互单元。其位置与状态由引擎实时追踪，并可与经由 SPP 组织的内容进行深度交互。

## 1. 玩家空间状态 (Player Spatial State)

与静态地块不同，玩家的状态是高度动态的。Septopus 引擎必须持续追踪玩家的世界定位和姿态，以计算物理效果和渲染边界。

玩家的核心持久化状态格式：
```json
{
    "block": [2025, 501],         
    "world": 0,                   
    "position": [8, 14, 0],       
    "rotation": [0, 0, 0],       
    "stop": {
        "on": false,               
        "adjunct": "",            
        "index": 0                
    },
    "extend": 2,                  
    "posture": 0                  
}
```

### 状态属性说明
*   `block`: 玩家当前所在的地块的 `[X, Y]` 坐标。
*   `world`: 当前 Septopus 世界的 ID。
*   `position`: **相对于当前地块**的 `[X, Y, Z]` 精确坐标。
*   `rotation`: 玩家视角的欧拉旋转数组 `[X, Y, Z]`。
*   `stop`: 定义垂直碰撞接地。如果玩家站在高架对象（如桥梁或桌子等附属物）上，引擎必须知道计算绝对坠落方程应参照哪个对象。
*   `extend`: 视口加载半径。定义在玩家周围加载多少个相邻的格子（网格地块）。
*   `posture`: 表示移动状态的整数（例如，`0`: 站立, `1`: 行走, `2`: 奔跑, `3`: 攀爬, `4`: 蹲下, `5`: 躺下/匍匐）。

## 2. 地形与重力计算 (Terrain & Gravity Calculations)

引擎会动态计算玩家下方的绝对高度（Z轴地板），以防止其掉出世界。

`绝对地板 Z轴 = 基础地块海拔 + 正在交互的‘支撑 (Stop)’附属物海拔 + 对象高度`

### 移动边界检查 (Movement Boundary Checks)
当玩家试图横向移动时，物理系统必须使用以下逻辑评估高度差：
1.  **地块 $\rightarrow$ 附属物 (Block $\rightarrow$ Adjunct)**：玩家向一个对象迈步。如果对象高度在“踏步高度”内，则是“向上踩踏”。如果太高，则是“阻挡碰撞”。
2.  **附属物 $\rightarrow$ 附属物 (Adjunct $\rightarrow$ Adjunct)**：玩家在两个对象之间行走。可能导致“向上踩踏”、“阻挡碰撞”、“向下踩踏”或“致命坠落”。
3.  **附属物 $\rightarrow$ 地块 (Adjunct $\rightarrow$ Block)**：玩家从对象上走到空地上。会导致“向下踩踏”或“致命坠落”。

## 3. 虚拟化身 (Avatars)

玩家可以使用 Avatar 文件向其他人广播他们的视觉表示。为了保持去中心化，Avatar 文件存储在 IPFS 上。

### Avatar 元数据结构 (Avatar Metadata Structure)
当玩家装备一个 Avatar 时，客户端会提供以下配置文件，以便引擎计算准确的碰撞箱（hitboxes）和动画。

```json
{
    "body": {
        "scale": [1, 1, 1] 
    },
    "action": [],
    "emotion": [],
    "datasource": "ipfs://Qm...",  
    "format": "vrm"           
}
```

### Avatar 动画与表情 (Avatar Animations & Emotes)
Avatar 模型必须至少包含以下绑定到 `posture`（姿态）状态的标准动画骨骼：
- **移动骨骼 (Movement Skeletons)**：`Stand` (站立), `Walk` (行走), `Run` (奔跑), `Squat` (蹲下), `Prone` (匍匐), `Climb` (攀爬).
- **表情混合变形 / 面部 (Emote Blendshapes)**：`Normal` (正常), `Happy` (高兴), `Angry` (生气), `Sad` (悲伤)（每个支持 8 级强度渐变）。
