---
name: spp
description: 创作、设计与构建 SPP（弦粒子空间预制体）的全流程技能。涵盖微观单胞粒子库（StylePack 面变体池与独立组合件 Prefabs）到宏观建筑、合院庭院与外部路网空间规划、多 SPP 混排串联、高精 3D 资产（GLB）程序化生成与 Manifest 契约、物理碰撞体隐形防坑规范、纯数据关卡交付与自动化门禁/视觉多机位巡检。
---

# SPP 全流程综合指南：从单胞粒子到多合院空间矩阵

SPP（String Particle Protocol / 弦粒子空间预制体，Adjunct Type `0x00b6` / 182）是 Septopus 引擎中用于快速组装高自由度、程序化、可换肤 3D 空间的建筑体系。

本指南总结了从微观 StylePack 粒子库、单栋建筑进深开间，到多合院串联、外部路网自然环境、高精 3D 资产（GLB）程序化生产与物理碰撞体隐形规范的全流程实战闭环。

---

## 1. 架构总览与分层职责

Septopus 中的空间内容遵循严格的分层数据契约，杜绝把内容硬编码进 TS 逻辑：

```
+-----------------------------------------------------------------------------+
| Level / Block (关卡 / 地块容器)                                               |
|  - client/core/src/levels/*.level.json 或 client/core/src/blocks/*.block.json|
|  - 纯 JSON 数据，包含一个或多个 SPP Adjunct 实例                               |
+-----------------------------------------------------------------------------+
                                      |
                                      v 引用并实例化
+-----------------------------------------------------------------------------+
| SPP Adjunct 实例 (Type 0x00b6 / 182)                                         |
|  - raw: [origin, cells, theme, seed]                                        |
|  - 每个 cell: position: [gx, gy, gz], level: 0, faces: [[state, key] x 6]   |
+-----------------------------------------------------------------------------+
                                      |
                                      v 引用风格包
+-----------------------------------------------------------------------------+
| StylePack 风格包 (微观粒子库)                                                 |
|  - client/core/src/stylepacks/*.stylepack.json                              |
|  - closed / open 两池面变体 (options) + 独立组合件 (prefabs)                  |
|  - 零件 (parts) 映射为底层几何 (a1/a2/a4/a6/a7/a8/b4 stop 等)                |
+-----------------------------------------------------------------------------+
                                      |
                                      v 展开执行
+-----------------------------------------------------------------------------+
| Engine Expander (引擎展开器)                                                 |
|  - engine/src/core/spp/Expander.ts -> expandSpp()                           |
|  - 自动将多 SPP 矩阵展开为具象的 3D Adjuncts 并挂载进入 ECS 世界                |
+-----------------------------------------------------------------------------+
```

---

## 2. 微观层：StylePack 粒子库制作与规范

StylePack 决定了单位胞（Cell，默认 $4\text{m} \times 4\text{m} \times 4\text{m}$）每个面及独立摆件的视觉与物理表现。

### 2.1 两池与组合件分工
1. **`closed` 闭合池**：用于面阻挡（实心墙 `solid`、窗户 `window`、装饰墙面等）。
2. **`open` 连通池**：用于面通行（门洞 `doorway`、空面 `empty`、低矮围栏、月亮门通道等）。
3. **`prefabs` 组合件**：独立于六面的摆件（桌椅、路灯、水井、假山、树木等）。通过胞坐标原点进行放置。

### 2.2 轴系坐标映射（面帧 vs 胞帧）
千万不要混淆面零件与组合件的参考帧，否则会导致模型躺倒或深度错位：

| 构件类型 | 参考帧 | u 轴 | v 轴 | w 轴 | sw 轴 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **面变体 (Face)** | `FACE_AXES` | 沿面横向 (0..1) | **沿面竖向 (0..1)** | **向胞内凹进深** | **构件厚度** |
| **组合件 (Prefab)** | `PREFAB_AXES` | 东 X 偏移 (0..1) | **北 Y 地面足迹** | **离地高度 (Z)** | **自身高度** |

### 2.3 OptionGuard 几何守卫标准
提交 StylePack 前，几何守卫（`engine/src/core/spp/OptionGuard.ts`）必须严格检查：
- `part-out-of-cell`：零件 u/v 越界或过度穿透到邻格。
- `part-zero-size`：尺寸为 0 的无效几何。
- `parts-coincident`：两个零件完全重合导致 Z-fighting 闪烁。
- `closed-empty` / `open-sealed`：语义矛盾（闭合池放空面，或连通池全封死）。

### 2.4 微观五大核心避坑法则（血泪实测）
1. **`w`/`sw` 是【网格比例】而非厚度比例**：
   - 默认格宽 $4\text{m}$，`sw=0.85` 代表 $3.4\text{m}$ 厚度！
   - 面构件厚度一律保持在 $\le 0.11$（约 $0.44\text{m}$ 以内），常规墙皮使用 $0.0625$（$0.25\text{m}$）。
2. **层次感靠「贴图大面 ⟷ 调色板纯色构件」反差**：
   - 严禁“贴图叠贴图”，否则纹理网格对冲会导致构件直接隐形。
   - 大面走贴图（a2 槽 7），柱梁、框条、挑檐走纯色调色板（`Palette.ts` 内建索引，自带预设粗糙度与金属度）。
3. **面变体中禁止使用 `rot`、a6 锥与 a8 牌**：
   - `partToBox` 展开时只按包围盒映射，`rot` 不随面朝向变换；a6 锥参数是顶底半径而非包围盒；斜面或特殊造型优先使用 a4 模型组件或精确堆叠。
4. **体量型 option 保护（不盲从守卫）**：
   - 类似双跑楼梯 `stair_top` 这类全胞体量构件，其中间的两跑隔墙需要较大进深，守卫报 `part-too-deep` 属正常情况，切勿破坏其通行几何。
5. **凹龛与门洞只能做“加法减空”**：
   - 引擎几何是纯加法系统。要想做出凹槽、窗洞或门洞，正解是**将墙面拆成多块零件拼合、让出中间空位**，严禁试图放深色背板伪造凹洞。

---

## 3. 宏观层：SPP 建筑拓扑与空间规划

当从单胞走向完整建筑时，需要遵循严密的网格拓扑规则。

### 3.1 网格系统与朝向标准
- 单位胞尺寸基准：$4\text{m} \times 4\text{m} \times 4\text{m}$。
- 面索引（Face Index）：
  - `0`：顶面（Top / Roof / Ceiling）
  - `1`：底面（Bottom / Floor）
  - `2`：南面（South）
  - `3`：北面（North）
  - `4`：西面（West）
  - `5`：东面（East）

### 3.2 建筑空间规划与六面闭合
1. **开间与进深**：
   - 单房间采用 $1\times 1$ 或 $2\times 1$ 单元；
   - 传统殿堂/客栈主房采用 $3\times 1$ 开间（例如东厢、正堂、西厢）；
   - 外部连廊采用 $3\times 1$ 窄进深单胞通道。
2. **室内外闭合原则**：
   - **外围包络**：朝向建筑外部的面统一设置为 `closed`（如 `wall_solid`、`window`）。
   - **出入口**：正门所在面设为 `open`（如 `doorway`），门洞必须留出宽 $\ge 1.2\text{m}$、高 $\ge 2.2\text{m}$ 的净空。
   - **室内隔断**：若两间相连，接壤面可设为 `open`（`doorway` 或 `empty`）实现无缝室内漫游。

### 3.3 告别平板屋顶：中式挑檐与坡顶系统
平顶纸片屋顶会严重破坏中式场景质感。必须通过顶面（Face 0）组合件或面变体打造三维坡顶：
- **歇山顶/悬山顶（Hipped & Gable Roof）**：
  - 顶面设置带有倾角的屋脊零件（`roof_ridge`）；
  - 檐口（`roof_hip_eave` / `roof_gable_eave`）必须向外悬挑 $0.3\text{m} \sim 0.5\text{m}$（负 $w$ 值），形成真实的檐下阴影空间；
  - 翼角翘角：角隅位置增加起翘件，屋面由多层瓦陇（a2 盒子错级微落差）拼接，形成饱满屋脊轮廓。

---

## 4. 多 SPP 混排与外部路网穿联规范

在构建村落、街区或大型合院时，**绝不要把所有东西塞进单个庞大的 SPP**。必须拆解为多个独立 SPP 协同组装。

```
+---------------------------------------------------------------+
|                      外部环境路网 SPP                          |
|  [西院入口 T 路口] <====== 东西向石板路 ======> [东院入口 T 路口]  |
+---------------------------------------------------------------+
           ||                                       ||
        无缝对接                                 无缝对接
           ||                                       ||
+-----------------------+               +-----------------------+
|      西禅院 SPP       |               |     客栈主院落 SPP     |
| - 月亮门入口 (南)      |               | - 月亮门入口 (南)      |
| - 枯山水 / 太湖石      |               | - 客栈大堂 (3 开间)    |
| - 厢房禅室            |               | - 庭院石桌 / 古井 / 连廊|
+-----------------------+               +-----------------------+
```

### 4.1 独立 SPP 拆解原则
将不同功能的建筑与环境解耦：
- **建筑 SPP**：如客栈主房 SPP（$3\times 1$）、西厢房 SPP（$2\times 1$）；
- **庭院 SPP**：如内庭天井 SPP、游廊 SPP；
- **环境路网 SPP**：涵盖公共步道、草坪、围栏、石桥与护城水系的独立大网格 SPP。

### 4.2 跨 SPP 边界精准咬合准则（三铁律）
1. **坐标无缝接缝（Coordinate Snapping）**：
   - 相邻 SPP 的边界单元格必须在绝对世界坐标上紧密接合（例如东院南界为 $Y=4.0\text{m}$，外部路网北界必须恰好对齐在 $Y=4.0\text{m}$），严禁留下缝隙或跨格重叠。
2. **通道中心轴线对准（Axis Alignment）**：
   - 院落的月亮门（`moon_gate`）中心 $X$ 坐标，必须与外部路网的 T 型路口（`path_stone_t_north`）在 $X$ 轴上完全一致。
3. **消除对冲阻挡（Passage Clearance）**：
   - 跨 SPP 连通口处，一侧设置了门洞/变体，**另一侧接壤的相邻 Cell 对应面必须显式设置为 `[0, "empty"]`**！
   - 严禁两侧都生成实体墙，或一侧生成实体阻挡构件导致玩家卡在接缝处。

---

## 5. 高精 3D 资产（GLB）程序化生产与 Manifest 契约管线

针对复杂的特色构件（月亮门、苏州花窗、太湖石假山、石灯笼、古井、拱桥、垂柳），使用代码程序化生成 GLB 并接入引擎。

### 5.1 资产生成脚本规范
编写 Node.js 独立脚本（例如放在 `client/editor/tools/generate_*.mjs`），使用 Three.js 构造几何体并使用 `GLTFExporter` 导出：

```javascript
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import fs from 'fs';

// 创建根 Group
const root = new THREE.Group();

// 核心准则：模型底部对齐 Y = 0，水平中心对齐原点 (0, 0)
const baseMesh = new THREE.Mesh(geometry, material);
baseMesh.position.set(0, height / 2, 0);
root.add(baseMesh);

// 导出为标准 GLB
const exporter = new GLTFExporter();
exporter.parse(root, (gltf) => {
  fs.writeFileSync('client/desktop/public/assets/pal1-env-stone-lantern.glb', Buffer.from(gltf));
}, { binary: true });
```

### 5.2 模型包围盒贴地准则（Bounding Box Origin Pinning）
- **底部最低点必须归零（$Y_{min} = 0$）**：无论是石桌、假山、石灯笼还是大树，底面接触地面的网格点必须精确位于 $Y=0$。
- **严禁浮空或沉地**：如果模型中心在几何中心而不是脚底，展开进 SPP 后会有一半模型扎进地底或悬浮在空中。

### 5.3 严格遵守 AGENTS.md 资源契约
- **文件落位**：资产一律输出到 `client/desktop/public/assets/`。
- **注册 Manifest**：打开 `client/core/src/assets/demo.manifest.json`，在 `items` 中分配连续的全局整型 ID：
  ```json
  {
    "id": 110,
    "kind": "model",
    "uri": "pal1-env-stone-lantern.glb",
    "name": "pal1_env_stone_lantern"
  }
  ```
- **红线警告**：**严禁在任何 Level/Block/StylePack JSON 中直接写 `"/assets/xxx.glb"` 相对路径！** 必须使用分配的整型数字 ID 引用（如 110）。
- **Git 体积零膨胀规范（源码进库，产物就地生成）**：
  凡是通过 Three.js 脚本纯代码生成的 GLB，**不得提交到 Git 仓库**，一律写入 `.gitignore`；新生成的脚本必须挂接至 `client/editor/tools/build_all_assets.mjs`，由 `deploy/dev.sh` 或 `npm run build:assets` 在启动/构建时就地秒级生成（<1s）。仓库中仅保留真正不可再生的外部导入手工模型。

### 5.4 StylePack 中的模型消费模式
在 StylePack 的 `prefabs` 或面变体中使用 a4 模型组件（`kind: 4`）调用：
```json
{
  "name": "stone_lantern",
  "size": 2,
  "parts": [
    {
      "kind": 4,
      "su": 1, "sv": 1, "sw": 1,
      "raw": [110, 0, 0]
    },
    {
      "kind": 180,
      "su": 0.4, "sv": 0.4, "sw": 0.8,
      "props": [1, 0, 1, 1]
    }
  ]
}
```

---

## 6. 物理碰撞与可通行性防坑守则

让场景既美观又真实可玩，物理碰撞（Collider）的设置至关重要。

### 6.1 彻底消灭“半透明青色力场箱”
- **现象**：游戏中物体周围出现一个半透明发光的青色方块，严重破坏视觉沉浸感。
- **根因**：组件 180（`basic_stop.ts`）的 raw 格式为：
  `[size, pos, rot, stopMode, animate, stopShape, stopHidden]`
  当 `stopHidden`（第 6 槽，即 `props` 的第 3 索引）未提供或为 falsy 时，渲染器会强制画出半透明青色调试包围盒。
- **铁律**：所有用于物理碰撞的 `b4 stop`（kind 180）构件，其 `props` 必须显式写为：
  ```json
  "props": [1, 0, 1, 1]
  ```
  其中末位的 `1` 便是 `stopHidden: true`（第 2 位为碰撞形状：1 为 BOX，2 为 BALL）。

### 6.2 碰撞体内缩与防闪烁（Footprint Insetting）
- **不要与可见几何表面共面**：如果 stop 盒子的边界与石桌或墙体完全重合，深度测试会导致剧烈 Z-fighting，在视图中表现为物体表面**大面积发黑或闪烁**。
- **碰撞体内缩法则**：碰撞体在水平方向 ($X, Y$) 比可见模型内缩 $0.05\text{m} \sim 0.1\text{m}$，高度略低 $0.02\text{m}$。这样既能挡住角色，又绝不干扰视觉渲染。

### 6.3 玩家通行性校验
- **过道净空**：月亮门中间通道、桥面通道、室内门扇必须保持无碰撞或空心；
- **树冠穿透**：大树树干设置柱状/方块碰撞，树冠（叶片）不得设置实体碰撞阻挡，允许角色从树下自然穿行。

---

## 7. 世界数据契约与工程门禁规范

所有产出必须严格遵守仓库门禁与无链数据契约。

### 7.1 关卡数据标准（Level JSON Schema）
关卡文件统一置于 `client/core/src/levels/*.level.json`，遵循 `septopus.world.level`：
```json
{
  "format": "septopus.world.level",
  "version": 1,
  "start": {
    "block": [2048, 2048],
    "position": [20.0, 1.0, 8.0],
    "rotation": [0, 0, 0]
  },
  "blocks": [
    {
      "x": 2048,
      "y": 2048,
      "raw": [
        0,
        1,
        [
          [
            0x00b6,
            0,
            [
              [4.0, 4.0, 0.0],
              [ /* cells array */ ],
              "pal1_inn",
              12345
            ]
          ]
        ]
      ]
    }
  ]
}
```
- `start` 必须包含具名 `block: [x, y]`，不能写裸坐标；
- `blocks` 数组中每个元素必须显式标注 `x: 2048, y: 2048`；
- 严禁修改 `engine/src` 源码来迎合格式。

### 7.2 自动化测试三重门禁
每次迭代后，必须运行全套验证命令并保证 100% 绿色：
```bash
# 1. 引擎全量单元测试与内容合规门禁
cd engine && yarn test:run

# 2. 检查是否有非法引入（保持 Three.js 只在 engine/src/render 中使用）
grep -r "from 'three'" engine/src/core engine/src/plugins

# 3. 客户端构建验证
npm --prefix client/desktop run build
```

---

## 8. 自动化多机位视觉巡检与海报输出

“不看图等于没做”。单靠断言只能证明数据结构合法，无法保证空间的美学比例。

### 8.1 Playwright 多机位自动漫游脚本
编写截图工具（如 `client/editor/tools/capture_spp_village.mjs`），使用无头浏览器批量捕获高画质机位：
```javascript
const views = [
  { name: 'isometric', pos: [32, 28, 26], lookAt: [16, 12, 0] },     // 全景俯瞰鸟瞰
  { name: 'east_gate', pos: [10, -2, 1.6], lookAt: [10, 8, 1.8] },    // 东合院月亮门正面
  { name: 'path_east', pos: [2, 1.0, 1.2], lookAt: [24, 1.0, 1.4] },   // 步道纵深微观
  { name: 'west_gate', pos: [24, -2, 1.6], lookAt: [24, 8, 1.8] },    // 西禅院月亮门正面
  { name: 'roof_up',   pos: [10, 5, 0.8],  lookAt: [10, 8, 4.0] },     // 檐下仰视屋脊飞檐
  { name: 'detail',    pos: [10, 8, 1.2],  lookAt: [10, 10, 1.0] }     // 石桌/古井微距特写
];
```

### 8.2 自动化全景评估海报（Master Poster）
使用 Python PIL 脚本将多视角图像自动拼接为 $2560 \times 1600$ 高清 Master Poster，保存到工件目录（如 `pal1_village_evaluation_poster.png`）：
- 上半部：大尺寸全景俯瞰透视（全局空间排布）；
- 下半部：多联排微观特写（通道对齐、阴影质量、石材质感、屋顶翘角）。
- 评审标准：比例是否失调、构件是否穿帮、光影是否立体、材质对比是否自然。

---

## 9. 极简速查 Checklist

在完成一个 SPP 需求并准备提交前，快速核对：
- [ ] **内容纯 JSON**：新建筑/新关卡落地为纯数据 JSON，未在 TS 里硬编码内容，未侵入引擎。
- [ ] **资产合法性**：所有 GLB/贴图通过 `demo.manifest.json` 分配整数 ID 引用，无本地相对路径。
- [ ] **包围盒贴地**：3D 资产最低点对齐 $Y=0$，中心对齐 $(0,0)$，场景中无悬空漂浮物。
- [ ] **物理碰撞隐形**：所有 `b4 stop` 显式设置 `props: [1, 0, shape, 1]`，画面无青色半透明方框。
- [ ] **边界通道咬合**：多 SPP 串联处坐标连续无缝，月亮门与路口居中对齐，连通面显式设为 `empty`。
- [ ] **屋顶非平板**：屋顶具备挑檐、脊线或起翘，形成立体光影。
- [ ] **门禁绿灯**：`cd engine && yarn test:run` 全部通过，PWA build 成功。
- [ ] **全景海报看图确认**：通过 Playwright 多视角截图或拼接 Poster 确认画面质感达到设计预期。
