# client/desktop/e2e — 浏览器端到端 / 视觉测试(占位)

L4:**真 WebGL** 才能验证的那 ~30%——渲染像素、对渲染场景的 raycast、pointer-lock + WASD 输入、resize/DPR。用 **Playwright(真 Chromium = 真 WebGL)**。

未搭建。落地时:
- 加 devDep `@playwright/test`,`playwright.config.ts`(指向 `npm run preview` 或 dev server `127.0.0.1:7777`);
- 用固定种子场景 + 截图 pixel-diff(`toHaveScreenshot`)钉 3–5 个标准场景;
- 一个 pointer-lock + 前进的冒烟、一个点击 adjunct 的 raycast 选中校验。

> 像素 diff 跨 GPU/驱动易抖:场景要少、固定时钟(等固定 dt 落地)、跑在固定容器/CI 镜像里,只当集成护栏,主correctness 信号靠 `engine/tests` 的 L1–L3。
