# Septopus 参考引擎（Rust）— 无头一致性内核 / 差分裁判

第二个独立引擎实现,只读「块数据 + `protocol/`」,证明数据完备、可跨引擎/上链复现。
设计与里程碑见 [`docs/plan/specs/bevy-reference-engine.md`](../docs/plan/specs/bevy-reference-engine.md)、
动机见 [`full-data-migration.md`](../docs/plan/specs/full-data-migration.md)。

**纪律**:`septopus-protocol` 是唯一允许照 `protocol/` 规范手写的 crate;其余只依赖它,
**不得参照 TS 引擎源**。比对只在数据/状态层(canonical 状态哈希),不在帧仿真层。

## crates
- `septopus-protocol` — 块/adjunct 解码(clean-room)。
- `septopus-expand` — 源→派生展开(SPP b6 / motif c2)+ 确定性 PRNG(mulberry32,已与 TS 逐位对齐)。
- `septopus-sim` — 碰撞/触发/actuator 语义(B3+)。
- `septopus-conformance` — 差分裁判 CLI:golden vector → 状态哈希 → 对拍。

## 跑
```bash
cd reference && cargo build && cargo test        # 含 mulberry32 与 TS 对照的钉点

# 对拍 golden 目录(默认 ../engine/tests/golden)
cargo run -p septopus-conformance -- ../engine/tests/golden
cargo run -p septopus-conformance -- <vector.json> --emit   # 只打印实算哈希
```

## golden vectors
共享于 [`engine/tests/golden/`](../engine/tests/golden/)。TS 侧镜像 + 生成期望值:
```bash
node engine/tests/conformance/canonical.mjs write engine/tests/golden/<v>.json  # 写 expect.stateHash
node engine/tests/conformance/canonical.mjs emit  engine/tests/golden/<v>.json  # 只打印
```
`canonical.mjs` 逐字节镜像 `septopus-conformance/src/hash.rs`。两侧独立算出同一哈希 = 通过。

## 状态(里程碑见 spec §9)
- **B0 ✅** 脚手架 + 5 槽块 + 标准 7 槽解码 + canonical 状态哈希(SHA-256)+ 差分 CLI。
  `box-basic`、`empty-block` 双侧一致;mulberry32 与 TS 逐位一致。
- **B1 ✅** SPP(b6)展开:解析面 + 叠加态坍缩(FNV-1a 种子 + mulberry32)+ 同层相邻消除
  + **递归细化(父面继承 + 跨层 finer-owns)** + `basic` 主题(solid/doorway/window/empty)。
  三 vector `spp-hut-basic`/`spp-superposition`/`spp-refinement`:**clean-room Rust 与真引擎 `expandSpp` 逐位一致**。
  - TS 侧 golden 由真引擎生成/断言:`GEN=1 npx vitest run tests/conformance/spp-golden.test.ts`(生成),无 GEN 即 CI 断言。
  - **待续**:其它主题(garden/brick 数据包 `parts` 组合、coaster 结构主题)、LOD 门控(maxLevel/budget)。
- **B2 核心 ✅** motif(c2)展开:`[origin,template,seed,params]` → a2 盒行(mulberry32 确定性)。
  模板 `panel`(无 rng)+ `arch`(range+pick,验 rng 消耗顺序)。`motif-panel`/`motif-arch` 双引擎逐位一致。
  - **待续**:house/road/building/totem/cluster 模板。
- **B3 核心 ✅** b8 触发器纳入差分哈希:canonical 实体加**类型尾**(标准 7 槽为空;b8 = `shape/gameOnly/事件签名`)。
  `trigger-basic`(authored b8)+ `spp-trigger`(SPP 派生 b8)两 vector 双引擎逐位一致——授权与派生的触发器都能跨引擎验证。
  事件签名 = `type:actType.method,…;…`(结构签名,顺序保留;事件由源逐字节透传故两端必同)。
  - **待续(B3 尾)**:actuator 动态语义(steps>0 状态轨迹)、其余 adjunct 类型(module/light/item/…)纳入哈希。
