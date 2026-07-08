# scenes/ 纪律 — 世界内容禁止写成 TS

> 规矩(2026-07-08,full-data-migration.md P2 定):**内容 = 数据,行为 = 引擎原语。**
> 本文件夹**不承载世界内容**;想往块里放东西,去改数据文件。

## 内容放哪

| 你要做的 | 放哪 | 先例 |
|---|---|---|
| 一个新关卡(出生点+多块+组合) | `src/levels/<名>.level.json` | gallery / xianjian / refine |
| 一块可复用/可复位的内容 | `src/blocks/<名>.block.json` | demo / maze / hub / 各游戏家具 |
| 一个风格包 | `src/stylepacks/<名>.stylepack.json` | brick / garden |
| 原生小游戏的配置 | **块数据里的 b8 game trigger**(`enterGame params[0].game={kind,…}`),System 经 `game.declare` 自臂 | shooting / pool / tumble |
| 触发器指向同块对象 | **块相对 id** `adj_~_~_{type十进制}_{idx}`(禁止烤绝对坐标) | demo 门 |
| 程序化生成、但种子写死(输出永不变) | **跑一次,冻结成 JSON**(生成器删除) | maze |
| 程序化生成、要参数化复用 | 提升为**引擎 motif 模板**(协议级、确定性),数据一行 `[origin,模板,seed,params]` 调用 | house/road/building |

## 本文件夹只允许三种东西

1. **常量/清单**:块坐标、资产清单(`demoScene`/`mazeScene`/各游戏 scene 现状)。
2. **组合胶水**:import 数据文件、组装 `AuthoredLevel.include` 条目(`worldHubScene`;
   等 ref-by-name/CID 解析器落地后这层也变数据,见 full-data-migration.md P7)。
3. **工具 / 代码即行为**:编辑器沙盘(`sandboxScene`)、AdjunctSandbox 演示
   (`dynamicAdjunctScene`)、资源生成器(`mahjongFaces`)。

**新加一个 `build*Scene(bx,by)` 往 raw 里 push 内容 = 走错门。** 为什么这么严:
块数据要上链、要被第二引擎(Rust 参考引擎,`reference/`)干净房间复现——写在 TS 里的
内容对它们不存在(docs/plan/specs/full-data-migration.md §0)。
