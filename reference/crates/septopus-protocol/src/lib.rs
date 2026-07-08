//! septopus-protocol — clean-room 解码层。
//!
//! 按 `protocol/cn/block.md` §3(5 槽块 raw)与 `protocol/cn/adjunct-types.md`
//! (逐槽位)把地块 raw 解成 canonical 世界状态(Septopus 轴序)。这一层是差分裁判
//! 的"规范翻译",只准照协议手写、不得参照 TS 引擎源。
//!
//! B0 范围:5 槽块 + 标准 7 槽几何族(a1/a2/a5/a6/a7)。展开(b6/c2)在 septopus-expand
//! (B1+),动态语义(b8/actuator)在 septopus-sim(B3+)。

use serde_json::Value;

/// 标准 7 槽几何族:`[size, pos, rot, resource, repeat, animation, stop]`。
/// a2 恒 solid;其余按 slot6 `stop` 非空判 solid。见 adjunct-types.md §2。
pub const WALL: u32 = 0x00a1;
pub const BOX: u32 = 0x00a2;
pub const WATER: u32 = 0x00a5;
pub const CONE: u32 = 0x00a6;
pub const BALL: u32 = 0x00a7;
pub const TRIGGER: u32 = 0x00b8; // b8:[size,offset,rot,shape,gameOnly,events]
const STANDARD_7: [u32; 5] = [WALL, BOX, WATER, CONE, BALL];

/// canonical 定点缩放:位置/旋转/尺寸入哈希前量化到 1e-4(见 bevy-reference-engine.md §4.3)。
/// 几何推导尽量走有理量,量化只当消 fp 噪声的安全网。
pub const QUANT: f64 = 10_000.0;
pub fn q(v: f64) -> i64 {
    (v * QUANT).round() as i64
}

/// 一个 canonical 世界实体记录(进状态哈希的最小语义单位)。
#[derive(Debug, Clone)]
pub struct Entity {
    pub type_id: u32,
    /// 源稳定键;authored 实体为空串,派生实体(SPP/motif)带来源(B1+)。
    pub derived_from: String,
    pub pos: [i64; 3],  // 量化,Septopus 轴序 [E,N,Alt]
    pub rot: [i64; 3],  // 量化,引擎系 Euler(见 adjunct-types.md §0)
    pub size: [i64; 3], // 量化,Septopus 尺寸 [E,N,Alt]
    pub resource: i64,
    pub solid: bool,
    /// 类型尾:非几何的显著语义(标准 7 槽为空;b8 = 触发器 shape/gameOnly/事件签名)。
    /// 见 bevy-reference-engine.md §4.1「类型显著属性尾」。
    pub tail: Vec<u8>,
    /// authoring 稳定序(组序 + 行序展平);排序并列时的最后 tiebreak。
    pub seq: u32,
}

/// 一个 canonical 块状态。B0 无 flags/派生;后续里程碑扩展。
#[derive(Debug, Clone)]
pub struct BlockState {
    pub block: [i64; 2],
    pub elevation: i64, // 量化
    pub game: i64,
    pub entities: Vec<Entity>,
}

fn f(v: Option<&Value>, def: f64) -> f64 {
    v.and_then(|x| x.as_f64()).unwrap_or(def)
}
/// solid 判定用的 truthy(与 JS `!!x` 对齐)。协议 §0 写"slot6 stop 非空即 solid",
/// 但没说 `0` 算不算——真引擎按 truthy(stop=0 不 solid)。此处钉成 truthy;
/// 该措辞歧义已记入迁移 P0 待收敛(full-data-migration.md §3/C3)。
fn is_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map_or(true, |x| x != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true, // array/object 非空对象 → truthy(与 JS 一致)
    }
}
fn arr3(v: Option<&Value>, def: [f64; 3]) -> [f64; 3] {
    match v {
        Some(Value::Array(a)) if a.len() >= 3 => {
            [f(a.get(0), def[0]), f(a.get(1), def[1]), f(a.get(2), def[2])]
        }
        _ => def,
    }
}

/// 解一个 5 槽块 raw + 块坐标 → canonical 块状态(缺槽取缺省,永不 panic)。
pub fn decode_block(raw: &Value, block: [i64; 2]) -> BlockState {
    let arr = raw.as_array().cloned().unwrap_or_default();
    let elevation = q(f(arr.get(0), 0.0));
    let game = arr.get(4).and_then(|x| x.as_i64()).unwrap_or(0);

    let mut entities = Vec::new();
    let mut seq: u32 = 0;
    if let Some(Value::Array(groups)) = arr.get(2) {
        for g in groups {
            let ga = match g.as_array() {
                Some(a) => a,
                None => continue,
            };
            let type_id = ga.get(0).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let rows = match ga.get(1).and_then(|x| x.as_array()) {
                Some(r) => r,
                None => continue,
            };
            for row in rows {
                let this_seq = seq;
                seq += 1; // authoring 序按所有行推进(含未建模类型),保证稳定
                if let Some(ent) = decode_row(type_id, row, this_seq) {
                    entities.push(ent);
                }
            }
        }
    }
    BlockState {
        block,
        elevation,
        game,
        entities,
    }
}

/// 从展开器输出 `[(typeId, row)]` 构建块状态(SPP/motif 派生行的差分对拍用)。
/// derivedFrom 在展开器层面为空串(BlockSystem 才赋源 id,那是 B4/关卡层的事)。
pub fn state_from_rows(block: [i64; 2], rows: &[(u32, Value)]) -> BlockState {
    let mut entities = Vec::new();
    for (i, (type_id, row)) in rows.iter().enumerate() {
        if let Some(ent) = decode_row(*type_id, row, i as u32) {
            entities.push(ent);
        }
    }
    BlockState {
        block,
        elevation: 0,
        game: 0,
        entities,
    }
}

/// 一行 → canonical 实体:标准 7 槽族 + b8 触发器(带事件签名 tail);其余返回 None。
pub fn decode_row(type_id: u32, row: &Value, seq: u32) -> Option<Entity> {
    let ra = row.as_array()?;
    let size = arr3(ra.get(0), [1.0, 1.0, 1.0]);
    let pos = arr3(ra.get(1), [0.0, 0.0, 0.0]);
    let rot = arr3(ra.get(2), [0.0, 0.0, 0.0]);
    let (resource, solid, tail) = if STANDARD_7.contains(&type_id) {
        (
            ra.get(3).and_then(|x| x.as_i64()).unwrap_or(0),
            type_id == BOX || ra.get(6).map_or(false, is_truthy),
            Vec::new(),
        )
    } else if type_id == TRIGGER {
        // b8: [size, offset, rot, shape, gameOnly, events]
        let shape = ra.get(3).and_then(|x| x.as_i64()).unwrap_or(1);
        let game_only = ra.get(4).and_then(|x| x.as_i64()).unwrap_or(0);
        let ev = trigger_event_sig(ra.get(5));
        (0, false, format!("shape={shape}|game={game_only}|ev={ev}").into_bytes())
    } else {
        return None; // 未建模类型(module/light/item/…)后续里程碑补
    };
    Some(Entity {
        type_id,
        derived_from: String::new(),
        pos: [q(pos[0]), q(pos[1]), q(pos[2])],
        rot: [q(rot[0]), q(rot[1]), q(rot[2])],
        size: [q(size[0]), q(size[1]), q(size[2])],
        resource,
        solid,
        tail,
        seq,
    })
}

/// 触发器事件的结构签名:`type:actType.method,…;…`(逐节点、逐动作,顺序保留)。
/// 事件由源(b6 cell.trigger / authored)逐字节透传,两引擎必产出同一签名——结构签名
/// 足够且比 canonical-JSON 易对齐(不掺 target/params 的格式差异)。
fn trigger_event_sig(events: Option<&Value>) -> String {
    let arr = match events.and_then(|x| x.as_array()) {
        Some(a) => a,
        None => return String::new(),
    };
    let mut parts = Vec::new();
    for node in arr {
        let ty = node.get("type").and_then(|x| x.as_str()).unwrap_or("");
        let acts = node.get("actions").and_then(|x| x.as_array()).cloned().unwrap_or_default();
        let asig: Vec<String> = acts
            .iter()
            .map(|a| {
                let at = a.get("type").and_then(|x| x.as_str()).unwrap_or("");
                let am = a.get("method").and_then(|x| x.as_str()).unwrap_or("");
                format!("{at}.{am}")
            })
            .collect();
        parts.push(format!("{ty}:{}", asig.join(",")));
    }
    parts.join(";")
}
