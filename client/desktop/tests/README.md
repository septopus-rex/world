# client/desktop/tests — 客户端单元测试(占位)

放 `client/desktop` 自身的单元测试(非引擎):`DesktopLoader`、`ExportService`(P1 导出/导入)、UI 逻辑等。需要 DOM 的用 `happy-dom` 环境。

未搭建。落地时:
- `client/desktop/package.json` 加 `vitest` + `"test": "vitest"`;
- 加 `client/desktop/vite.config.ts` 已有,补一段 `test:{ environment: 'happy-dom', include: ['tests/**/*.test.ts'] }`(或单独 `vitest.config.ts`);
- 引擎本身的执行测试在 `engine/tests/`(见那里的 README)。

P1 的 `ExportService` JSON round-trip、`DraftStore`(`fake-indexeddb`)既可放这里也可放 `engine/tests/integration`,取决于实现落在哪个 package。
