//! septopus-expand — 源→派生展开 + 确定性 PRNG。B1: SPP(b6);B2: motif(c2)。
//!
//! B0 仅落地 mulberry32(与 protocol/cn/determinism.md 逐位一致),供后续里程碑用,
//! 并单测钉住。B1: SPP 展开在 `spp` 模块。

pub mod spp;
pub mod motif;

/// mulberry32:32 位确定性 PRNG。规范见 protocol/cn/determinism.md。
/// 返回 [0,1) 浮点,与 TS 实现逐位一致(u32 环绕算术)。
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    /// seed 0 被锁死→强制为 1(与 TS `makeRng`: `(seed>>>0) || 1` 对齐)。
    /// 这是 port 必须复现的变体,见 engine/src/core/motif/Rng.ts / protocol item.md §2。
    pub fn new(seed: u32) -> Self {
        Mulberry32 {
            state: if seed == 0 { 1 } else { seed },
        }
    }

    /// 推进一步,返回 [0,1) 均匀浮点。
    pub fn next_f64(&mut self) -> f64 {
        // t = (state += 0x6D2B79F5) >>> 0
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state;
        // t = Math.imul(t ^ t >>> 15, t | 1)
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        // t ^= t + Math.imul(t ^ t >>> 7, t | 61)
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        // return ((t ^ t >>> 14) >>> 0) / 4294967296
        (((t ^ (t >> 14)) as u64) as f64) / 4_294_967_296.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 钉点:与 TS `makeRng`(engine/src/core/motif/Rng.ts)逐位对照的期望值。
    // 这些常量由 TS 侧产出(node),Rust 必须复现——差分裁判的第一块地基。
    #[test]
    fn mulberry32_matches_ts_reference() {
        // seed 12345 的前 4 个输出(TS makeRng(12345))
        let expect = [
            0.979728267760947,
            0.306752264499664,
            0.484205421525985,
            0.817934412509203,
        ];
        let mut m = Mulberry32::new(12345);
        for e in expect {
            assert!((m.next_f64() - e).abs() < 1e-15);
        }
        // seed 0 被强制为 1:两者流相同
        let (mut z, mut o) = (Mulberry32::new(0), Mulberry32::new(1));
        for _ in 0..4 {
            assert_eq!(z.next_f64().to_bits(), o.next_f64().to_bits());
        }
    }
}
