# 外部服务与连接层

> **参考实现**（`docs/` 层）。规范在 `protocol/`：全链启动见 [boot-chain.md](../../protocol/cn/boot-chain.md) + [envelope.md](../../protocol/cn/envelope.md)，游戏会话与验证见 [game.md §9](../../protocol/cn/game.md)。
>
> 本文讲**世界之外的进程**：内容从哪来、游戏逻辑在谁家跑、客户端怎么连它们。
> 引擎本身不认识这里的任何一个服务——它只认 `IDataSource` / `IGameApi` / `ILiveSource`
> 这几道缝，服务是插在缝上的实现。

## 1. 拓扑与端口

`deploy/dev.sh` 的仪表盘统一起停下列进程：

| 端口 | 服务 | 职责 |
|---|---|---|
| 7777 | `client/desktop` | 桌面壳（vite） |
| 7778 | `client/mobile` | 移动壳（vite，独立 app） |
| 7784 | `services/holdem` | 德州扑克（Pattern A，id 44） |
| 7785 | `services/pool` | 台球 |
| 7786 | `services/board` | e5 留言板频道存取 |
| 7787 | `services/mahjong` | 麻将 |
| 7788 | `services/ai-gateway` | AI 造物 v1（生成器模板） |
| 7789 | `services/ipfs` | 内容网络 dev 网关（file-CAS）+ `/boot` 链上启动 |
| 7790 | `services/worldlabs` | AI 生成世界演示（Marble API 代理） |
| 7791 | `services/ai-builder` | AI 造物 v2 实验（直出 adjunct + 服务端碰撞校验） |

**新增服务时**：在 `deploy/dev.sh` 的 `FE_SERVICES` 加一行 `名字|路径|端口|命令`，
并在 `npm_deps`、参数 `case`、仪表盘 `printf` 三处各补一行。名字派生出两个键——
**匹配键**（小写去空格，`AI-Build` → `ai-build`，即 `bash deploy/dev.sh ai-build` 的单起参数）
和**日志名**（再去连字符 → `deploy/logs/aibuild.log`）。

`lan` 参数（`bash deploy/dev.sh lan`）把前端绑到 `0.0.0.0` 并打印内网 IP，供真机联调。

## 2. 两通道定式

外部服务与客户端之间只有两条通道，**按方向分工，不要混用**：

*   **HTTP = 请求/响应**（拉）—— 引擎侧的缝是 `IGameApi`。会话调用走这条。
*   **`ws /live` = 服务器推送**（订阅）—— 引擎侧的缝是 `ILiveSource`。会话事件走这条，
    是旁观/多人的前置设施。

游戏服务把两者开在**同一个端口**上。订阅协议与 `WebSocketLiveSource` 同线形。

`VITE_LIVE_WS` 决定客户端是否连真 WS；不开则用 `FakeWebSocket`，让 e2e 保持确定性。

## 3. 内容网络层（7789）

`services/ipfs` 是开发期的 file-CAS 网关，**CID 与引擎 `Cid.ts` 同源**——真 CIDv1
（raw + sha2-256，`bafk…`），与 multiformats 逐位一致，ipfs.io 实测可解析。启动时把
`client/core` 的内容与资产种进去。

客户端侧的取字节顺序（`HttpCasProvider` 静默探测后挂在 `world.ipfs` 的**最低优先级**）：

```
进程内 MemoryCas（一级缓存 / 离线兜底）
   ↓ 未命中
7789 dev 网关
   ↓ 可选
真公网网关（VITE_IPFS_GATEWAYS 挂的只读层，e2e ipfs-gateway.spec.ts）
```

**router 逐次重哈希校验**——不信任任何一层返回的字节，拿到就按 CID 重算。

### 全链启动

浏览器打开 `/boot?name=septopus` 即从链上启动完整 3D 世界（e2e `boot-chain-world.spec.ts`）：

```
比特币锚 {p,name,version,cid}   (dev 替身 = 网关的名字索引)
   → ROOT_CID `septopus.loader`  (mobile 壳单文件 IIFE 链包，npm run build:chain)
   → shim (/boot，零依赖、自带 CID 校验) 验封套 → 页面权限执行
   → 世界配置按锚定 CID 拉取，资产经网关 /assets CAS 通道
```

`deploy/publish-chain.sh` 一键发版，与主网只差"把锚发上比特币"这一步。

> **决策红线**：**一切动态加载（app / 内容 / adjunct 代码）都沿 boot-chain 的
> 「锚 → envelope → CID 递归」方式走。** 不要为某类资源另开一条加载路径。

## 4. 一游戏一服务（Pattern A）

每个 Pattern-A 游戏是**独立进程**——这是生产形态的镜像：各运营方在各自的服务器上跑自己的游戏。

*   共性托管在 `services/lib/game-host.ts`（139 行），于是每个游戏服务本体只有 **7–8 行**
    （holdem 8 行、mahjong 7 行、pool 7 行）。
*   同一份游戏引擎类按 `gameId` 做会话托管，线协议是 `FetchGameApi`。
*   **跨游戏调用物理 404**——隔离不是靠约定，是靠进程边界。e2e 有覆盖：各桌只拨各自的服务器。
*   客户端 `ProbedGameApi` 按 `game:<name>` 端点懒探测（`VITE_GAME_SERVER_<NAME>` 可覆盖），
    **在线走 HTTP、离线回退页面内 loopback，行为同源**——所以断网也能玩，只是没有权威。

真套接字集成测试 `net-ws-live.test.ts` 含 SIGKILL 重连重订阅，并逮出过一个运行时差异：
**Node/undici 拒连时只发 `error` 不发 `close`**，只监听 `close` 的重连逻辑会静默卡死。

## 5. 伴生服务

*   **`ai-gateway`（7788）** — AI 造物 v1：自然语言 → `GenerationDoc` → 预览 → 建造。
    mock/qwen 两 provider，校验不过就回炉。规格 [ai-authoring.md](../plan/specs/ai-authoring.md)。
*   **`ai-builder`（7791）** — AI 造物 v2 实验：直出 adjunct（而非套用生成器模板）
    + 服务端空间碰撞校验反馈环，与 v1 共用 `GenerationDoc` 契约和 `PROVIDER` 开关。
    规格 [ai-builder.md](../plan/specs/ai-builder.md)。**尚未接客户端**（`ServiceHub` 里
    还没有它的端点），目前只能直接打它的 HTTP 接口。
*   **`worldlabs`（7790）** — 画廊㉑的 AI 生成世界演示，薄网关代理 World Labs Marble World API
    （`POST /v0/generate` → job id，`GET /v0/jobs/:id` 轮询）。
    *   `WORLDLABS_PROVIDER=mock`（默认）离线瞬时、复用现有测试泼溅、免费；
        `real` + `WORLDLABS_API_KEY`（key 在 gitignored 的 `private.md`）打真 API——
        **约 5 分钟一次且耗真额度**，所以真档配额远低于 ai-gateway。
    *   **生成产出落地为数据**：服务端完成时把 splat 字节 `POST /v0/add` 摄入 7789 CAS
        （`IPFS_GATEWAY` 可覆盖；网关不在线则优雅退化为只回 URL），job 结果带回真 CID。
        客户端拿到 CID 就以 `<cid>.<ext>` 形放置 a4 module 实体，「保存到世界」走
        `saveBlockDraft`（编辑器同款咽喉）序列化进 draft，**重载后经 CAS 网关重建渲染**。
    *   e2e `worldlabs-panel.spec.ts` 全程 mock，**并带 provider 守卫**：7790 上若是 real 档
        遗留服务直接 skip——绝不在 e2e 里烧真额度。
*   **`board`（7786）** — e5 留言板的频道存取。内容 = 服务器可变共享状态，离线只读。
    与 game 同构：**块声明意图、宿主拨服务**。

## 6. 客户端连接层

`client/core/src/net/` 是单一模块，board / game / ipfs / ai 全部收编于此：

*   **`ServiceHub`**（`loader.net`）— 端点注册表 + 状态面 + `closeAll`。
*   **`HttpChannel`** — probe 缓存、超时、JSON/bytes 动词、状态事件。
*   **`ReconnectingSocket`** — WS 退避重连 + 心跳 + **重开后自动重订阅**（兼容 `WebSocketLike`）。
