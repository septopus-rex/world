# Adjunct 从 IPFS 加载执行 — 评估

> 状态:评估文档(2026-07-08;分发通道已由 boot-chain 落地,见 §3.1 对齐注)。回答「如何把 adjunct 也改成从 IPFS
> 加载来执行」。结论先行:**管道四分之三是现成的,缺的是"数据里怎么声明代码"这一块
> 词汇 + 把 loader 的取数通道并到 IpfsRouter**;真正要认真对待的是安全边界与
> 决定性钉点,以及"代码不可跨引擎"的架构定位。
> 关联:`full-data-migration.md`(F 缺口/AC 验收)· `bevy-reference-engine.md`(跨引擎)。

## 0. 先分清两件事

「adjunct 从 IPFS 加载」有两个完全不同的含义,现状也完全不同:

| | 含义 | 现状 |
|---|---|---|
| **数据面** | adjunct 的 **raw 行**(墙的位置/触发器的事件)从 IPFS 来 | **已完成**:块数据 CID 寻址(BlockCas)+ services/ipfs 网关 + 真 CIDv1。不在本文范围 |
| **代码面** | adjunct 的**类型定义/行为代码**(19 个内置之外的新类型)从 IPFS 来并执行 | **本文主题**。部件齐全但未串起来 |

## 1. 现状盘点(部件已有多少)

```
块行 [0xf001, rows]          ← 块数据引用自定义 typeId(dynamic.block.json 实例:61441)
        │
        ▼ 需要该 typeId 已注册,否则行被跳过
AdjunctRegistry.registerDynamicAdjunct(typeId, definition)     ✅ 已有
        ▲
descriptorToDefinition(descriptor)                              ✅ 已有(声明式→definition)
        ▲
AdjunctSandbox(Web Worker + 静态过滤 + 5s 超时 + 崩溃自愈)      ✅ 已有,validateCode 可单测
        ▲
AdjunctLoader.loadFromIPFS(cid) / loadFromCode(code)            ✅ 已有(fetch+缓存+并发闸)
        ▲                                                        ⚠️ 未接运行时;默认网关=pinata
「typeId → 代码 CID」的声明                                      ❌ 缺失:现在靠客户端
                                                                   内联字符串在启动时手动喂
```

当前唯一入口是 `Engine.loadDynamicAdjunct(code: string)`——客户端(`dynamicAdjunctScene`
的 `DYNAMIC_ADJUNCT_CODE` 内联串)启动时手动调用。**没有任何数据能表达"这个世界用到
typeId 0xf001,它的代码在 CID X"**——这就是缺的那块词汇。

## 2. 一个决定安全与架构的关键性质:代码 = descriptor 生成器

现有契约里,动态代码**不是常驻逻辑**:它在 Worker 里**跑一次**,产出一个纯声明式
descriptor(`{meta:{typeId,…}, layout, render:[{mesh,color,size,offset}…]}`),引擎据此
经 MeshFactory 建网格——**引擎每帧从不再进入用户代码**。这带来三条重要推论:

1. **安全面小**:攻击窗口只在一次性求值,没有 per-frame 逃逸面;渲染层边界不破
   (代码不 import Three.js)。
2. **可缓存/可上链的其实是 descriptor**:代码是生成器,产物是数据——"编译产物即内容"。
3. **跨引擎故事有解**:第二引擎(Rust/bevy)不需要跑 JS——它可以直接消费
   **descriptor-as-data**(把求值后的 descriptor 也内容寻址),或走 v3 的 WASM。

## 3. 目标形态(设计)

### 3.1 模块文件:自描述封套(self-describing envelope,2026-07-08 定形)
> **已升规范**:封套/CID/版本纪律 → `protocol/cn|en/envelope.md`;动态 typeId 区段(0xf000–0xffff)→ `adjunct-types.md §15`。以规范为准。

模块本身是一份**自描述文档**(用户提案 `{id, code, version}` 的展开):

```jsonc
// 一个 adjunct 模块 = 一个内容寻址文件(.adjunct.json,归 blocks/levels 同一套目录约定)
{
  "format": "septopus.adjunct.module",   // 文档 schema 标记(同 stylepack/level 先例)
  "version": 1,                           // 文档 schema 版本
  "meta": {
    "typeId": 61441,                      // ⚠ 只准动态区段 0xf000–0xffff(见 §3.3)
    "name": "monolith",
    "semver": "1.0.0"                     // 给人看的元数据;解析永远按 CID,不按 semver
  },
  "code": "…js…",                         // 可选:descriptor 生成器(要沙箱)
  "descriptor": { "…" : "…" }             // 可选:预求值产物,内联或 CID(免沙箱/跨引擎真相)
  // code 与 descriptor 至少其一;都在时求值结果必须与 descriptor 逐字节一致
}
```

**自描述带来的"自组织"**:身份(typeId/name/semver)在文件自己身上、不执行代码即可读——
预注册/占位定型/冲突检测都在跑代码之前完成;world/level 文档的清单因此**退化成一个
CID 数组**:

```jsonc
// septopus.world.config(或 level 文档;世界级=预载友好)
{ "adjunctModules": ["bafk…", "bafk…"] }
```

> **与 boot-chain 对齐(2026-07-08 定案)**:动态加载一律沿 boot-chain 方式——
> `adjunctModules` 挂在**锚定的 world.config** 上(ROOT loader 已按 CID 拉取该文档,
> `protocol/cn|en/boot-chain.md` §3),模块文档同经 IpfsRouter 按 CID 取 + 重哈希校验。
> 即:adjunct 代码的分发通道与 app/内容完全同构,零新基建。

- **自组织的边界**:能自到「文件自带身份 → 清单=纯 CID 数组 → 加载器自建注册表 →
  冲突自检(同 typeId 两模块=快败)」;**不能自到没有根**——内容寻址存储没有目录,
  组合根(world/level 文档)必须存在,只是薄成了一个数组。块内仍只出现 typeId(现状不变);
  授权关卡可自带 modules(include 时并集,冲突=错误)。
- **封套=声称,产物=事实**:`meta.typeId` 必须等于求值 descriptor 的 `meta.typeId`,
  不等即拒绝(防挂羊头卖狗肉)。
- **纯数据模块是一等公民**:只带 `descriptor` 不带 `code` 的模块零沙箱零风险——多数
  外观型扩展应该走这条;code 只在真需要生成逻辑时出现。Rust 内核/保守客户端只消费
  descriptor;跑了沙箱的引擎必须做一致性比对。
- **semver 纪律**:`meta.semver` 仅展示;任何解析/升级逻辑按 semver 走都等于重新引入
  可变命名,毁掉内容寻址——升级 = 新 CID + 组合根换引用。

### 3.2 加载管线(全部走既有缝)

```
boot:  world 文档 → adjunctModules[]
         → IpfsRouter.get(codeCid)        ← 换掉 AdjunctLoader 自带 fetch/pinata:
           (内存 CAS → dev 网关 7789 → 真公网网关;逐次重哈希完整性)
         → AdjunctSandbox.validateCode → Worker 求值 → descriptor
         → (有 descriptor CID 时)逐字节比对
         → registerDynamicAdjunct(typeId, definition)
块流入: BlockSystem 照常;typeId 已注册即渲染
```

- **时序约束**:展开是同步的,定义必须在引用块流入**之前**注册——与 StylePack 完全同一
  约束,照抄其先例:**boot 预载全部 modules**(v0);晚到的走 **占位→swap**(v1,
  StylePack "placeholder→swap" 与 module 模型加载都是现成先例:未注册 typeId 的行先出
  占位盒,module 就绪后 `reexpandSource`/重建该块)。
- **完整性**:CID 本身=内容哈希,router get 已逐次重哈希——`loadFromIPFS` 现有的
  `codeHash` 参数变冗余,可废弃。
- **缓存/版本**:CID 不可变=天然版本号;升级=发新 CID+改 world 文档;`AdjunctLoader`
  的内存缓存按 CID 键控即可(已是)。

### 3.3 typeId 命名空间与生命周期

- **区段划分**(需进协议):内置 `0x00a1–0x00e4`;**动态区段建议 `0xf000–0xffff`**,
  world 文档只允许在动态区段注册(防覆写内置 wall/trigger 语义——这是必须挡死的攻击面)。
- **冲突**:同一世界两个 module 声明同 typeId = 加载错误(快败);不同世界/关卡切换时
  `clearDynamicAdjuncts()`(已有)清场再载,注册表按"当前世界"作用域。

## 4. 安全模型(要认真对待的部分)

威胁:**从内容寻址网络加载的任意 JS 字符串**。现有防线与缺口:

| 防线 | 现状 | 评估 |
|---|---|---|
| 静态过滤 `validateCode` | ✅ eval/Function/timers/fetch/XHR/storage/DOM/process/proto 污染,100KB 上限 | 够 v0;正则是防线不是证明,靠下层兜底 |
| Worker 隔离 | ✅ Blob Worker + 危险全局遮蔽 + 5s 超时击杀 + 崩溃自愈 | 主隔离层;注意 Worker 里 `self`/`postMessage` 面要枚举收紧 |
| 产物形状校验 | ⚠️ descriptorToDefinition 有基本转换 | **要加严**:descriptor JSON-schema 白名单(mesh 枚举/数值域/parts 数上限),拒绝函数值——产物必须是纯 JSON |
| **决定性** | ❌ 缺:`Math.random`/`Date` 不在过滤表 | **必须补**:同 CID 必须产出同 descriptor(iNFT 性质/conformance 前提)。静态过滤加 `Math.random`/`Date`/`performance`,或 Worker 内注 seed 化 shim;有 descriptor CID 比对时此风险被结构性兜住 |
| typeId 越权 | ❌ 未挡 | 动态区段强制(§3.3),内置区段注册=拒绝 |
| 资源上限 | ✅ 代码 100KB/5s | 补:descriptor 尺寸/render parts 数上限(防"合法但巨型"的 DoS 几何) |

**v1 明确不做的**:给动态代码 per-frame/事件钩子(常驻逻辑)。需要行为时用**既有数据
原语**(触发器/actuator/NPC 状态机/JSONLogic)拼——这是有意的架构选择:行为进数据,
代码只当几何/外观生成器。若未来真要常驻逻辑,那是 WASM+能力表的 v3 议题,不是放宽 JS 沙箱。

## 5. 跨引擎与上链影响(与迁移文档的对齐)

- **AC-1/AC-2 的措辞要加一条豁免**:动态 adjunct 的"行为完备"以 **descriptor 为准**
  (代码是引擎可选的生成路径)。golden vector 层面:动态类型的展开以 descriptor-as-data
  为输入做对拍,JS 求值路径是 TS 引擎的本地优化,不参与跨引擎哈希。
- **Rust 内核(bevy-reference-engine)**:不实现 JS 沙箱;读 `adjunctModules[].descriptor`
  直接建几何。因此**上链的 module 条目应当双 CID(code + descriptor)**,descriptor 是
  跨引擎的真相,code 是可验证的来源(任何人可重跑沙箱验证二者一致)。
- **WASM(v3)**:若要"代码本身跨引擎",生成器编译为 WASM(确定性、能力受限、
  wasmtime/浏览器双宿主)。那时 descriptor 双 CID 模型不变,只是生成器可移植了。

## 6. 分阶段路线

| 阶段 | 内容 | 验收 |
|---|---|---|
| **V0 · 串管道**(小,~1-2 天) | **自描述模块封套**(`.adjunct.json`,§3.1)+ world/level 的 `adjunctModules: [CID…]` 数组 · AdjunctLoader 取数改走 IpfsRouter(废 pinata 默认与 codeHash 参数)· boot 预载+封套/产物一致性校验+注册 · validateCode 补 `Math.random/Date` · typeId 动态区段强制 | monolith 封套种入 services/ipfs(`adjunct:` 名字段)→ 世界经 CID 数组声明 → **删掉客户端内联 `DYNAMIC_ADJUNCT_CODE` 喂入** → dynamic-adjunct e2e 原样全绿 |
| **V1 · 晚到与换发** | 占位→swap(未注册 typeId 先占位盒,module 到达后重建块)· descriptor JSON-schema 白名单加严 | 断网/慢网关下块先渲染占位,module 到达后就地换发 |
| **V2 · descriptor 双 CID** | 求值产物内容寻址 + 一致性比对 + Rust 内核读 descriptor 建几何 | 同一 module 在 TS(跑代码)与 Rust(读 descriptor)产出同一 golden 哈希 |
| **V3 · WASM 生成器**(远期) | 生成器 WASM 化,能力表+燃料计费 | 跨引擎跑同一生成器 |

## 7. 风险清单

1. **同步展开 vs 异步加载**是唯一的结构性别扭点——靠"boot 预载 + 占位→swap"两段式消化
   (两者皆有先例),不需要改 BlockSystem 的同步契约。
2. **沙箱是纵深防御不是证明**:正则过滤可被绕过的历史悠久;真正的底线是 Worker 隔离面 +
   产物 JSON 白名单 + descriptor 比对。安全审计应集中在 Worker 全局遮蔽的完备性。
3. **决定性缺口现在就存在**(Math.random 可用)——即便不做本文其余部分,V0 里的
   validateCode 补丁也值得单独先行。
4. **信任模型要说清**:local-first 阶段"敢引用就敢跑"(与块数据同权);联网世界里
   world 文档来自谁、谁能改 `adjunctModules`,就是谁能在你的客户端跑沙箱代码——
   上链后这由块/世界所有权契约回答,网关层不背这个责。
5. **注册表全局性**:多关卡热切换若不 clear 会串词汇;作用域化(per-world registry)
   是 V1 里顺手做的小重构。
