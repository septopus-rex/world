//! SPP(b6)展开 — clean-room 复现 `engine/src/core/spp/Expander.ts`。
//!
//! `[origin, cells, theme]` → 标准 adjunct 行 `[(typeId, row)]`(a1 墙 + b8 触发器)。
//! 确定性:叠加态坍缩用 mulberry32 + FNV-1a 种子(块+cell+面),见 Expander.ts §collapseSeed。
//!
//! B1 slice-1 覆盖:单层 cell(无 refinement) · 解析面 `faces` / 叠加面 `faceOptions` ·
//! 同层相邻消除 · `basic` 主题(solid/doorway/window/empty)· 触发器体。
//! refinement 递归 = 下一 slice(遇到即 panic,暴露未覆盖)。

use crate::Mulberry32;
use serde_json::{json, Value};
use std::collections::HashSet;

// ParticleFace 顺序:Top,Bottom,Front(S),Back(N),Left(W),Right(E) = 0..5。
const TOP: usize = 0;
const BOTTOM: usize = 1;
const FRONT: usize = 2;
const BACK: usize = 3;
const LEFT: usize = 4;
const RIGHT: usize = 5;
const FACES: [usize; 6] = [TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT];

const WALL: u32 = 0x00a1;
const TRIGGER: u32 = 0x00b8;

/// 一个面配置:state(1=Closed,0=Open)+ 变体引用(数字索引或字符串 key)。
#[derive(Clone, Debug)]
struct Face {
    state: i64,
    variant: VarRef,
}
#[derive(Clone, Debug)]
enum VarRef {
    Idx(i64),
    Key(String),
}

/// basic 主题的一个变体 = 若干 piece(du,dv,su,sv);展开时抬升为 a1 墙 part。
struct Piece {
    du: f64,
    dv: f64,
    su: f64,
    sv: f64,
}

const BASIC_THICKNESS: f64 = 0.2;

/// basic 主题 closed 池:0 solid · 1 doorway · 2 window(与 Variants.ts BASIC_THEME 逐字段一致)。
fn basic_closed(idx: usize) -> Option<Vec<Piece>> {
    Some(match idx {
        0 => vec![Piece { du: 0.0, dv: 0.0, su: 1.0, sv: 1.0 }], // solid
        1 => vec![
            Piece { du: 0.0, dv: 0.0, su: 0.3, sv: 1.0 },   // left jamb
            Piece { du: 0.7, dv: 0.0, su: 0.3, sv: 1.0 },   // right jamb
            Piece { du: 0.3, dv: 0.75, su: 0.4, sv: 0.25 }, // lintel
        ],
        2 => vec![
            Piece { du: 0.0, dv: 0.0, su: 1.0, sv: 0.4 },    // sill
            Piece { du: 0.0, dv: 0.85, su: 1.0, sv: 0.15 },  // header
            Piece { du: 0.0, dv: 0.4, su: 0.25, sv: 0.45 },  // left pier
            Piece { du: 0.75, dv: 0.4, su: 0.25, sv: 0.45 }, // right pier
        ],
        _ => return None,
    })
}

/// basic open 池:0 empty(无 piece)。
fn basic_open(idx: usize) -> Option<Vec<Piece>> {
    match idx {
        0 => Some(vec![]),
        _ => None,
    }
}

/// getVariant:按 state 选池 + 引用解析。basic 变体 name==key(solid/doorway/window/empty)。
fn get_variant(face: &Face) -> Option<Vec<Piece>> {
    let closed = face.state == 1;
    match &face.variant {
        VarRef::Idx(i) => {
            let i = *i as usize;
            if closed { basic_closed(i) } else { basic_open(i) }
        }
        VarRef::Key(k) => {
            let (pool, names): (fn(usize) -> Option<Vec<Piece>>, &[&str]) = if closed {
                (basic_closed, &["solid", "doorway", "window"])
            } else {
                (basic_open, &["empty"])
            };
            names.iter().position(|n| n == k).and_then(pool)
        }
    }
}

fn cell_size(level: i64) -> f64 {
    4.0 * 0.5f64.powi(level as i32)
}

/// FNV-1a 风格坍缩种子(Expander.ts collapseSeed 逐位复现)。
fn collapse_seed(bx: i64, by: i64, cell_idx: i64, face_idx: i64) -> u32 {
    let mut h: u32 = 2166136261;
    for v in [bx as i32, by as i32, cell_idx as i32, face_idx as i32] {
        let mixed = (v as u32).wrapping_add(0x9e3779b9);
        h ^= mixed;
        h = h.wrapping_mul(16777619);
    }
    h
}

/// 坍缩一个面的候选列表:0→[Closed,0];1→取之;N→mulberry32 选。
fn collapse_face(options: &[Value], seed: u32) -> Face {
    if options.is_empty() {
        return Face { state: 1, variant: VarRef::Idx(0) };
    }
    let pick = if options.len() == 1 {
        0
    } else {
        (Mulberry32::new(seed).next_f64() * options.len() as f64).floor() as usize % options.len()
    };
    face_from_value(&options[pick])
}

/// 从 `[state, variantRef]` 值解一个面。
fn face_from_value(v: &Value) -> Face {
    let a = v.as_array();
    let state = a.and_then(|x| x.get(0)).and_then(|x| x.as_i64()).unwrap_or(1);
    let variant = match a.and_then(|x| x.get(1)) {
        Some(Value::String(s)) => VarRef::Key(s.clone()),
        Some(Value::Number(n)) => VarRef::Idx(n.as_i64().unwrap_or(0)),
        _ => VarRef::Idx(0),
    };
    Face { state, variant }
}

/// 子 cell 的面 F 是否在父边界(vs 与兄弟共享的内部面)。localPos 每轴 0/1。
fn is_boundary(face: usize, p: [i64; 3]) -> bool {
    match face {
        TOP => p[2] == 1,
        BOTTOM => p[2] == 0,
        FRONT => p[1] == 0,
        BACK => p[1] == 1,
        LEFT => p[0] == 0,
        RIGHT => p[0] == 1,
        _ => false,
    }
}

/// 解析一个 cell 的 6 面:
///   base = 显式 `faces`(可含 null)或坍缩 `faceOptions`;
///   未设面:在 refinement 内 → 边界继承父面、内部默认 Open;顶层 → 默认 Closed solid。
fn resolve_faces(
    cell: &Value, bx: i64, by: i64, cell_idx: i64,
    parent: Option<(&[Face; 6], [i64; 3])>,
) -> [Face; 6] {
    // base:显式面(Some=已设,None=null/缺→继承/默认)
    let mut base: [Option<Face>; 6] = std::array::from_fn(|_| None);
    if let Some(faces) = cell.get("faces").and_then(|x| x.as_array()) {
        for f in 0..6 {
            if let Some(Value::Array(_)) = faces.get(f) {
                base[f] = Some(face_from_value(&faces[f]));
            }
        }
    } else if let Some(opts) = cell.get("faceOptions").and_then(|x| x.as_array()) {
        for f in 0..6 {
            let list = opts.get(f).and_then(|x| x.as_array()).cloned().unwrap_or_default();
            base[f] = Some(collapse_face(&list, collapse_seed(bx, by, cell_idx, f as i64)));
        }
    }
    std::array::from_fn(|f| match base[f].take() {
        Some(face) => face,
        None => match parent {
            Some((pf, lp)) => {
                if is_boundary(f, lp) {
                    pf[f].clone() // 边界 → 继承父面
                } else {
                    Face { state: 0, variant: VarRef::Idx(0) } // 内部 → Open
                }
            }
            None => Face { state: 1, variant: VarRef::Idx(0) }, // 顶层 → solid
        },
    })
}

/// partToBox — 面局部 piece → SPP 空间盒(中心 + 全尺寸,相对 cell 原点角)。
/// 逐面复现 Expander.ts partToBox(piece = w=0 / sw=thickness 的特例)。
fn part_to_box(face: usize, p: &Piece, s: f64, thickness: f64) -> ([f64; 3], [f64; 3]) {
    let u_c = (p.du + p.su / 2.0) * s;
    let sum = p.su * s;
    let v_c = (p.dv + p.sv / 2.0) * s;
    let svm = p.sv * s;
    let swm = thickness; // piece: sw 缺省 = thickness
    let w_c = swm / 2.0; // w=0 → wC = swm/2
    match face {
        LEFT => ([swm, sum, svm], [w_c, u_c, v_c]),
        RIGHT => ([swm, sum, svm], [s - w_c, u_c, v_c]),
        FRONT => ([sum, swm, svm], [u_c, w_c, v_c]),
        BACK => ([sum, swm, svm], [u_c, s - w_c, v_c]),
        BOTTOM => ([sum, svm, swm], [u_c, v_c, w_c]),
        TOP => ([sum, svm, swm], [u_c, v_c, s - w_c]),
        _ => unreachable!(),
    }
}

fn pos_key(level: i64, g: [i64; 3]) -> (i64, i64, i64, i64) {
    (level, g[0], g[1], g[2])
}

/// 每个面的网格方向(跨层 finer-owns 抑制用),索引 = ParticleFace。
const FACE_DIR: [[i64; 3]; 6] = [
    [0, 0, 1],  // TOP
    [0, 0, -1], // BOTTOM
    [0, -1, 0], // FRONT(S)
    [0, 1, 0],  // BACK(N)
    [-1, 0, 0], // LEFT(W)
    [1, 0, 0],  // RIGHT(E)
];

/// 正向格拥有共享平面 → 负向面在有邻格时跳过(同层相邻消除)。
fn neg_dir(face: usize) -> Option<[i64; 3]> {
    match face {
        LEFT => Some([-1, 0, 0]),
        FRONT => Some([0, -1, 0]),
        BOTTOM => Some([0, 0, -1]),
        _ => None,
    }
}

fn refinement_cells(cell: &Value) -> Option<&Vec<Value>> {
    cell.get("refinement").and_then(|r| r.get("cells")).and_then(|c| c.as_array())
}

/// 输出一个叶子 cell 的面几何(basic 主题:抬升 piece → a1 墙)。
fn emit_leaf(
    faces: &[Face; 6], level: i64, g: [i64; 3], cell_origin: [f64; 3], s: f64,
    occupied: &HashSet<(i64, i64, i64, i64)>, refined_at: &HashSet<(i64, i64, i64, i64)>,
    rows: &mut Vec<(u32, Value)>,
) {
    for &face in &FACES {
        let fd = FACE_DIR[face];
        // 跨层 finer-owns:同层该向邻格若自身被细化,它(的子)拥有共享平面 → 跳过。
        if refined_at.contains(&pos_key(level, [g[0] + fd[0], g[1] + fd[1], g[2] + fd[2]])) {
            continue;
        }
        // 同层相邻消除:负向面若邻格被占 → 跳过。
        if let Some(nd) = neg_dir(face) {
            if occupied.contains(&pos_key(level, [g[0] + nd[0], g[1] + nd[1], g[2] + nd[2]])) {
                continue;
            }
        }
        let pieces = match get_variant(&faces[face]) {
            Some(p) => p,
            None => continue,
        };
        for p in &pieces {
            let (size, center) = part_to_box(face, p, s, BASIC_THICKNESS);
            let row = json!([
                size,
                [cell_origin[0] + center[0], cell_origin[1] + center[1], cell_origin[2] + center[2]],
                [0.0, 0.0, 0.0],
                0, [1, 1], 0, 1
            ]);
            rows.push((WALL, row));
        }
    }
}

/// 展开一组同层兄弟 cell。`parent_faces`(为 refinement 时)驱动逐子面继承;
/// 递归进每个 cell 的 refinement——被细化的 cell 自身不出几何,子拥有其平面(finer-owns)。
/// (B1:maxLevel/budget = ∞,即有 refinement 必递归;LOD 门控为后续。)
fn expand_chunk(
    cells: &[Value], chunk_origin: [f64; 3], parent_faces: Option<&[Face; 6]>,
    bx: i64, by: i64, seq: &mut i64, rows: &mut Vec<(u32, Value)>,
) {
    let mut occupied: HashSet<(i64, i64, i64, i64)> = HashSet::new();
    let mut refined_at: HashSet<(i64, i64, i64, i64)> = HashSet::new();
    for c in cells {
        let lvl = c.get("level").and_then(|x| x.as_i64()).unwrap_or(0);
        let g = cell_grid(c);
        occupied.insert(pos_key(lvl, g));
        if refinement_cells(c).map_or(false, |rc| !rc.is_empty()) {
            refined_at.insert(pos_key(lvl, g));
        }
    }

    for cell in cells {
        let level = cell.get("level").and_then(|x| x.as_i64()).unwrap_or(0);
        let g = cell_grid(cell);
        let faces = resolve_faces(cell, bx, by, *seq, parent_faces.map(|pf| (pf, g)));
        *seq += 1;
        let s = cell_size(level);
        let cell_origin = [
            chunk_origin[0] + g[0] as f64 * s,
            chunk_origin[1] + g[1] as f64 * s,
            chunk_origin[2] + g[2] as f64 * s,
        ];

        match refinement_cells(cell) {
            Some(rc) if !rc.is_empty() => {
                // 几何交给更细的子(它们继承 faces)。
                expand_chunk(rc, cell_origin, Some(&faces), bx, by, seq, rows);
            }
            _ => emit_leaf(&faces, level, g, cell_origin, s, &occupied, &refined_at, rows),
        }

        // cell trigger 填满整个 cell 体积(无论叶子还是细化)。
        if let Some(trig) = cell.get("trigger").and_then(|x| x.as_array()) {
            if !trig.is_empty() {
                let row = json!([
                    [s, s, s],
                    [cell_origin[0] + s / 2.0, cell_origin[1] + s / 2.0, cell_origin[2] + s / 2.0],
                    [0.0, 0.0, 0.0], 1, 0, trig
                ]);
                rows.push((TRIGGER, row));
            }
        }
    }
}

/// 展开一个 b6 raw 行 → 标准行 `[(typeId, row)]`(basic 主题)。
pub fn expand_spp(raw: &Value, bx: i64, by: i64) -> Vec<(u32, Value)> {
    let a = match raw.as_array() {
        Some(a) => a,
        None => return vec![],
    };
    let origin = a.get(0).and_then(|x| x.as_array()).map(|o| {
        [
            o.first().and_then(|x| x.as_f64()).unwrap_or(0.0),
            o.get(1).and_then(|x| x.as_f64()).unwrap_or(0.0),
            o.get(2).and_then(|x| x.as_f64()).unwrap_or(0.0),
        ]
    }).unwrap_or([0.0, 0.0, 0.0]);
    let cells = match a.get(1).and_then(|x| x.as_array()) {
        Some(c) => c,
        None => return vec![],
    };
    let theme = a.get(2).and_then(|x| x.as_str()).unwrap_or("basic");
    assert_eq!(theme, "basic", "B1 只支持 basic 主题;其它主题为后续 slice");

    let mut rows: Vec<(u32, Value)> = Vec::new();
    let mut seq: i64 = 0;
    expand_chunk(cells, origin, None, bx, by, &mut seq, &mut rows);
    rows
}

fn cell_grid(c: &Value) -> [i64; 3] {
    c.get("position")
        .and_then(|x| x.as_array())
        .map(|p| {
            [
                p.first().and_then(|x| x.as_i64()).unwrap_or(0),
                p.get(1).and_then(|x| x.as_i64()).unwrap_or(0),
                p.get(2).and_then(|x| x.as_i64()).unwrap_or(0),
            ]
        })
        .unwrap_or([0, 0, 0])
}
