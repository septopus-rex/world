# SPP 世界协议 (World Protocol)

**String Particle Protocol (SPP)** 将“世界 (`world`)”定义为生态系统内最高级别的管理和物理边界框。一个 SPP 世界由一个有限且连续的地块 (Blocks) 网格组成，并强制执行全局物理、大气条件和访问规则。

## 1. 世界架构与布局 (World Architecture & Layout)

SPP 元宇宙由固定数量的顶层世界组成。
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
在 SPP 引擎初始创世时设定，无法由个别领主更改。
- **时间膨胀 (Time Dilation)**: 例如，Septopus 时间与现实世界时间的比率（默认为快 20 倍）。
- **天体系统 (Celestial Bodies)**: 标准化的天空盒配置（1 个太阳，3 个月亮）。
- **最大地块扩展 (Maximum Block Expansion)**: 硬性限制为 `4096 x 4096`。

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
1.  **SPP 核心配置 (SPP Core Config)**: 引擎不可变的基石铁律。
2.  **世界配置 (World Config)**: 领主自定义的统一环境。
3.  **Avatar/地块配置 (Avatar/Block Config)**: 个体玩家或地主本地化的数据覆盖。
