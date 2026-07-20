# 2D 页面栈 · Page stack

3D 世界是应用本体，**盖在它上面的每一个 2D 界面都是这个栈上的一页**：地图、地块详情、配置、确认框。
两端共用（desktop 7777 / mobile 7778），一页写一次。

```
用户点「🗺️」        pages.push(mapPage(loader))          depth 1
用户点一个地块       pages.push(blockDetailPage(…))       depth 2   ← 地图仍挂载在下面
用户点「原始数据」   pages.push(blockRawPage(…))          depth 3
用户点「‹」          pages.pop()                          depth 2
用户点「✕」/点遮罩   pages.close()                        depth 0
```

## 用法

宿主（每个 shell 一次，已接好）：

```tsx
export default function AppRoot() {
  return <PageProvider>          {/* 只提供 context，不产生 DOM */}
    <App />                      {/* 内部某处放 <PageHost />，决定 surface 落在哪一层 */}
  </PageProvider>;
}
```

定义一页——**导出一个返回 `PageSpec` 的工厂**，而不是导出组件让调用方拼装。
谁打开它（桌面按钮、移动罗盘、世界里的交互）就不必知道它长什么样：

```tsx
export function mapPage(loader: DesktopLoader | null): PageSpec {
    return { id: 'map2d', title: '2D 地图 · World Map', size: 'half', padded: false,
             content: <WorldMap2D loader={loader} /> };
}

// 调用侧
const pages = usePages();
<button onClick={() => pages.push(mapPage(loader))}>🗺️</button>
```

确认框（**替代 `window.confirm`**——原生对话框是 CLAUDE.md 红线，还会卡住 rAF 循环且 e2e 驱动不了）：

```tsx
const ok = await pages.confirm({ title: '重置本地存档', message: '…', confirmLabel: '重置', danger: true });
if (ok) loader?.resetWorld();
```

## 规矩

- **`content` 是 push 那一刻的快照**，不会因为调用方 state 变化而重渲染。页面自己持有活状态（自己的 hook / 订阅 loader）——这正是页面能被任意入口打开的原因。
- **形态由栈底页决定**（`variant`/`size`）。push 子页是在同一个 surface 里往里走（iOS 式：出现「‹」、容器不变形），不是开第二个窗口。子页的 `variant`/`size` 会被忽略。
- **`variant: 'auto'`（默认）**：宽视口（≥768px）居中卡片，窄视口底部抽屉。
- **画布类页面必须用固定高度档**（`size: 'half' | 'tall'`）。`'auto'` 是让 surface 贴合内容高度，而 canvas 没有内在高度可贴合。
- **`padded` 换的是布局模式不只是内边距**：默认 = 有内边距的块级滚动容器（普通内容）；`false` = 满幅 flex 列、不滚动，内容用 `flex-1` 自己占满（画布页要这个——canvas 是绝对定位的，块级容器里外层没有高度来源，会塌成 0）。
- **被埋的页保持挂载**（`visibility:hidden`），DOM、React state、布局盒子全部保留——返回时地图还是原来的平移/缩放/已流式的格子，不重新拉取。代价是：**跑循环的页面要用 `usePageActive()` 自己 idle**（地图就是这么做的）。
- **`id` 是身份**：e2e 句柄（`data-testid="page-<id>"`）、React key、以及重复 push 的去重键（连点两下入口按钮不会叠两层）。带坐标的页面把坐标编进 id（`block-2048-2048`）。
- **`onDismiss` 在这一页以任何方式离开栈时触发**（返回 / ✕ / 遮罩 / Esc / `close()`），是「详情页关掉时清掉地图上的选中框」这类收尾的唯一挂点。

## 手势契约

| 动作 | 结果 |
|---|---|
| `‹` | `pop()` — 回上一页 |
| `✕` | `close()` — 整栈关闭，回到 3D 世界 |
| 点遮罩 | `close()` |
| Esc | `pop()` |

`dismissable: false` 让遮罩与 Esc 都不生效（必须作答的页）。

## e2e 句柄

`page-host`（带 `data-depth`）· `page-surface`（带 `data-variant` / `data-settled`）· `page-<id>`（带 `data-active`）· `page-title` · `page-back` · `page-close` · `page-confirm-ok` / `page-confirm-cancel`。

**通用句柄只挂在当前页上**（`page-back` / `page-close` / `page-title`）：被埋的页 DOM 还在，否则一个 `[data-testid="page-back"]` 会匹配到每一层，全局定位必撞 strict mode。元素本身保留、只摘句柄，是为了埋着和激活时 header 高度一致（画布页返回时不能跳尺寸）。

**测量 surface 前先等 `[data-testid="page-surface"][data-settled="1"]`**：入场动画期间量到的是移动中的目标。`settled` 以 `animationend` 为主信号、超时为兜底——光用定时器等于假设动画准时开始，机器一忙就不准（`helpers.ts` 记着同一个坑）。

## 键盘

栈非空时，`window` capture 阶段吞掉非输入框的按键，引擎（`InputProvider` 挂在 `document` 上）因此收不到 WASD——不会出现「开着地图，角色在背后走」。输入框/textarea 豁免，否则页面自己的输入也会被切断。
