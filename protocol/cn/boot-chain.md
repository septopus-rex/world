# Septopus 全链启动(Boot Chain)(规范)

> **规范级(Normative)**。定义从**比特币锚记录**到**可玩 3D 世界**的完整启动链:
> 锚(链上微格式)→ ROOT_CID 装载器(`septopus.loader`)→ 世界配置 → adjunct 模块/
> 关卡/块数据/资源——链上只有一条极小记录,其余全部是 IPFS 上的
> [envelope](envelope.md) 文档,按 CID 递归解析。
> 设计原则:**一条锚 + 一个封套协议 + CID 链**,链的职责最小化为
> 「存在性证明 + 排序 + 发布历史」;无合约。

## 1. 启动链总览

```
Bitcoin(锚,微格式,§2)   {p,name,version,cid}  ← 权威=签名密钥,非名字字符串
        │
        ▼ ROOT_CID
IPFS    septopus.loader(§3)      = { code, world }
        │        │
        │        ▼ world(CID)
        │   septopus.world.config = 出生点 · adjunctModules[CID…] · 治理配置
        │              │
        │              ▼ 按 CID 拉取(全部 envelope 文档)
        │   septopus.adjunct.module(代码/descriptor)
        │   septopus.world.level / septopus.block(内容)
        │   二进制资源(原字节,CID=媒体哈希)
        ▼
boot shim(§4)= 唯一的链下信任根(BIOS 角色,极小、钉死、可审计)
```

每一跳都是同一个动作:**取 CID → 重哈希校验(envelope §1)→ 验封套
(`envelope`→`format`→`version`)→ 消费 payload(其中可能还有 CID)**。

## 2. 锚记录(链上微格式)(规范)

锚是**唯一不在 IPFS 上**的东西,住在比特币(inscription / OP_RETURN 类载体)。
链上字节昂贵,锚**不用** envelope,而是钉死的微格式(紧凑 JSON,UTF-8):

```json
{"p":"septopus","name":"world","version":"0.1.0","cid":"bafk…"}
```

| 字段 | 语义 | 参与解析? |
|---|---|---|
| `p` | 协议标记,恒为 `"septopus"`(链上索引用) | ✅ 过滤 |
| `name` | 世界名(一个密钥可发多个世界) | ✅ 选择 |
| `version` | 人类版本号 | ❌ 仅展示(同 envelope §4 semver 纪律) |
| `cid` | ROOT_CID → `septopus.loader` 文档 | ✅ 启动入口 |

**权威与解析规则**(核心,防抢注/假根):

1. **权威 = 签名密钥,不是名字字符串**。任何人都能发 `p=septopus` 的记录;
   shim 只认**创世密钥**(出厂钉死在 shim 里的公钥/地址,§4)签名的记录。
2. **最新 = 该密钥的、已确认的、块高最高的有效记录**;同块多条取块内序最先。
   `version` 字段不参与选择。
3. 记录不可解析(非 JSON/缺字段/cid 非法)→ 跳过,继续向前找上一条有效记录
   (坏记录不能砖掉世界)。
4. 密钥轮换:v1 不支持(丢钥=世界冻结在最后有效锚)。轮换记录格式留待后续版本。

## 3. `septopus.loader`(ROOT 文档)(规范)

ROOT_CID 指向一份标准 envelope 文档:

```jsonc
{
  "envelope": 1,
  "format": "septopus.loader",
  "version": 1,
  "meta": { "name": "septopus-world", "semver": "0.1.0" },
  "code": "…自包含 JS 程序…",       // shim 以页面权限执行(信任来自锚链,非沙箱)
  "world": "bafk…"                  // septopus.world.config 的 CID
}
```

- `code`:**自包含**(无 import/无外部脚本标签)的 JS 程序——就是 3D 世界客户端
  本体(或其引导器)。shim 执行它时授予**完整页面权限**:loader 的信任由
  「锚密钥签名 → CID 完整性」链条建立,**不走** adjunct 沙箱(那是给第三方
  世界内容的,见 [adjunct-types.md](adjunct-types.md) §15)。
- `world`:世界配置的 CID。**世界的一切升级(改配置/换模块/换内容根)都走
  「发新文档 → 发新 loader 文档 → 发新锚」**,因此每次根变更都留链上审计痕迹。
- loader 运行后的义务:按 `world` 拉取 `septopus.world.config`,再按其中的
  `adjunctModules` / 内容引用继续 CID 递归;全程执行 envelope §1 完整性校验。

## 4. boot shim(链下信任根)(规范)

shim 是**唯一必须预先分发**的链下组件(静态页/原生壳/浏览器扩展均可),
角色 = BIOS:极小、极少变、可整体审计。**shim 里钉死的东西就是全部信任根**:

| 出厂钉死 | 说明 |
|---|---|
| 链网络 + 创世密钥(或创世 txid) | §2 的权威判定依据 |
| IPFS 网关列表 | 取数通道(可多个,逐个降级) |
| 本 shim 支持的 `envelope`/`format`/`version` 上限 | 防解析未知壳 |

**规范算法**(实现不得增删语义步骤):

```
1. 读链:过滤 p="septopus" ∧ name=<目标> ∧ 签名=创世密钥 的记录
2. 选择:块高最高的有效记录(§2 规则 2/3)→ ROOT_CID
3. 取数:依网关列表取 ROOT_CID 字节;逐网关重哈希比对 CID,不符换下一个
4. 验壳:envelope=1 ∧ format="septopus.loader" ∧ version ≤ 支持上限,否则终止并明示
5. 执行:以页面权限运行 payload.code;把 {anchor, rootCid, world} 作为启动参数传入
```

- shim **不做**任何内容解释——第 5 步之后一切归 loader。
- shim 升级 = 重新分发 shim(它不在链上);这是有意的:信任根的变更必须走
  链下的显式分发,不能被链上内容自举篡改。

## 5. 开发替身(约定级)

无链环境(dev)用**同一套字节与算法**彩排:

- 锚记录 → 网关名字索引 `anchor:<name>`(内容=§2 微格式字节;签名/块高检查降级为跳过,
  其余步骤不变);
- 网关 = `services/ipfs`(7789);shim 可经 `?anchor=<url>` 覆盖锚源(仅 dev)。
- 因此「dev 彩排」与「主网启动」只差第 1-2 步的取锚方式——防漂移的关键。

## 6. 信任模型与失效面

| 威胁 | 防线 |
|---|---|
| 假锚/抢注名字 | 权威=创世密钥(§2.1);名字字符串无权威 |
| 网关返回假内容 | CID 重哈希(envelope §1),换网关重试 |
| 内容被 unpin(可用性) | 多网关 + 本地缓存层;发布方负责 pin(运营约定,非协议) |
| 坏记录/坏文档砖机 | §2.3 跳过坏锚回溯;§4.4 验壳失败明示终止 |
| 锚密钥被盗 | v1 无解(轮换待后续版本);影响=可发假根,已装 shim 的创世密钥不受影响者不受骗——密钥保管是运营红线 |
| loader 代码恶意 | 不设防(loader=完整权限)——信任即「锚密钥发布者」;第三方内容才走沙箱/descriptor |

## 7. 升级流程(全链世界的"发版")

```
改内容/配置 → 发布新文档到 IPFS(得新 CID)→ pin
→ 组装新 loader 文档(world 指向新配置)→ pin → 得新 ROOT_CID
→ 用创世密钥发新锚 {p,name,version,cid}
→ 全网客户端下次启动即用新根;旧根永远可取(链上历史+CID 不可变)= 天然版本回溯
```

---

*协议版本:v0.1(2026-07-08 新增)。变更须 cn/en 双语同步并记入根 CHANGELOG。*
