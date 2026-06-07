# client/desktop/e2e — 浏览器端到端 / 视觉测试(Playwright)

L4:**真 WebGL** 才能验证的那 ~30%——渲染、相机/视角、locomotion、控制台报错。用 **Playwright(真 Chromium + SwiftShader 软件 WebGL)**,自动起 Vite dev server。

## 跑

```bash
cd client/desktop
npm install
npx playwright install chromium   # 首次:装浏览器二进制
npm run test:e2e                  # 跑全部
npm run test:e2e:ui               # 交互式 UI
```

`playwright.config.ts` 会自动 `npm run dev`(127.0.0.1:7777),headless Chromium 用 SwiftShader 渲染。

## 用例

- `boot-and-render.spec.ts` — 启动后世界渲染:`#three_demo canvas` 可见且有尺寸、截图(`e2e/__screenshots__/boot.png`)、无硬控制台报错。
- `player-movement.spec.ts` — **自动移动 / 转视角**:
  - locomotion:`window.loader.setPlayerMoveIntent(0,1)` 前进 → 断言玩家位置变化(input-independent,最稳);
  - 视角:合成鼠标拖拽 → 断言 `getPlayerRotationY()` 改变。
- `helpers.ts` — `waitForWorldReady`(等 `loader.getLoadedBlockCount()>0`)、`playerPosition`(读 ECS live transform)。

## 驱动引擎的钩子

客户端把 loader 挂在 `window.loader`(见 `useEngine.ts`),可在测试里直接调:
`setPlayerMoveIntent(x,y)` · `triggerPlayerJump()` · `getPlayerRotationY()` · `getLoadedBlockCount()` · `engine.getWorld()`。

## 局限

- 像素 diff(`toHaveScreenshot`)跨 GPU/驱动易抖;只挑 3–5 个固定场景、跑在固定容器/CI 镜像,当集成护栏,主 correctness 信号靠 `engine/tests` 的 L1–L3。
- 默认 mock 数据(`engine/src/core/mocks`)若只含 box,wall/cone/ball 的接线在视觉上看不到——要视觉验证新 adjunct,需往 mock 塞这几种或注入测试块。
