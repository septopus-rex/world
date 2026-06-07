# engine/tests — 引擎测试系统

确认 3D 引擎"执行正确"的测试。**核心思路**:引擎的逻辑与渲染在导入层面已干净分离(`engine/src/core` 零 `three` 导入,4 个 `three` 导入全在 `engine/src/render`),所以约 **60–70% 的正确性可以在 Node 里 headless 验证,不开浏览器/GPU**。真正需要 WebGL 的薄薄一层(像素/raycast/输入)留给 `client/desktop/e2e`(Playwright)。

> 测试策略与可测性审计依据见 [`docs/plan/STANDALONE_ENGINE_ROADMAP.md`](../../docs/plan/STANDALONE_ENGINE_ROADMAP.md)。

## 怎么跑

```bash
cd engine
yarn install         # 首次:装 vitest(engine 用 yarn,与其 yarn.lock 一致)
yarn test            # watch 模式
yarn test:run        # 跑一次(CI 用)
```

各 package 独立跑(与 qr/runner/solo 一致,无 root workspace)。注意包管理器按 package:**engine 用 yarn**(有 `yarn.lock`),`client/desktop` 用 npm(有 `package-lock.json`),其单元/E2E 在自己目录下跑。

## 目录结构(测试金字塔)

```
engine/tests/
├── unit/         # L1 纯函数(无 DOM/GPU)——【已可跑】
│   ├── collapse-codec.test.ts   # SPP 二进制编解码(回报最高)
│   └── coords.test.ts           # 坐标系转换
├── systems/      # L2 无渲染系统 tick(对着 fake world)——【可填,今天就能写】
│   └── physics.test.ts          # 目前是 todo + 可照抄的示例
├── integration/  # L3 World boot + 事件 + 持久化 ——【部分待前置重构 / 待 P1】
│   └── draft-store.test.ts      # todo:P1 IndexedDB + ExportService
├── scenarios/    # ★ 显式样例:输入序列 → 期望状态(数据驱动)——【待前置重构】
│   ├── _runner.ts               # defineScenario / runScenario(类型已定,实现待接通)
│   ├── walk-forward.scenario.ts # 一个声明式用例
│   └── scenarios.test.ts        # todo:接通后自动发现并运行全部 *.scenario.ts
├── fixtures/     # 字节/世界/区块 fixture + golden 快照
│   └── spp/mock_spp_chunk.bin
└── helpers/      # 测试替身与工厂
    ├── fake-world.ts            # L2 用的最小内存 world
    ├── null-render-engine.ts    # L3 用的空渲染器(待 IRenderEngine 抽出)
    └── make-world.ts            # L3 用的真 World 工厂(待前置重构)
```

## 状态:哪些已能跑,哪些是 todo

| 层 | 内容 | 状态 |
|---|---|---|
| **L1 unit** | `collapse-codec`、`coords` | ✅ **已可跑通**,零重构 |
| **L2 systems** | 6 个无渲染系统(Physics/Trigger/Grid/Animation/Inventory/ItemDrop) | 🟡 可填(`fake-world` 已就绪),目前 `todo` |
| **L3 headless boot** | 真 World 注入 `NullRenderEngine` headless 启动 + `step(dt)` | ✅ **已可跑通**(`integration/headless-boot.test.ts`) |
| **L3 P1 持久化** | IndexedDB DraftStore / ExportService round-trip | 🔴 `todo`,待 P1(fake-indexeddb) |
| **scenarios** | 行为回放(输入序列→状态) | 🟡 **前置重构已完成,可填**(`make-world` 已就绪,需补 fixture 加载 + 输入脚本化) |
| **L4 e2e(Playwright)** | 真 WebGL 像素/输入/raycast | ⬜ 在 `client/desktop/e2e`,未搭 |

`todo` 用 `describe.todo`,**不会报红**——它们是占位 + 待办清单,`npm test` 全绿。

## 显式写测试样例(scenarios)

一个行为用例就是一份声明式数据,新增用例 = 加一个 `*.scenario.ts`,零样板:

```ts
import { defineScenario } from './_runner';
export default defineScenario({
  name: 'walk forward 1s -> player moves north',
  world:  { blocks: ['flat@2048,2048'] },
  player: { block: [2048, 2048], position: [8, 8, 1] },
  steps:  [{ ticks: 60, input: { forward: true } }],   // 60 tick × 1/60s = 1s
  expect: (w) => { if (!(w.player.position[1] > 8)) throw new Error('did not move north'); },
});
```

`_runner.ts` 接通后会:用 `make-world` 建 **真 World + NullRenderEngine + 固定 dt + 脚本化输入**,加载 fixtures,逐帧 `world.step(1/60)` 跑完 `steps`,再调 `expect`。同理可做 golden 快照:`expect(serialize(world)).toMatchSnapshot()`。

---

## ⚠️ 局限性(务必先读)

1. **无浏览器/GPU**:unit/system/integration 都在 Node 里跑,**没有 WebGL**。已实测 `new THREE.WebGLRenderer()` 在 Node 抛 `document is not defined`,jsdom/happy-dom 也不提供 WebGL 上下文。所以**渲染像素正确性、对渲染场景的 raycast、pointer-lock 输入、resize/DPR、DOM UI**——这约 30% 只能靠 Playwright(L4),本目录测不了。
   - 例外:`MeshFactory.create` 造几何/材质(`geometry.parameters`、`material.color`)已实测在纯 Node 能跑——**网格"构造"正确性算 headless,只有真正的 WebGL"绘制"不行**。

2. **两个前置重构 ✅ 已完成**(headless boot 已跑通):
   - **渲染器可注入**:`World(config, { renderEngine })` / `Engine` 的 `services.renderer` 可注入,默认仍构造真实 WebGL `RenderEngine`;测试注入 `NullRenderEngine`。`InputProvider.bindEvents` 也加了 headless 守卫。(注:采用**依赖注入**而非正式抽 `IRenderEngine` 接口——后者 ~40 方法且要伪造 THREE 类型,留作后续打磨;现以 `as unknown as RenderEngine` 注入 stub。)
   - **循环脱 rAF + 固定 dt**:`World` 构造不再自动 `start()`;新增 `World.step(dt)` / `Engine.step(dt)` 供确定性逐帧;`resize` 监听加 `window` 守卫。生产端 `client` 本就显式调 `engine.start()`,不受影响(还顺带修掉"循环在注入 block 前就跑"的隐患)。
   - **仍待补**:`scenarios` 的 fixture 加载 + 输入脚本化(可经 `engine.setMoveIntent` + `step` 驱动);确定性回放还需注意下面第 3 条的摩擦 dt 归一化。

3. **确定性未保证**:同样输入当前会漂移(可变 dt + `PhysicsSystem` 帧率相关的摩擦衰减)。回放/快照测试要等固定 dt 落地;摩擦也建议 dt 归一化(`pow(friction, dt*60)`)。

4. **CollapseCodec 无 `encodePayload`**:整 buffer 只能"字节 fixture 进 / cells 出"地测(`decodePayload`),只有 header/cell 粒度能 encode→decode 往返。且**编解码无输入校验**:face 索引 >15 会截断、cellCount 溢出 16 位——这些当成"已知行为"钉死,别假设它会报错。

5. **Coords**:`engineToSpp` 用 `Math.floor`,往返恒等只在块内 `[0, BLOCK_SIZE)` 成立;边界/负坐标是刻意的边界 fixture,不是 bug。`Coords.BLOCK_SIZE` 是可变静态(构造时从 config 设),**测试必须在 setup 里 pin**,否则会耦合全局初始化顺序。

6. **TriggerSystem 不发"已触发"事件**:它只改 `AdjunctComponent.stdData` 或 console.log。在加 `trigger:fired` emit(可与 P2 的 `IActuator` 一起做)之前,"断言触发器触发了"只能读组件状态,不能监听事件。

7. **旧引擎不在范围**:`engine/src/septopus/**/*.js` 是 JS→TS 迁移前的旧引擎,已被 tsconfig 排除,不要为它写测试。

8. **暂无 CI**:仓库无 `.github/workflows`。加了 runner 还不够——要等一个跑 `vitest run` 的流水线,测试才会真正拦回归。

## 栈

vitest(runner)· fake-indexeddb(P1 持久化,待加)· happy-dom(少数要 DOM 的)· NullRenderEngine(手搓替身)· Playwright(仅 L4,在 client/desktop/e2e)。chain 的 anchor/mocha 套件保持不动。
