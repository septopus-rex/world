# 发版指南(GitHub Releases)

> 适用仓库:`septopus-rex/world`。发版 = **打 tag**,其余全自动:
> `.github/workflows/release.yml` 在 `vX.Y.Z` tag 推送时校验 → 构建 → 创建
> GitHub Release(说明取自 `CHANGELOG.md` 对应段落)→ 附上客户端 PWA 构建包;
> 同 tag 并行触发 `deploy-pages.yml` 把该版本部署到 GitHub Pages(见 §5)。

## 1. 版本方案

- **全仓一个版本号**(SemVer)。engine 与 client 经源码别名(`@engine`)同仓同版,
  不允许漂移;`client/desktop/package.json` 与 `engine/package.json` 的 `version`
  **必须一致且等于 tag**(workflow 有 lockstep 守卫,不一致直接拒绝发版)。
- **pre-1.0 语义**(当前 0.x):
  - **minor(0.X.0)**:功能批次——新 adjunct、新系统、新玩法能力、协议扩展;
  - **patch(0.x.Y)**:修复与文档,无新能力;
  - **1.0.0**:协议冻结时再说(SPP 二进制 + 链发布通道稳定后)。
- tag 格式:`v0.1.0`(带 `v` 前缀,workflow 按 `v*.*.*` 触发)。

## 2. 功能追踪(版本 ↔ 功能的对照能力)

三层记录,各司其职:

| 层 | 载体 | 说明 |
|---|---|---|
| 提交粒度 | **conventional commits** | 仓库已有习惯:`feat(scope):` / `fix(scope):` / `docs(scope):`——这是 changelog 的原料,**保持住** |
| 版本粒度 | **`CHANGELOG.md`**(根目录) | 每个版本一节(`## [X.Y.Z] - 日期`),按 引擎/玩法/内容/工程 分组;深度设计**链接到 `docs/plan/specs/*.md`**(spec 文档本身带"已实现"状态注记,双向可查) |
| 运行时 | **版本注入** | `package.json` 版本经 vite 注入:HUD 左上角标 `v0.1.0`(hover 显 commit,testid `app-version`)、`<meta name="app-version">`、`dist/version.json`(部署侧核对用,随 Release 附件发布) |

用户报障时:看 HUD 角标或 `curl <部署地址>/version.json` → 对照 CHANGELOG 与 tag,
即可锁定该版本包含哪些功能与修复。

## 3. 发版步骤(检查单)

```bash
# 0) 全绿前置(本地或看 CI):
cd engine && yarn test:run && yarn build          # 引擎全量 + tsc
grep -r "from 'three'" engine/src/core engine/src/plugins | wc -l   # 必须 0
cd client/desktop && npm run build                # 客户端构建

# 1) 定版本号(minor 或 patch,见 §1),两处 package.json 同步:
#    client/desktop/package.json + engine/package.json 的 "version"

# 2) 补 CHANGELOG.md:
#    - 把 [Unreleased] 下的内容整理进新的 "## [X.Y.Z] - YYYY-MM-DD" 段
#      (原料:git log --pretty='- %s' v上个版本..HEAD,按 feat/fix/docs 分组)
#    - 底部补 compare/tag 链接,保留空的 [Unreleased] 段

# 3) 提交 + 打 tag + 推送(tag 推送即触发发版):
git add -A && git commit -m "release: vX.Y.Z"
git tag -a vX.Y.Z -m "Septopus World vX.Y.Z"
git push origin main vX.Y.Z
```

推送 tag 后,`release.yml` 自动完成:

1. **校验**:引擎全量测试 + tsc + Three.js 层边界 + 客户端构建(与 CI push 同门);
2. **锁步守卫**:两个 package.json 的 version ≠ tag → 发版失败(先补 bump 再重打 tag);
3. **打包**:`septopus-world-client-vX.Y.Z.zip`(PWA dist,任意静态服务器可部署)
   + `septopus-world-version-vX.Y.Z.json`(构建指纹);
4. **建 Release**:说明自动截取 `CHANGELOG.md` 中 `## [X.Y.Z]` 段;若忘了写该段,
   兜底生成"上个 tag 以来的提交清单"并在开头注明。

## 4. 修补发布(hotfix)

主干直接修(本仓习惯,无长期分支):

```bash
# 修复 → 测试绿 → bump PATCH(两处 package.json)→ CHANGELOG 补一节 → commit
git tag -a v0.1.1 -m "Septopus World v0.1.1" && git push origin main v0.1.1
```

若未来需要在旧 minor 上热修(main 已有新功能不想带出),从旧 tag 拉临时分支
`hotfix/v0.1.x`,修完打 tag,tag 触发的 workflow 与分支无关,照常发版。

## 5. 在线部署(GitHub Pages)

打 tag 除了发 Release,还会**同 tag 触发 `.github/workflows/deploy-pages.yml`**,
把该版本的 PWA 部署到 GitHub Pages——发版即上线:

- **地址**:`https://septopus-rex.github.io/world/`(构建时 `VITE_BASE=/world/`,
  资产与 PWA scope 都按子路径解析;demo 资源目录经 `BASE_URL` 前缀,勿在内容里
  写死 `/assets/...` 绝对路径——**写死了本地一切正常、只在子路径部署下 404**,
  照 `demoScene` 的 `asset()` 写法办)。
- **一次性仓库设置**:GitHub → Settings → Pages → **Source = GitHub Actions**
  (不设置则 deploy 任务失败)。
- **重新部署**(不发新版):Actions → Deploy Pages → Run workflow(dispatch 会
  按当前 main 构建;要按某 tag 重部署,dispatch 时选择该 tag 的 ref)。
- **自定义域**(如 `world.septopus.xyz` 指向 Pages):Settings → Pages 绑定域名
  (自动生成 CNAME),同时把 deploy-pages.yml 里的 `VITE_BASE` 改回 `/`
  ——根域部署不需要子路径前缀。
- **AI 造物在线上的表现**:Pages 是纯静态托管,没有 ai-gateway;聊天面板按设计
  **优雅降级**(网关不可达即不可用,引擎/世界照常)。要在线上开 AI 造物,需另行
  部署 `services/ai-gateway` 并设 `VITE_AI_GATEWAY` 构建变量。

## 6. 常见问题

- **tag 打错/发版失败想重来**:`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
  删除本地与远端 tag(若 Release 已创建,先在 GitHub 上删 Release),修复后重打。
- **只想验证 workflow 不发正式版**:打 `v0.0.X-rc.N` 形式的 tag?——不行,触发规则是
  `v*.*.*`(会匹配)。预发布请在 `gh release create` 后手动勾 pre-release,或直接
  用本地 `npm run build` 验证产物;workflow 本身与 CI push 门等价,常规情况无需试跑。
- **发版和 CI 的关系**:release.yml 独立于 ci.yml(tag 推送不触发 ci.yml 的 push 事件
  ——其 push 触发限定 `branches: [main]`),校验步骤刻意重复一遍以自包含。
- **ai-gateway 的版本**:`services/ai-gateway` 是独立部署的旁路服务,版本自理
  (其 package.json 不参与 lockstep 守卫);需要跟随发版时在 CHANGELOG 里注明即可。
