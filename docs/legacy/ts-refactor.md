# Septopus Engine: TypeScript Refactoring & SPP Protocol Integration Plan

> 状态：草案 (Draft)

本文档描述了将 `engine/src/septopus` 从 Vanilla JS 迁移到 TypeScript，并全面接入**弦粒子协议（String Particle Protocol, SPP）**的重构方案。

## 1. 重构目标

### 1.1 补充遗漏的 SPP 核心功能
当前引擎实现偏向于上层业务逻辑，缺少严格的 SPP 底层支持。我们需要补充：
- **二进制协议解码器**：支持解析 `03-string-particle-protocol.md` 定义的 44 字节 Header、4 字节 Cell 数据以及 RLE 压缩格式。
- **三层架构分离**：
  - **Layer 1 (全状态定义)**: 从 IPFS 加载并缓存模型、构型、材质定义。
  - **Layer 2 (塌陷状态)**: 链上二进制数据的大规模解析。
  - **Layer 3 (运行引擎)**: 根据 Layer 1 和 Layer 2 动态生成/展开 Three.js Mesh。

### 1.2 执行优化与工程化
- **类型安全 (Type Safety)**: 引入 TS 接口彻底消除 `vb.cache.get(["xx"])` 及硬编码索引带来的隐式错误风险。
- **性能优化 (Performance)**: 
  - 通过强类型的 `ParticleCell` 数据结构替代现有的松散对象组合。
  - 增强 RLE 解码后的内存复用（如：Three.js InstancedMesh 支持，降低 draw calls）。
- **模块解耦**: 当前 `framework.js` 承担了过多缓存和事件派发职能，需要拆分为独立的服务模块（如 `CacheManager`, `SpacialDecoder`, `RenderPipeline`）。

## 2. 目录结构与架构设计建议

重构后的引擎将从 `demo/src/septopus` 剥离，成为根目录下的一个**独立的 TypeScript NPM 包 (`engine`)**。这样其他项目（包括当前的 `demo` 目录）都可以通过依赖引入它。

```text
/engine/                     # [新增] 独立的 TypeScript 引擎包
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # 包出口，导出所有的类和类型
│   ├── core/
│   │   ├── types/               # SPP 协议的基础 TS 定义 (ParticleCell, SubdivisionLevel, 等)
│   │   ├── protocol/            # SPP 二进制解码器 (Raw & RLE 解码算法)
│   │   ├── EventBus.ts          # 强类型的事件总线
│   │   └── World.ts             # 核心世界容器，替代原 framework.js
│   ├── io/
│   │   ├── IpfsLoader.ts        # Layer 1: 获取 IPFS 上的 全状态定义
│   │   ├── ChainReader.ts       # Layer 2: 读取链上 塌陷状态 数据
│   │   └── CacheManager.ts      # 强类型的抽象缓存管理
│   ├── render/
│   │   ├── RenderPipeline.ts    # 负责调度生成
│   │   ├── MeshBuilder.ts       # Layer 3: 基于塌陷选择生成 Three.js Mesh
│   │   └── three/               # 封装 Three.js 细节
│   └── plugins/                 # 可插拔的各类 adjunct 组件
└── dist/                        # 编译后的产物
```

在原有的项目中调用方式：
```typescript
import { World, IpfsLoader, RenderPipeline } from "engine";
// ...
```

## 3. 具体实施路径

### 阶段一：基础设施与类型定义 (Phase 1: Typings)
1. 在 `core/types/` 中定义 SPP 协议的所有 Interface，例如：
   ```typescript
   export interface CollapseHeader {
       cid: Uint8Array;
       cellCount: number;
       encoding: 0 | 1; // 0=raw, 1=rle
       // ...
   }
   export interface ParticleCell {
       position: [number, number, number];
       level: SubdivisionLevel;
       faceOptions: number[]; // 各方向选择的构型索引
       triggerId: number;
   }
   ```
2. 初始化 TS 编译环境和 Linter，保证可以平滑将 `.js` 改写为 `.ts`。

### 阶段二：补充 SPP 编解码模块 (Phase 2: SPP Decoder)
1. 实现 `protocol/CollapseCodec.ts`：
   - 包含完整的 `encodeHeader`, `decodeHeader`, `decodeCell`。
   - 实现 RLE 游程编码的解析逻辑。

### 阶段三：重构核心数据流 (Phase 3: Core Pipeline)
1. **重构 `structSingle` 和 `structRenderData`**：
   - 将现有散落组装过程，替换为标准的：`获取 IPFS 定义 -> 解析链上二进制 -> 生成最终 ParticleCell[]`。
2. 引入 `InstancedMesh` 或合并 Geometry 机制，优化大规模相同构型（墙体、地板）的渲染性能。

### 阶段四：模块迁移与清理 (Phase 4: Migration)
1. 逐步替换 `framework.js` 中的功能为独立的 TS Class。
2. 将 `render_3d.js` 转换为 `RenderPipeline.ts`，彻底使用严格类型进行传参。
3. 删除原有未完全对齐 SPP 协议的冗余逻辑代码。

## 4. 结论与下一步

在开始逐行重构前，建议首先从**阶段一（定义协议接口）**和**阶段二（实现二进制解码器）**入手，由于这是最独立的部分，也是新旧架构切换的基石。
