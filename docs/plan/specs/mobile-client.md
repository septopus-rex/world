# Mobile 客户端(第二壳)— M0–M3

> 状态:**v1 已实现(2026-07-08)**。M0 壳路由+核边界 ✅ · M1 移动壳+e2e ✅(摇杆走路/
> 真 TouchEvent 拖拽转视角(引擎原生通道)/JUMP/底部抽屉,`e2e/mobile.spec.ts` 触屏视口全绿)
> · M2 桌面 ActionRail 抽件 ✅(testid 原样,App.tsx 376→300 行,内嵌 isMobile 分支移除)
> · M3 底部抽屉(bag/map/avatar)✅ + pixelRatio 引擎已钳 1.5。
> 发现记录:引擎 InputProvider **本就内置触屏视角**(touchDeltaX/Y→CameraRig TOUCH_SENSITIVITY),
> 移动壳零引擎改动——「引擎用在不同 client 上」的第一次实证通过。动机:①「引擎用在不同 client 上」的**客户端层差分测试**
> (与 Rust 内核验数据完备同构——第二个壳当场逮住"其实是桌面假设"的泄漏);
> ②以抽核倒逼桌面 UI 重组。纯数据化(P2/P7)后内容全在数据树,移动端第一天就有完整世界。

## 架构:共享核 + 两个独立 app(v2,2026-07-08 按用户要求物理拆分)

```
engine/                  不动:渲染 DI + 输入 DI(InputProvider 已内置触屏视角)+ 事件
client/
├── core/src/            共享核(无 package.json,双端经 @core 源码别名引用,沿 @engine 先例):
│   ├── lib/               DesktopLoader(≈WorldClient)+ useEngine(viewmodel)+ live/
│   ├── components/        全部共享交互组件(对话/书/HP/背包/地图/游戏HUD/摇杆/换装/Toaster/ErrorBoundary)
│   ├── games/ scenes/     游戏胶水 + 常量清单/组合胶水
│   └── levels|blocks|worlds|stylepacks/  纯数据内容(两端同一个世界)
├── desktop/             桌面 app(7777,PWA):App + ActionRail/AuthorChat/HUD/UpdateNotifier(PWA 专属)+ stylepack-editor + 37 e2e
└── mobile/              移动 app(7778,独立 package.json/vite/tsconfig/playwright):
                           MobileApp(摇杆/JUMP/底部抽屉)+ 自己的 e2e(mobile.spec)
```

- **物理拆分的意义**:mobile 无法 import desktop 的任何文件(不在其编译面)——共享核边界由
  构建结构强制,而非纪律约定;desktop-only 依赖(如 PWA 的 `virtual:pwa-register`)被
  第二 app 的 tsc 当场逮出(UpdateNotifier 因此回迁 desktop)。
- **tailwind v4**:core 在两 app 根之外,各自 index.css 加 `@source "../../core/src"` 扫类。
- **跨包 react 类型**:core 文件从 app 的 node_modules 解析 react —— 两 app 的 tsconfig
  `paths` 显式映射 `react`/`react-dom`/`three` 到本地 @types(源码级共享的标准做法)。

## 输入映射(移动壳,全部走既有缝、零引擎改动)

| 手势 | 通道 |
|---|---|
| 左摇杆(虚拟) | `loader.setPlayerMoveIntent(x,y)`(相机系,与 e2e 同通道) |
| 画布拖拽 = 视角 | 引擎原生:InputProvider touch → CameraRig(TOUCH_SENSITIVITY) |
| 点按 = 交互 | 浏览器合成 click → 既有射线 interact 通道 |
| 跳跃按钮 | `engine.jump()` |

## 里程碑

- **M0 壳路由 + 核边界**:main.tsx 三态路由;确认 loader/useEngine 零壳假设(9 个 window
  触点均浏览器中立;B/N 键盘捷径在无键盘设备天然惰性)。零行为变化,桌面 e2e 兜底。
- **M1 移动壳跑通**:MobileApp(boot + ready 门)+ VirtualJoystick + 跳跃钮 + 触控 HUD 最小集
  (模式徽标/HP/背包/地图入口)。e2e:Playwright 触屏仿真(hasTouch + 移动视口)验 boot/摇杆移动/视角拖拽。
- **M2 桌面重组到核上**:App.tsx 的混杂 chrome 分组抽件(**data-testid 全部原样保留**,37 e2e 不动)。
- **M3 移动特化**:底部抽屉(背包/地图/设置)、性能预算(pixelRatio 钳制)、安装体验(PWA 已就绪)。

## 非目标(记录,防蔓延)
- 触屏编辑模式(palette 拖放)、Game 模式全套移动 HUD、手柄——后续按需。
- 真机手感调优(灵敏度/死区)留人工;e2e 只验通道正确性。
