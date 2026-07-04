# 快速开始 (Getting Started)

> 面向想要**运行世界**或**嵌入/自建客户端**的开发者。协议(数据格式)见
> [protocol/](../../protocol/README.md);本文对应参考实现(`engine/src`,TypeScript ECS)。

## 1. 跑起来(桌面 PWA 客户端)

```bash
bash deploy/dev.sh          # = cd client/desktop && npm install && npm run dev
# → http://127.0.0.1:7777
```

`client/desktop` 是参考宿主:React + Vite PWA,经 `@engine` 源码别名直接消费
`engine/src`。生产构建 `bash deploy/build.sh` → 静态 `dist/`(发版与在线部署见
[deploy/RELEASE.md](../../deploy/RELEASE.md))。

## 2. 引擎的最小嵌入

引擎入口是 `Engine` 门面(`engine/src/Engine.ts`)。宿主注入**服务**(数据源必选,
渲染器/持久化/执行器可选),然后引导世界:

```ts
import { Engine } from '@engine/Engine';

const engine = new Engine('container-dom-id', {
    api: myDataSource,          // IDataSource:世界配置 + 地块数据(必选)
    // renderer: 缺省创建 WebGL 渲染器;测试可注入 NullRenderEngine(无 GPU/DOM)
    // draftBackend / actuator / gameApi / liveSource:可选注入点
});

await engine.bootWorld(0);      // 拉取世界配置、创建 ECS 世界与玩家
await engine.hydrateDrafts(0);  // 还原本地草稿/背包/flags/位置(IndexedDB)
engine.injectBlock(...);        // 宿主按 block.need 事件喂块(见 DesktopLoader)
engine.start();                 // rAF 主循环;测试用 engine.step(1/60) 确定性步进
```

关键事实:

- **数据流**:`IDataSource` → 地块 raw(纯数据,见协议)→ ECS 实体 → 渲染。
  宿主监听 `engine.on('block.need', …)` 按需喂块——参考实现
  `client/desktop/src/lib/DesktopLoader.ts` 是完整样例(流式 5×5、草稿覆盖、
  关卡装载、AI 造物通道)。
- **确定性**:`engine.step(dt)` 固定步进 = headless 测试的地基
  (`engine/tests/` 全部无 GPU 运行)。
- **层边界**:Three.js 只允许出现在 `engine/src/render/`;`core/` 与
  `plugins/` 经 `renderEngine.*` 间接操作(CI 强制)。

## 3. 造内容(不写引擎代码)

世界内容全部是数据:地块 raw 五元组 + 18 种附属物行(槽位规范:
[protocol/cn/adjunct-types.md](../../protocol/cn/adjunct-types.md))。三条路:

1. **编辑器**:客户端 Edit 模式,palette 放置 + 表单调参,草稿自动持久化;
2. **关卡 JSON**:`AuthoredLevel` 文档(样例 `client/desktop/src/levels/*.level.json`
   ——跑酷/过山车/RPG 全是纯数据关卡),`?level=<名>` 装载;
3. **AI 造物**:聊天输入自然语言 → 生成文档 → 预览 → 建造
   (需启动 `services/ai-gateway`,见 [specs/ai-authoring.md](../plan/specs/ai-authoring.md))。

## 4. 深入

- 扩展新附属物类型:[creating-adjunct.md](creating-adjunct.md) + `engine/src/plugins/adjunct/`
- 玩法词汇(触发器/动作/条件):[protocol/cn/trigger.md](../../protocol/cn/trigger.md)
- 架构与系统:[../architecture/](../architecture/overview.md) · [../systems/](../systems/)
- 测试基建(重要:先读局限性):`engine/tests/README.md`
