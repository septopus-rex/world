# Septopus World (世界) 协议

在 **Septopus 引擎** 中，“世界 (`world`)”是最高级别的管理和物理边界框。一个 Septopus 世界由若干连续的地块 (Blocks) 网格组成，并由引擎强制执行全局物理、大气条件和访问规则。地块内的内容组织（如通过 SPP 协议）则是该管理框架下的具体实现。

## 1. 世界架构与布局 (World Architecture & Layout)

Septopus 元宇宙由固定数量的顶层世界组成。
*   **世界总数**: 96 个独立的世界。
*   **宏观结构**: 这 96 个世界在数学上被映射到一个巨大宇宙立方体的 6 个面上（每个面 4x4 个世界）。
*   **世界尺寸**: 单个世界是一个 `4096 x 4096` 地块的有界网格。
*   **地块尺寸**: 单个地块代表 `16m x 16m` 的区域面积。

## 2. 管理与“领主” (Administration & The "Lord")

每个世界都属于一个“领主 (Lord)”拥有的独立主权领地。领主持有管理用的 NFT 或加密密钥，该身份授予其在区块链上修改该世界全局参数的权限。

**领主权限 (Lord Capabilities):**
*   **商业化与税收**: 领主可以制定经济政策或将领主头衔出售/转让给另一个实体。
*   **美学覆盖 (Aesthetic Overrides)**: 领主可以更改未被占有的荒野地块的默认地形纹理、默认地面颜色和基础海拔。
*   **访问控制 (Access Control)**: 领主决定允许哪些操作模式（例如，禁止“幽灵 (Ghost)”旁观者或强制开启纯“游戏专用 (Game-Only)”场景）。

## 3. 全局生态系统配置 (Global Ecosystem Configurations)

各个世界共享一组基础物理定律（不可变数据 / Immutable Data），但允许领主调整特定的大气表盘（可变数据 / Mutable Data）。

### 不可变配置 (系统级 / System Level)
在 Septopus 引擎初始创世时设定，无法由个别领主更改。
- **时间膨胀 (Time Dilation)**: 例如，Septopus 时间与现实世界时间的比率（默认为快 20 倍）。
- **天体系统 (Celestial Bodies)**: 标准化的天空盒配置（1 个太阳，3 个月亮）。
- **最大地块扩展 (Maximum Block Expansion)**: 硬性限制为 `4096 x 4096`。

### 3.1 时间与天气的确定性推导（规范 / Normative）

> 「数据即逻辑」：世界时间与天气由**链高度 + 链 hash** 纯函数推导，任何引擎（TS / UE）
> 对同一输入必须得出**同一时刻、同一场雨**。实现参照 `engine/src/core/systems/EnvironmentSystem.ts`。

**输入**：`height`（链块高度）、`hash`（`0x` 前缀十六进制串，长度 ≥ 20）、`interval`（链出块间隔，秒）、
`epoch`（创世起始高度，默认 0）、`speed`（时间流速倍率，默认 1.0）。

**世界时间**（固定单位历法）：
```
elapsed = max(0, height − epoch) × interval × speed        （秒）
year  = elapsed ÷ 31104000（= 360 天），取余后依次：
month = ÷ 2592000（= 30 天） · day = ÷ 86400 · hour = ÷ 3600 · minute = ÷ 60 · second = 余数
```
每级**无条件赋值**（跨日边界时低位必须归零，不得保留旧值）。

**天气**（hash 切片，字符位置按**去掉 `0x` 前缀后**计，0 起）：
```
category = parseInt(hash[10..11], 16) mod 4  →  0 clear · 1 cloud · 2 rain · 3 snow
grade    = parseInt(hash[12..13], 16) mod 4  →  0..3（强度梯度）
```
切片解析失败按 0 处理。**雷暴判定**：`category == rain 且 grade ≥ 1`。

**语义 / 渲染边界**：`(时间, category, grade, 雷暴判定)` 是**语义**（跨引擎必须一致）；
太阳角度、光照强度、闪电闪光包络、粒子密度等是**渲染器自定义**（行为等效即可，
参照 adjunct 协议 §6 的「same effect」边界）。

### 可变配置 (领主级 / Lord Level)
存储在智能合约中，可由世界的领主进行配置。
```json
{
    "world": {     
        "nickname": "Neon Genesis",        
        "mode": ["ghost", "normal", "game"],     
        "accuracy": 1000     
    },
    "block": {     
        "elevation": 0,       
        "max": 30,            
        "color": 0x10b981,     
        "texture": 2          
    },
    "player": {
        "start": {
            "block": [2025, 619],   
            "position": [8, 8, 0],   
            "rotation": [0, 0, 0]   
        }
    }
}
```

### 配置层级 (Configuration Hierarchy)
1.  **Septopus 引擎核心配置 (Engine Core Config)**: 引擎不可变的基石铁律。
2.  **世界配置**: 领主自定义的统一环境。
3.  **Avatar/地块配置**: 个体玩家或地主本地化的数据覆盖。

## 5. 坐标与旋转契约(规范 / Normative)

任何引擎实现必须遵守下列坐标语义,否则同一份数据会解出朝向/位置不同的世界。

### 5.1 轴序

- **Septopus(数据)轴序**:`X 东 · Y 北 · Z 高`,单位米;地块内坐标相对地块**西南角**原点,
  地块编号 `[bx, by]` 从 `[1,1]` 起(世界网格 4096×4096)。
- 引擎内部轴序自便(参考实现为 Three.js 的 X右/Y上/Z前,北 = −Z),但**数据一律
  以 Septopus 轴序书写与存储**,装载/持久化时由实现转换。

### 5.2 旋转(欧拉序与坐标系)

- 附属物 `[rx, ry, rz]`:**弧度,引擎系 Euler XYZ 序,绕几何中心**。它**不经**
  朝向换算直接在引擎系应用——即**绕竖直轴的 yaw 在 index 1**(engine Y = 上)。
- 由此存在一个刻意的不对称:**位置按 Septopus 系书写,旋转按引擎系书写**。创作内容时
  以此为准;新引擎实现时把 `[rx,ry,rz]` 当作"X右/Y上/Z前右手系的 XYZ 欧拉角、
  绕中心应用"即可对齐(观感等价,非逐位)。
- **玩家朝向(heading)例外**:玩家 yaw 采用导航语义(0 = 朝北,顺时针增,即罗盘
  heading),与引擎 yaw 的换算固定为 `heading = −engineYaw`。只有玩家出生/持久化
  朝向走此换算;附属物旋转不走。

### 5.3 尺寸

`size` 一律为**全长包围盒**(非半长),Septopus 轴序 `[东西, 南北, 高]`;
特例(a6 cone、a7 ball 直径语义)见 [adjunct-types.md](adjunct-types.md)。

## 9. 引擎常量分桶(规范,2026-07-09)

引擎实现中的常量按三桶归置(基础数据审计 P9/D6):

**协议不变量**(§1 已定,所有世界共享、不可覆盖):世界网格 4096×4096 块、
块 16×16×16 m、高度粒度 0.1 m、世界数 96。

**协议默认值(桶 B)**——数据缺省时各引擎必须取同一值:

| 量 | 默认 | 世界数据覆盖点 |
|---|---|---|
| 重力 | **−19.62 m/s²**(刻意 2× 标准重力的手感值,协议如此钉定) | `player.capacity.gravityMultiplier`(乘数) |
| 玩家血量 | 100/100 | `player.capacity.maxHp` |
| 交互够得着距离 | **3.5 m**(玩家→命中点,非相机;编辑模式不限) | `player.capacity.reach` |
| 仿真 tick | 0.1 s(10 Hz 网格/状态同步) | — |
| 块流式半径 | 2(5×5 邻域) | — |
| LOD 近界 | 40 m | `world.performance.lodNear` |
| 时间历法 | epoch 0 · speed 1.0 | 世界文档 `time` 段(`{epoch, speed}`) |
| 虚空回收深度 | 20 m | `player.capacity.voidRecover` |

**客户端观感(桶 C,非规范)**——各实现自定,协议不约束:鼠标/触屏灵敏度、
摇杆死区、相机 FOV/近远裁剪、小地图视锥、相机抖屏/下沉、自动回正速率。
