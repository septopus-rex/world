# Septopus World — Desktop Client (`client/desktop`)

纯 3D 引擎的桌面客户端,用于**内容创建、调试与体验**。**不含链、不含钱包**——只依赖 `engine/`。

它替代了旧的 `app/`(旧版与 Solana 钱包/合约强耦合)。剥离记录与后续路线见 [`docs/plan/STANDALONE_ENGINE_ROADMAP.md`](../../docs/plan/STANDALONE_ENGINE_ROADMAP.md)。

## 技术栈(对齐 `qr/client` 的 PWA 模式)

- Vite 8 + React 19 + Tailwind 4(`@tailwindcss/vite`)
- `vite-plugin-pwa`(`registerType: 'prompt'`,workbox 预缓存 + 运行时缓存,离线优先)
- 构建期 `versionPlugin` 注入版本元信息 + 输出 `dist/version.json`
- `@engine` 别名指向 `../../engine/src`(TypeScript 引擎源码)

## 开发

```bash
cd client/desktop
npm install
npm run dev      # http://127.0.0.1:7777
npm run build    # 产物在 dist/(纯包,不含 @solana/*)
npm run preview
```

## 与链的边界

- **数据来源**:`src/lib/DesktopLoader.ts` 的 `fetchBlock()` 是唯一数据接缝,当前永远走引擎本地 mock(`@engine/core/mocks/BlockMocks`)。无网络、无钱包即可运行。
- **路线**:按 `STANDALONE_ENGINE_ROADMAP.md`,P1 将 `fetchBlock` 换成 IndexedDB 草稿支撑的 `LocalDataSource`(本地编辑可持久化 + 导出);"选中 block 上链"属于可选的链插件(`IChainPublisher`·P4),不进此客户端。
- 本客户端**不应**出现任何 `@solana/*` / `SeptopusContract` 依赖。

## 结构

```
client/desktop/
├── index.html              # 含启动屏 (#init-loader)
├── vite.config.ts          # PWA + version + @engine 别名
├── src/
│   ├── main.tsx            # 入口:ErrorBoundary + App + UpdateNotifier
│   ├── App.tsx             # HUD / 罗盘 / 遥测 / 小地图 / 摇杆 / 编辑开关
│   ├── Constants.ts        # 默认玩家状态 + localStorage key
│   ├── lib/
│   │   ├── DesktopLoader.ts  # 无链引擎装载器(SandboxLoader 的纯版)
│   │   ├── useEngine.ts      # 引擎启动 hook(无钱包)
│   │   └── useIsMobile.ts
│   └── components/
│       ├── HUD.tsx · Joystick.tsx
│       ├── ErrorBoundary.tsx
│       └── UpdateNotifier.tsx  # PWA 更新提示
└── public/                 # pwa 图标 + septopus.svg
```
