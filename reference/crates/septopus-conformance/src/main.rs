//! septopus-conformance — 差分裁判 CLI。
//!
//! 用法:
//!   septopus-conformance <dir|file> [--emit]
//!     缺省    读 golden vector,算 canonical 哈希,与 expect.stateHash 对拍;有不一致则退出码 1。
//!     --emit  只打印每个 vector 的实算哈希(供人核对 / 生成期望值)。
//!
//! golden vector 格式见 bevy-reference-engine.md §5。B0 只判 steps=0 的纯展开/静态块。

use septopus_expand::motif::expand_motif;
use septopus_expand::spp::expand_spp;
use septopus_protocol::{decode_block, state_from_rows};
use serde_json::Value;
use std::{env, fs, path::Path, process::exit};

mod hash;

fn main() {
    let args: Vec<String> = env::args().collect();
    let emit = args.iter().any(|a| a == "--emit");
    let path = args
        .iter()
        .skip(1)
        .find(|a| !a.starts_with("--"))
        .cloned()
        .unwrap_or_else(|| "../engine/tests/golden".to_string());

    let files = collect_vectors(&path);
    if files.is_empty() {
        eprintln!("no golden vectors under {path}");
        exit(2);
    }

    let (mut pass, mut fail) = (0u32, 0u32);
    for f in &files {
        let text = fs::read_to_string(f).unwrap_or_else(|e| panic!("read {f}: {e}"));
        let v: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {f}: {e}"));
        let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("?");
        let steps = v.get("steps").and_then(|x| x.as_u64()).unwrap_or(0);
        if steps != 0 {
            println!("SKIP {name}  (steps={steps}; 动态语义 B3+ 才支持)");
            continue;
        }
        let input = v.get("input").expect("vector.input");
        let coord = input
            .get("coord")
            .and_then(|c| c.as_array())
            .map(|a| {
                [
                    a.first().and_then(|x| x.as_i64()).unwrap_or(0),
                    a.get(1).and_then(|x| x.as_i64()).unwrap_or(0),
                ]
            })
            .unwrap_or([0, 0]);
        let raw = input.get("raw").expect("vector.input.raw");
        let kind = input.get("kind").and_then(|x| x.as_str()).unwrap_or("block");

        // block → 解码;spp → 展开 b6 行成派生标准行,再算状态哈希(见 bevy-reference-engine.md §5)。
        let state = match kind {
            "spp" => state_from_rows(coord, &expand_spp(raw, coord[0], coord[1])),
            "motif" => state_from_rows(coord, &expand_motif(raw)),
            _ => decode_block(raw, coord),
        };
        let got = hash::canonical_hash(&state);

        if emit {
            println!("{name}  {got}  ({} ents)", state.entities.len());
            continue;
        }
        let want = v
            .get("expect")
            .and_then(|e| e.get("stateHash"))
            .and_then(|x| x.as_str())
            .unwrap_or("");
        if want == got {
            pass += 1;
            println!("PASS {name}  {got}");
        } else {
            fail += 1;
            println!("FAIL {name}\n  want {want}\n  got  {got}");
        }
    }

    if !emit {
        println!("\n{pass} passed, {fail} failed");
        if fail > 0 {
            exit(1);
        }
    }
}

fn collect_vectors(path: &str) -> Vec<String> {
    let p = Path::new(path);
    if p.is_file() {
        return vec![path.to_string()];
    }
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(p) {
        for e in rd.flatten() {
            let pp = e.path();
            if pp.extension().map_or(false, |x| x == "json") {
                out.push(pp.to_string_lossy().to_string());
            }
        }
    }
    out.sort();
    out
}
