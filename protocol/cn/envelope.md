# Septopus 文档封套与内容寻址(规范)

> **规范级(Normative)**。定义 Septopus 世界数据的**统一文档封套**、**内容寻址(CID)**
> 与**版本纪律**——内容寻址存储没有文件扩展名,从一个 CID 取回的字节必须能**自报家门**
> (是什么、哪一版、怎么校验)。任何实现(引擎/客户端/网关/工具)按本文编解码,
> 同一份内容必须得到同一 CID、解出同一 payload。
> 参考实现:`engine/src/core/services/ipfs/Cid.ts`、`client/core` ContentResolver、
> `services/ipfs`(dev 网关)。过程文档:`docs/plan/specs/full-data-migration.md` §P4.6。

## 1. 内容寻址:CID(规范)

内容标识 = **真 CIDv1**:

```
CID = 'b' + base32( 0x01 ‖ 0x55 ‖ 0x12 ‖ 0x20 ‖ sha256(bytes) )
       ▲multibase   ▲版本1  ▲raw   ▲sha2-256 ▲摘要长32
```

- base32 = RFC4648 小写无填充;raw 编解码前缀使 CID 呈 `bafk…`。
- 与真实 IPFS 节点 `ipfs add --cid-version=1 --raw-leaves` **逐字节一致**
  (已对 `multiformats` 参考实现逐位验证;公网网关可直接解析)。
- **CID 是字节的纯函数**:同内容必同 CID,任何 provider(内存 CAS/本地网关/公网 IPFS)
  可互换;读取方**必须**对取回字节重哈希并与 CID 比对(完整性校验),不符即拒绝。
- 单 blob 寻址(无 UnixFS 分块);实现可对超大内容另行约定,但本协议内容以单 blob 为准。
- 兼容注记:历史(2026-07-08 前)mock 方案 `bafy`+裸哈希 可能残存于旧本地草稿;
  实现**可以**识读旧格式,**不得**再生成。

## 2. 统一文档封套(规范)

所有 Septopus **原生 JSON 文档**入 CAS 前包一层自描述封套:

```jsonc
{
  "envelope": 1,                     // 必填:封套结构自身的版本(本协议 §2 形状的版本)
  "format": "septopus.<kind>",      // 必填:文档类型标识(见 §3 注册表)
  "version": 1,                      // 必填:该 kind 的 payload schema 版本(整数)
  "meta": {                          // 可选:人类元数据
    "name": "…",                     //   展示名
    "semver": "1.0.0"                //   人类版本号(见 §4:永不参与解析)
  },
  /* payload:各 kind 自己的本体字段(见 §3) */
}
```

- **封套自版本 `envelope`(2026-07-08 增补)**:封套形状本身也会演进(如未来加签名槽)。
  解析次序:**先 `envelope`(会解这个壳吗)→ 再 `format`+`version`(会解这个 payload 吗)
  → 才碰 payload**。未知/过高 `envelope` = 拒绝。仓内 2026-07-08 前生成的文档缺
  `envelope` 字段的,迁移期按 `envelope:1` 识读;**入 CAS/上链的内容必须显式携带**。
- 未知 `format` = 拒绝,高于已支持的 `version` = 拒绝(或显式迁移)。
- **封套只属于存储/交换层**(CAS 存取、网关传输、导出/导入)。**payload 是规范层**,
  其形态由各自协议文档定义,**不因封套而改变一个字节**——运行时、golden 一致性哈希、
  L2 编码、链上形态全部作用于 payload。
- **单缝解封**:实现必须在**一个**边界缝(内容解析器/装载器)完成「验封套→拆 payload」,
  引擎内核对封套无感。

## 3. format 注册表(规范)

| format | payload | payload 规范出处 |
|---|---|---|
| `septopus.world.level` | 关卡文档(start/blocks/include/fallback…) | 参考实现 `AuthoredLevel`;词汇见过程文档 P7(稳定后并入本表所指规范) |
| `septopus.block` | **5 槽块 raw 裸数组** `[elevation, status, adjuncts, animations, game]` | [block.md](block.md) §3(payload 一字节不动) |
| `septopus.world.config` | 世界配置(块尺寸/玩家默认/基线纹理…) | [world.md](world.md) |
| `septopus.spp.stylepack` | 风格包(thickness/closed/open…) | SPP 协议 / spp-protocol-full |
| `septopus.adjunct.module` | 动态 adjunct 模块:`meta.typeId` + `code`(生成器,可选)+ `descriptor`(预求值产物,可选;二者至少其一,同在必须一致) | 本表 + [adjunct-types.md](adjunct-types.md) §15(动态区段) |
| `septopus.loader` | 世界装载器:`code`(自包含 JS 程序,shim 以页面权限执行)+ `world`(world.config 的 CID) | [boot-chain.md](boot-chain.md) §3 |
| `septopus.text` | 多语言文本表(`entries: {locale: string[]}`) | [resource.md](resource.md) §4 |
| `septopus.generation.doc` | AI 生成文档 | GenerationDoc 契约 |

- 新增 kind = 修订本表(cn/en 双语同步)。
- **二进制外来格式**(GLB/PNG/WAV/MP4…)**不封套**:直接按字节入 CAS,类型靠
  MIME 与名字索引(§5)承载。

## 4. 版本纪律:四层(规范)

| 层 | 载体 | 语义 | 参与解析? |
|---|---|---|---|
| **封套结构版** | `envelope`(整数) | 壳的形状演进(加字段等) | ✅ 第一道门:会不会解这个壳 |
| **内容版本** | **CID** | 不可变身份;改一字节=新 CID | ✅ 唯一的解析依据 |
| **schema 版本** | `version`(整数) | 该 kind 的 payload 格式演进,驱动迁移器 | ✅ 验证/迁移 |
| **人类版本** | `meta.semver` | 展示、变更沟通 | ❌ **永不**。按 semver 解析 = 重新引入可变命名,破坏内容寻址 |

升级内容 = 发布新 CID + 组合根(world/level 文档)更换引用;不存在"就地升级"。

## 5. 名字索引(约定级,非规范)

网关/工具**可以**维护 `name → CID` 索引作为人类入口(如 `level:default`、`block:demo`、
`stylepack:garden`、`asset:soldier.glb`、`adjunct:monolith`)。名字**不是**协议身份:
- 前缀与 `format` 对齐(封套在手时名字前缀只是冗余校验);
- 名字可变、可重绑;一切一致性以 CID 为准;
- 跨信任边界(链上)只允许 CID 引用,名字仅限本地/开发便利;
- 链上的**资源注册表**([resource.md](resource.md) §3)= 带所有权的名字索引(整数 id → CID
  的可变指针),同受本条纪律:一致性以 CID 为准。

## 6. 一致性验收

0. 缺失/未知/过高 `envelope` → 拒绝(迁移期例外:仓内旧文档按 1 识读)。
1. 同一 payload 字节 → 任意实现算得同一 CID(§1;与 `multiformats` 对拍)。
2. 取回字节重哈希 ≠ CID → 必须拒绝(完整性)。
3. 未知 `format` / 过高 `version` → 必须拒绝或显式迁移,不得静默猜测。
4. 块文档解封后的 payload 与直接持有的 5 槽 raw **逐字节一致**(封套零污染)。
5. `meta.semver` 改变而 payload 不变 → CID 改变(封套参与哈希)但 payload 语义不变;
   任何实现不得据 semver 改变行为。

---

*协议版本:v0.1(2026-07-08 增补)。变更须 cn/en 双语同步并记入根 CHANGELOG。*
