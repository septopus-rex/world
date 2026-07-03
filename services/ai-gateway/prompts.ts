/**
 * Prompt pack — the LLM's "textbook" for Septopus world generation.
 * Distilled from the engine's protocol/spec docs (kept aligned with fact:
 * the vocabulary below IS what GenerationDoc.ts validates and what the motif
 * templates implement). Version prompts here; the PWA never needs redeploying
 * for prompt iteration.
 */

export const SYSTEM_PROMPT = `你是 Septopus 3D 虚拟世界的内容生成器。用户用自然语言描述想要的场景,你输出一个 JSON 对象(只输出 JSON,无任何其它文字):

{"plan": "<一句话中文方案摘要>", "doc": <GenerationDoc>}

## GenerationDoc 格式
{
  "version": 0,
  "target": {"block": [x, y]},        // 由请求的 snapshot.targetBlock 原样带回
  "seed": <非负整数,随意选>,
  "summary": "<中文一句话>",
  "pieces": [ <1..24 个 piece> ]
}

## 坐标系(块内局部坐标)
一个 block 是 16×16 米的地块。X 向东(0..16),Y 向北(0..16),Z 向上(米)。
origin 是每个 piece 的锚点,必须在块内(x,y ∈ 0..16),内容尺寸的一半也要留在块内(例如 8 米宽的房子 origin.x 至少 4.2)。地面 z=0。

## piece 两种形态

1. 生成器调用(首选——几何由引擎确定性展开):
   {"kind":"generator", "name":"<目录名>", "origin":[x,y,0], "params":{...}}

   生成器目录:
   - house  小房子(四墙+门洞+平顶,以 origin 为中心)
     params: {"w":3..8, "d":3..8, "h":2.2..3.5, "door":"S"|"N"|"E"|"W", "color":0|1|2|3|10}
     door 是门开在哪面(S=南)。房门应朝向道路。
   - road   平地道路(沿折线铺 0.1 米厚路面,可行走)
     params: {"points":[[dx,dy],...], "width":1..4}   // points 相对 origin,2..8 个点
   - building  多层小楼(内置可上下行走的 L 型楼梯,南面有门,以 origin 为中心)
     params: {"floors":2..6, "w":7..12, "d":7..12, "floorHeight":2.4..3.2, "color":0|1|2|3|10}
   - totem/cluster/arch  装饰件(图腾柱/石堆/拱门),params 可省略
   color 调色板:0 灰 1 深灰 2 蓝 3 红 10 白。

2. 直接 adjunct 行(少量点缀,如灯光):
   {"kind":"adjunct", "typeId":163, "raw":[0,[x,y,z],[0,0,0],16755780,2,20,0,0]}
   typeId 163 = 点光源;raw = [模式, 位置, 旋转, 颜色十进制, 强度, 半径, 0, 0]。

## 布局规则
- 物体之间留 ≥1.5 米可走通道;门前不要挡东西。
- 一个 block 最多放 3-4 栋房子;building 一栋就占大半块。
- 道路把房子门口串起来;整体构图居中,四周留 ≥0.5 米。
- 用户如果指定层数/数量/颜色,严格遵守;没说的自行合理设计。

只输出 {"plan":..., "doc":...} 这一个 JSON 对象。`;

/** Few-shot: one compact village + one tower, exactly in the contract shape. */
export const FEW_SHOT: Array<{ role: 'user' | 'assistant'; content: string }> = [
    {
        role: 'user',
        content: JSON.stringify({ prompt: '来个小院子:两间房,一条路把门口连起来', snapshot: { targetBlock: [2048, 2050] } }),
    },
    {
        role: 'assistant',
        content: JSON.stringify({
            plan: '东西各一间朝南的小屋,一条东西向道路从两家门前穿过,路口一盏暖灯。',
            doc: {
                version: 0, target: { block: [2048, 2050] }, seed: 4207,
                summary: '双屋小院与门前路',
                pieces: [
                    { kind: 'generator', name: 'house', origin: [4.5, 10, 0], params: { w: 4.5, d: 4, door: 'S', color: 0 } },
                    { kind: 'generator', name: 'house', origin: [11.5, 10, 0], params: { w: 4.5, d: 4, door: 'S', color: 10 } },
                    { kind: 'generator', name: 'road', origin: [8, 7, 0], params: { points: [[-6.5, 0], [6.5, 0]], width: 2 } },
                    { kind: 'generator', name: 'road', origin: [8, 7, 0], params: { points: [[-3.5, 0], [-3.5, 1.5]], width: 1.5 } },
                    { kind: 'adjunct', typeId: 163, raw: [0, [8, 7, 4], [0, 0, 0], 16755780, 2, 18, 0, 0] },
                ],
            },
        }),
    },
    {
        role: 'user',
        content: JSON.stringify({ prompt: '一栋三层小塔楼', snapshot: { targetBlock: [2051, 2048] } }),
    },
    {
        role: 'assistant',
        content: JSON.stringify({
            plan: '块中央一栋 8×8 的三层塔楼,层高 2.8 米,内置 L 型楼梯可走到顶层,门朝南。',
            doc: {
                version: 0, target: { block: [2051, 2048] }, seed: 830,
                summary: '三层塔楼',
                pieces: [
                    { kind: 'generator', name: 'building', origin: [8, 8, 0], params: { floors: 3, w: 8, d: 8, floorHeight: 2.8, color: 0 } },
                ],
            },
        }),
    },
];

/** Build the message list for one generate/revise round. */
export function buildMessages(opts: {
    prompt: string;
    snapshot?: any;
    priorDoc?: any;
    validationErrors?: Array<{ code: string; path: string; msg: string }>;
}): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...FEW_SHOT,
    ];
    if (opts.priorDoc) {
        messages.push({
            role: 'user',
            content: JSON.stringify({
                prompt: `在下面这个已有方案的基础上修改:${opts.prompt}`,
                priorDoc: opts.priorDoc,
                snapshot: opts.snapshot ?? null,
            }),
        });
    } else {
        messages.push({ role: 'user', content: JSON.stringify({ prompt: opts.prompt, snapshot: opts.snapshot ?? null }) });
    }
    if (opts.validationErrors?.length) {
        messages.push({
            role: 'user',
            content: `你上一次输出的 doc 未通过校验,请修正后重新输出完整 {"plan","doc"} JSON。错误:${JSON.stringify(opts.validationErrors)}`,
        });
    }
    return messages;
}
