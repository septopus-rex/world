# deploy

构建 / 运行 **纯 3D 桌面客户端**(`client/desktop`)。无链、无后端。

| 脚本 | 作用 |
|---|---|
| `bash deploy/dev.sh` | 起开发服务器 → `http://127.0.0.1:7777`(首次自动 `npm install`) |
| `bash deploy/build.sh` | 生产构建 → `client/desktop/dist`(静态 PWA,可托管到任意静态服务器 / OSS / CDN) |
| `bash deploy/build.sh --preview` | 构建后本地预览 |
| `git push origin vX.Y.Z` | **发版 + 上线**:GitHub Release(附 dist zip)+ GitHub Pages 部署(见 [`RELEASE.md`](RELEASE.md)) |

## 链相关部分去哪了?

旧的 `deploy/` 几乎全是链/基础设施编排:`solana-test-validator` + `anchor build/deploy` + IPFS daemon + 替换 `app/src/config.js`,服务于已废弃的 `app/`。

随着链从引擎中剥离(见 [`docs/plan/STANDALONE_ENGINE_ROADMAP.md`](../docs/plan/STANDALONE_ENGINE_ROADMAP.md)),这套链上开发环境已**原样归档到 `chain/deploy/`**(`chain/` 已不被 git 追踪,作为本地存档保留)。需要重新拉起链上栈时,从那里恢复:

```
chain/deploy/
├── dev.sh            # validator + anchor deploy + ipfs + 旧 app dev
├── setup.sh          # 装 Rust / Solana CLI / Anchor / Kubo(IPFS)
└── localhost/
    ├── config.js     # Solana 节点 URL + programId
    └── ipfs-init.sh  # IPFS 仓库初始化 + CORS
```

> 注:`chain/deploy/` 是原 repo-root `deploy/` 的快照,脚本里的 `$ROOT/chain`、`$ROOT/app` 路径假设从仓库根运行。
