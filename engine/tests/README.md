# engine/tests — 引擎测试系统

确认 3D 引擎"执行正确"的测试。**核心思路**:引擎的逻辑与渲染在导入层面干净分离(`engine/src/core` 零 `three` 导入,Three.js 只在 `engine/src/render`),所以绝大部分正确性在 Node 里 headless 验证,不开浏览器/GPU。真正需要 WebGL 的薄薄一层(像素/raycast/输入/DOM UI)在 `client/desktop/e2e`(Playwright,已搭,34 个 spec)。

> 截至 **2026-07-02**,全套 `yarn test:run`:**428 passed | 2 skipped**,共 **70 个测试文件**。

## 怎么跑

```bash
cd engine
yarn install         # engine 用 yarn(有 yarn.lock)
yarn test            # watch 模式
yarn test:run        # 跑一次

cd client/desktop
npm run test:e2e     # L4 Playwright e2e(client/desktop 用 npm;SwiftShader 软渲染 + engine.step(dt) 确定性驱动)
```

包管理器按 package 分:**engine 用 yarn,client/desktop 用 npm**,各自目录下独立跑。

## 目录结构(测试金字塔,共 70 个 `*.test.ts`)

```
engine/tests/
├── unit/         # L1 纯函数/单类,无 World(34 个文件)
│   #   协议与数据:collapse-codec · coords · spp-expander · block-raw · block-cas · local-data-source · ipfs
│   #   adjunct:adjunct-registry/-transforms/-sandbox/-link/-track/-edit-forms · dynamic-adjunct · coaster-expand · motif
│   #   资源与渲染构造:resource-manager(+audio/+revoke) · model-loader · mesh-factory-tube · texture-scale · render-dispose-guard
│   #   基础设施:events/event-queue(帧作用域双缓冲队列)· errors · scheduler(F1 定时器)· trigger-jsonlogic · set-by-path · finite-gate · world-housekeeping
├── systems/      # L2 系统级:真系统对着 make-world/fake-world tick(19 个文件)
│   #   物理与交互:trigger-pipeline · pickup-chain · inventory-items · edit-transform · editor-platform
│   #   模式与玩法:game-zone-entry · game-runtime(Pattern A)· observe-mode · tumble(rapier 刚体)
│   #   F 系列:scheduler-spawn(F1 b9)· npc-agents(F2 ba)· combat-dialogue(F3+F4)
│   #   其他:animation-protocol · spp-pipeline · spp-editor · weather-lightning · engine-features · error-reporting
│   #   physics.test.ts 仍是 todo 占位(见下)
├── integration/  # L3 真 World + NullRenderEngine headless boot(14 个文件)
│   #   headless-boot · draft-store(fake-indexeddb 持久化 round-trip)· block-eviction · frame-split
│   #   live-pipeline · module-load · texture-load · media-adjuncts · stop-collider · avatar-and-view
│   #   environment-clock · Pattern B 游戏全流程:pool · mahjong · shooting
├── scenarios/    # L4- 场景回放:输入序列 → 期望状态(3 个文件)
│   #   coaster-ride · parkour-level(真实测试:加载 fixtures/levels/*.level.json 逐帧 step 跑完全程)
│   #   scenarios.test.ts(*.scenario.ts 自动发现 runner)仍是 todo,_runner.ts 未接通
├── fixtures/     # region.json · region-module.json · levels/{coaster,parkour}.level.json · spp/mock_spp_chunk.bin
└── helpers/      # fake-world(L2 最小内存 world)· make-world(L3 真 World 工厂)· null-render-engine · fake-resources
```

## todo / skip 现状

全套只剩 **3 个 `describe.todo`**(占位不报红)和 **2 个条件 skip**:

| 位置 | 类型 | 说明 |
|---|---|---|
| `systems/physics.test.ts` | `describe.todo` ×2 | PhysicsSystem 重力积分、TriggerSystem enter/exit 的直连单测;实际覆盖已由 `trigger-pipeline`/`headless-boot` 等间接给到,占位待填或删 |
| `scenarios/scenarios.test.ts` | `describe.todo` ×1 | `*.scenario.ts` 自动发现 runner 未接通(其注释里"blocked on renderer DI + fixed-dt"的前置早已完成,todo 本身待处理);`coaster-ride`/`parkour-level` 是不走 runner 的真实场景测试 |
| `systems/weather-lightning.test.ts` | `it.skipIf(EnvironmentSystem.FLAT_LIGHTING)` ×2 | 闪电的环境光尖峰断言,在平光模式下无意义,条件跳过——即统计里的 2 skipped |

---

## ⚠️ 局限性(务必先读)

1. **无浏览器/GPU**:unit/systems/integration/scenarios 都在 Node 里跑(`vitest.config.ts` `environment: 'node'`),**没有 WebGL**。渲染像素正确性、对渲染场景的 raycast、pointer-lock 输入、resize/DPR、DOM UI——只能靠 `client/desktop/e2e` 的 Playwright,本目录测不了。
   - 例外:`MeshFactory.create` 造几何/材质(`geometry.parameters`、`material.color`)在纯 Node 能跑——**网格"构造"正确性算 headless,只有真正的 WebGL"绘制"不行**。

2. **确定性:固定 dt 已落地,但摩擦对帧率敏感**。`Engine.step(dt)` / `World.step(dt)` 确定性逐帧已可用,场景回放测试(coaster-ride/parkour-level)即基于此。但玩家物理的摩擦衰减仍是**每帧乘法**(`PhysicsSystem.ts:172` 与 `MovementCollider.ts:154` 的 `body.velocity *= body.friction`,未做 `pow(friction, dt*60)` 归一;对比 `PoolSystem` 已按秒归一)——**测试必须钉死 dt(惯例 1/60)**,换步长轨迹就变;这是"结果随 dt 变"的已知行为,不是待修 bug 断言。

3. **CollapseCodec 无 `encodePayload`**:整 buffer 只能"字节 fixture 进 / cells 出"地测(`decodePayload`),只有 header/cell 粒度能 encode→decode 往返。且**编解码无输入校验**:face 索引 >15 会截断、cellCount 溢出 16 位——当成"已知行为"钉死,别假设它会报错。

4. **Coords**:`engineToSpp` 用 `Math.floor`,往返恒等只在块内 `[0, BLOCK_SIZE)` 成立;边界/负坐标是刻意的边界 fixture,不是 bug。`Coords.BLOCK_SIZE` 是可变静态,**测试必须在 setup 里 pin**,否则会耦合全局初始化顺序。

5. **TriggerSystem 不发"已触发"事件**:没有 `trigger.fired` emit;动作经 `world.actuator` 执行。"断言触发器触发了"只能读组件状态或注入 fake actuator 观察副作用,不能监听事件。

6. **旧引擎不在范围**:旧 JS 引擎已归档在 `engine/backup/`(gitignore),已退役,不要为它写测试。

7. **暂无 CI**:仓库无 `.github/workflows`。测试全绿但没有流水线拦截,回归要靠手动跑 `yarn test:run`。

## 栈

vitest ^3(runner,node 环境)· fake-indexeddb(`integration/draft-store.test.ts` 持久化 round-trip)· NullRenderEngine(手搓渲染替身,`helpers/null-render-engine.ts`)· fake-world / make-world(L2/L3 世界工厂)· Playwright(仅 L4,在 `client/desktop/e2e`)。
