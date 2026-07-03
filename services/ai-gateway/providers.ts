/**
 * LLM provider adapters. One interface, N backends — the gateway's reason to
 * exist. `mock` answers deterministically from keywords (CI / e2e never hits
 * a real API); `qwen` speaks DashScope's OpenAI-compatible endpoint.
 */

export interface LlmProvider {
    readonly name: string;
    /** One chat round; returns the raw assistant text (expected to be JSON). */
    complete(messages: Array<{ role: string; content: string }>): Promise<string>;
}

// ── mock ────────────────────────────────────────────────────────────────────
/** Keyword-routed canned responses in the exact contract shape. */
export function mockProvider(): LlmProvider {
    return {
        name: 'mock',
        async complete(messages) {
            const last = messages[messages.length - 1]?.content ?? '';
            let prompt = last, block: [number, number] = [2048, 2050];
            try {
                const parsed = JSON.parse(messages.filter((m) => m.role === 'user').pop()!.content);
                prompt = parsed.prompt ?? last;
                block = parsed.snapshot?.targetBlock ?? parsed.priorDoc?.target?.block ?? block;
            } catch { /* raw prompt */ }

            if (/楼|building|层/.test(prompt)) {
                const floors = Math.min(6, Math.max(2, parseInt(prompt.match(/(\d+)\s*层/)?.[1] ?? '5', 10)));
                return JSON.stringify({
                    plan: `块中央一栋 ${floors} 层小楼,内置可上下的 L 型楼梯,门朝南。`,
                    doc: {
                        version: 0, target: { block }, seed: 7,
                        summary: `${floors} 层小楼`,
                        pieces: [
                            { kind: 'generator', name: 'building', origin: [8, 8, 0], params: { floors, w: 8, d: 8, floorHeight: 2.8, color: 0 } },
                        ],
                    },
                });
            }
            // default: the village
            return JSON.stringify({
                plan: '三间朝南的小屋沿北侧排开,一条东西主路串起门前,路口一盏暖灯。',
                doc: {
                    version: 0, target: { block }, seed: 4207,
                    summary: '有路有房子的小村庄',
                    pieces: [
                        { kind: 'generator', name: 'house', origin: [3.2, 11, 0], params: { w: 4, d: 4, door: 'S', color: 0 } },
                        { kind: 'generator', name: 'house', origin: [8, 11.5, 0], params: { w: 4.5, d: 4, door: 'S', color: 10 } },
                        { kind: 'generator', name: 'house', origin: [12.8, 11, 0], params: { w: 4, d: 4, door: 'S', color: 2 } },
                        { kind: 'generator', name: 'road', origin: [8, 8, 0], params: { points: [[-7, 0], [7, 0]], width: 2.2 } },
                        { kind: 'generator', name: 'road', origin: [8, 8, 0], params: { points: [[0, 0], [0, 1.4]], width: 1.4 } },
                        { kind: 'adjunct', typeId: 163, raw: [0, [8, 8, 4.5], [0, 0, 0], 16755780, 2, 20, 0, 0] },
                    ],
                },
            });
        },
    };
}

// ── qwen (DashScope, OpenAI-compatible) ─────────────────────────────────────
export function qwenProvider(apiKey: string, model = process.env.QWEN_MODEL || 'qwen-plus'): LlmProvider {
    return {
        name: `qwen(${model})`,
        async complete(messages) {
            const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.4,                      // geometry wants discipline, not flair
                    response_format: { type: 'json_object' },
                    max_tokens: 2500,
                }),
            });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`qwen HTTP ${res.status}: ${body.slice(0, 300)}`);
            }
            const data: any = await res.json();
            const text = data?.choices?.[0]?.message?.content;
            if (typeof text !== 'string') throw new Error('qwen: empty completion');
            return text;
        },
    };
}

export function makeProvider(): LlmProvider {
    const kind = (process.env.PROVIDER || 'mock').toLowerCase();
    if (kind === 'qwen') {
        const key = process.env.DASHSCOPE_API_KEY;
        if (!key) throw new Error('PROVIDER=qwen requires DASHSCOPE_API_KEY');
        return qwenProvider(key);
    }
    return mockProvider();
}
