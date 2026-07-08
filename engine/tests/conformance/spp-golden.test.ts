import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expandSpp } from '../../src/core/spp/Expander';
// @ts-expect-error — canonical.mjs is plain JS (逐字节镜像 Rust 侧哈希),无类型
import { hashExpandedRows } from './canonical.mjs';

// SPP 展开的 golden 对拍(TS 侧 = 真引擎 expandSpp;Rust 侧 = clean-room expand_spp)。
// 差分裁判:两侧对同一 b6 行必产出同一状态哈希(见 bevy-reference-engine.md §5)。
// GEN=1 时把真引擎算出的哈希写回 vector.expect(生成 golden);否则断言一致(CI 用)。

const GOLDEN = fileURLToPath(new URL('../golden', import.meta.url));
const GEN = !!process.env.GEN;

const vectors = readdirSync(GOLDEN)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: `${GOLDEN}/${f}`, doc: JSON.parse(readFileSync(`${GOLDEN}/${f}`, 'utf8')) }))
    .filter((v) => v.doc?.input?.kind === 'spp');

describe('SPP expansion golden — real engine expandSpp', () => {
    for (const { file, doc } of vectors) {
        it(doc.name, () => {
            const coord = doc.input.coord ?? [0, 0];
            const rows = expandSpp(doc.input.raw as any, { blockX: coord[0], blockY: coord[1] });
            const h = hashExpandedRows(coord, rows);
            if (GEN) {
                doc.expect = { ...(doc.expect ?? {}), stateHash: h };
                writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
                // eslint-disable-next-line no-console
                console.log(`wrote ${doc.name}  ${h}  (${rows.length} rows)`);
            } else {
                expect(h).toBe(doc.expect?.stateHash);
            }
        });
    }
});
