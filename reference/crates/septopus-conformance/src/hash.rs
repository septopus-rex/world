//! canonical 状态哈希(规范:bevy-reference-engine.md §4)。
//!
//! 两个引擎对同一份数据必产出逐位相同的哈希。字节布局固定、小端、排序消实体序差异、
//! 定点量化消 fp 噪声。TS 侧(engine/tests/conformance/canonical.mjs)逐字节镜像本文件。

use septopus_protocol::BlockState;
use sha2::{Digest, Sha256};

/// 把块状态序列化为 canonical 字节流并 SHA-256。返回 `sha256:<hex>`。
pub fn canonical_hash(state: &BlockState) -> String {
    let mut ents = state.entities.clone();
    // 排序键:derivedFrom, typeId, pos, seq(见 §4.2)。消除两引擎 ECS 实体序差异。
    ents.sort_by(|a, b| {
        a.derived_from
            .cmp(&b.derived_from)
            .then(a.type_id.cmp(&b.type_id))
            .then(a.pos.cmp(&b.pos))
            .then(a.seq.cmp(&b.seq))
    });

    let mut buf: Vec<u8> = Vec::new();
    // 块头
    buf.extend_from_slice(&state.block[0].to_le_bytes());
    buf.extend_from_slice(&state.block[1].to_le_bytes());
    buf.extend_from_slice(&state.elevation.to_le_bytes());
    buf.extend_from_slice(&state.game.to_le_bytes());
    buf.extend_from_slice(&0u32.to_le_bytes()); // flags 数(B0: 0)
    buf.extend_from_slice(&(ents.len() as u32).to_le_bytes());
    // 实体流
    for e in &ents {
        buf.extend_from_slice(&e.type_id.to_le_bytes());
        let df = e.derived_from.as_bytes();
        buf.extend_from_slice(&(df.len() as u32).to_le_bytes());
        buf.extend_from_slice(df);
        for v in e.pos {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in e.rot {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in e.size {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        buf.extend_from_slice(&e.resource.to_le_bytes());
        buf.push(e.solid as u8);
        buf.extend_from_slice(&(e.tail.len() as u32).to_le_bytes());
        buf.extend_from_slice(&e.tail);
    }

    let mut h = Sha256::new();
    h.update(&buf);
    format!("sha256:{:x}", h.finalize())
}
