//! motif(c2)展开 — clean-room 复现 `engine/src/core/motif/MotifExpander.ts`。
//!
//! `[origin, template, seed, params]` → 标准 a2 盒行(stop=1 solid)。生成式但确定性:
//! 变化来自显式 seed 的 mulberry32,(template, seed) 处处复现同内容(iNFT 性质)。
//!
//! B2 覆盖模板:`panel`(无 rng)、`arch`(range+pick,验 rng 消耗顺序)。
//! house/road/building/totem/cluster 为后续 slice(遇到即 panic,暴露未覆盖)。

use crate::Mulberry32;
use serde_json::{json, Value};

const BOX: u32 = 0x00a2;
/// basic_box 调色板索引(与 MotifTemplates.ts COLORS 一致)。
const COLORS: [i64; 5] = [0, 1, 2, 3, 10];

// Rng 辅助——逐次消耗与 engine/src/core/motif/Rng.ts 逐位一致。
fn range(m: &mut Mulberry32, min: f64, max: f64) -> f64 {
    min + (max - min) * m.next_f64()
}
fn pick(m: &mut Mulberry32, arr: &[i64]) -> i64 {
    arr[((m.next_f64() * arr.len() as f64).floor() as usize) % arr.len()]
}

struct MBox {
    size: [f64; 3],
    pos: [f64; 3],
    rot: [f64; 3],
    resource: i64,
}

fn arr3(v: Option<&Value>, def: [f64; 3]) -> [f64; 3] {
    match v {
        Some(Value::Array(a)) if a.len() >= 3 => [
            a[0].as_f64().unwrap_or(def[0]),
            a[1].as_f64().unwrap_or(def[1]),
            a[2].as_f64().unwrap_or(def[2]),
        ],
        _ => def,
    }
}

/// panel — 一块竖直薄板(无 rng)。
fn tpl_panel() -> Vec<MBox> {
    vec![MBox { size: [3.0, 0.15, 2.0], pos: [0.0, 0.0, 1.2], rot: [0.0, 0.0, 0.0], resource: 0 }]
}

/// arch — 两柱 + 楣。rng 消耗顺序:span(若无 param)→ height → pw → pillar(pick)→ top → lintel(pick)。
fn tpl_arch(m: &mut Mulberry32, params: &Value) -> Vec<MBox> {
    let span = params.get("span").and_then(|x| x.as_f64()).unwrap_or_else(|| range(m, 2.0, 3.2));
    let height = range(m, 2.4, 3.6);
    let pw = range(m, 0.5, 0.8);
    let pillar = pick(m, &COLORS);
    let top = range(m, 0.4, 0.7);
    let lintel = pick(m, &COLORS);
    vec![
        MBox { size: [pw, pw, height], pos: [-span / 2.0, 0.0, height / 2.0], rot: [0.0, 0.0, 0.0], resource: pillar },
        MBox { size: [pw, pw, height], pos: [span / 2.0, 0.0, height / 2.0], rot: [0.0, 0.0, 0.0], resource: pillar },
        MBox { size: [span + pw, pw, top], pos: [0.0, 0.0, height + top / 2.0], rot: [0.0, 0.0, 0.0], resource: lintel },
    ]
}

/// 展开一个 c2 raw 行 → 标准 a2 盒行 `[(0x00a2, row)]`。
pub fn expand_motif(raw: &Value) -> Vec<(u32, Value)> {
    let a = match raw.as_array() {
        Some(a) => a,
        None => return vec![],
    };
    let origin = arr3(a.get(0), [0.0, 0.0, 0.0]);
    let template = a.get(1).and_then(|x| x.as_str()).unwrap_or("totem");
    let seed = a.get(2).and_then(|x| x.as_i64()).unwrap_or(0) as u32; // (seed??0)>>>0
    let params = a.get(3).cloned().unwrap_or(Value::Null);

    let mut m = Mulberry32::new(seed);
    let boxes = match template {
        "panel" => tpl_panel(),
        "arch" => tpl_arch(&mut m, &params),
        other => panic!("B2 未覆盖 motif 模板 '{other}'(仅 panel/arch;house/road/building/totem/cluster 后续)"),
    };

    let texture = params.get("texture").and_then(|x| x.as_str()).map(|s| s.to_string());
    boxes
        .iter()
        .map(|b| {
            // a2 盒 raw:[size, pos, rot, resource, repeat, animation, stop=1, texture?]
            let mut row = vec![
                json!(b.size),
                json!([origin[0] + b.pos[0], origin[1] + b.pos[1], origin[2] + b.pos[2]]),
                json!(b.rot),
                json!(b.resource),
                json!([1, 1]),
                json!(0),
                json!(1),
            ];
            if let Some(t) = &texture {
                row.push(json!(t));
            }
            (BOX, Value::Array(row))
        })
        .collect()
}
