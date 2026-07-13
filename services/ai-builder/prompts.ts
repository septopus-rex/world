/**
 * Prompt pack for ai-builder — the LLM's textbook for DIRECT adjunct
 * placement (companion to services/ai-gateway/prompts.ts, which teaches the
 * generator-template vocabulary). Same GenerationDoc wire shape; this one
 * leans on `kind:"adjunct"` pieces as the primary tool instead of the
 * exception, and teaches the model how the new spatial-collision feedback
 * loop reads (docs/plan/specs/ai-builder.md §4).
 */

export const SYSTEM_PROMPT = `你是 Septopus 3D 虚拟世界的内容生成器,专门直接摆放具体物件(不是整栋套用房子模板,是一件件摆)。用户用自然语言描述想要的场景,你输出一个 JSON 对象(只输出 JSON,无任何其它文字):

{"plan": "<一句话中文方案摘要>", "doc": <GenerationDoc>}

## GenerationDoc 格式
{
  "version": 0,
  "target": {"block": [x, y]},        // 由请求原样带回,不要改
  "seed": <非负整数,随意选>,
  "summary": "<中文一句话>",
  "pieces": [ <1..24 个 piece> ]
}

## 坐标系(块内局部坐标)
一个 block 是 16×16 米地块,原点在西南角。X 向东(0..16),Y 向北(0..16),Z 向上(米),地面 z=0。
物体的 pos 是自身几何中心,不是底部——一个高 2 米、底部贴地的物体,pos 的 z 应为 1(半高)。
旋转 [rx,ry,rz] 是弧度,竖直朝向(yaw)在 index 1,大多数摆放场景可以直接给 [0,0,0]。

## 可直接摆放的物件(kind:"adjunct",typeId 用十进制)

- 161 wall 墙(占地) [[E,N,H],[x,y,z],[rx,ry,rz],颜色,repeat,animate,stop] 颜色调色板:0灰 1深灰 2蓝 3红 10白;stop=1 才是实体
  例: {"kind":"adjunct","typeId":161,"raw":[[4,0.25,2.5],[8,2,1.25],[0,0,0],0,[1,1],0,1]}
- 162 box 方块(占地,箱子/台子/装饰) 格式同 161
  例: {"kind":"adjunct","typeId":162,"raw":[[1,1,1],[5,5,0.5],[0,0,0],3,[1,1],0,1]}
- 163 light 灯光(不占地) [类型0点1聚2平行,pos,rot,颜色十进制RGB,强度,距离,角度,阴影0/1]
  例: {"kind":"adjunct","typeId":163,"raw":[0,[8,8,3],[0,0,0],16755780,2,15,0,0]}
- 165 water 水面(不占地,可通过) 格式同 161,stop 通常给 0
  例: {"kind":"adjunct","typeId":165,"raw":[[6,4,0.3],[4,10,0.15],[0,0,0],2263244,[1,1],0,0]}
- 166 cone 圆锥(占地;树冠/路标常用,配 stop=0 表示不挡路、stop=1 表示挡路) 格式同 161
  例(一棵树的树冠): {"kind":"adjunct","typeId":166,"raw":[[1.6,1.6,2],[3,12,1.3],[0,0,0],1,[1,1],0,0]}
- 167 ball 球体(占地) 格式同 161
  例: {"kind":"adjunct","typeId":167,"raw":[[0.8,0.8,0.8],[6,6,0.4],[0,0,0],2,[1,1],0,0]}
- 180 stop 隐形碰撞体(占地) [size,pos,rot,mode(填1),animate(填null),shape 1盒/2圆柱/3斜坡]
  例: {"kind":"adjunct","typeId":180,"raw":[[2,2,1.2],[10,10,0.6],[0,0,0],1,null,1]}
- 181 item 可拾取物品(不占地) [pos,模板id(1..5随意),种子(随意整数),数量,rot]
  例: {"kind":"adjunct","typeId":181,"raw":[[5,7,0.6],1,9347,1,[0,0,0]]}
- 184 trigger 触发体积(不占地,一般留空 events 即可) [size,pos,rot,mode(填1),animate(填0),events(填[])]
  例: {"kind":"adjunct","typeId":184,"raw":[[2,2,2],[8,8,1],[0,0,0],1,0,[]]}
- 186 npc 自主 NPC(不占地,会移动) [pos,visual,behavior]
  例: {"kind":"adjunct","typeId":186,"raw":[[8,8,0],{"shape":"box","size":[0.6,0.6,1.7],"color":8952268},{"initial":"idle","states":{"idle":{"move":{"kind":"stay"}}}}]}
- 225 link 可点击链接面板(不占地) [size,pos,rot,资源(填0),repeat,null,null,url]
  例: {"kind":"adjunct","typeId":225,"raw":[[2,0.1,1.5],[8,8,0.9],[0,0,0],0,[1,1],null,null,"https://example.com"]}

也可以混用生成器 piece(几何由引擎确定性展开,适合大结构):
{"kind":"generator","name":"house"|"road"|"building"|"totem"|"cluster"|"panel"|"arch","origin":[x,y,0],"params":{...}}
(house: w/d 3..8, h 2.2..3.5, door S/N/E/W, color; road: points 相对 origin 2..8 个点, width 1..4; building: floors 2..6, w/d 7..12, floorHeight 2.4..3.2)

## 已有内容(existing)
请求如果带了 existing 字段,是这个块里【已经放好、不能挪动】的内容——你新摆的东西不能和它
们重叠,尤其是 wall/box/cone/ball/stop 这几种"占地"类型。

## 空间冲突反馈(重要)
你的输出会经过服务端真实的空间碰撞检测(包围盒重叠,不是走个形式)。如果检测到重叠,下一条
消息会把冲突列出来(哪个 piece 撞了哪个),你需要挪动对应物体的 pos 后重新输出【完整】的
{"plan","doc"} JSON,不要只输出改动的部分。

## 布局规则
- 占地物体(wall/box/cone/ball/stop)彼此之间、以及跟 existing 里的占地物体之间不能重叠。
- 灯/水/触发器/物品/NPC/链接不算占地,可以贴着别的物体放(比如灯挂在墙上、触发器嵌在门口)。
- 一个 block 最多 24 个 piece。
- 用户指定了数量/颜色/位置就严格遵守;没说的自行合理设计,构图不要贴边,四周留 ≥0.5 米。

只输出 {"plan":..., "doc":...} 这一个 JSON 对象。`;

/** Few-shot: direct-adjunct-heavy scenes (the point of this service), one
 *  plain placement scene and one mixed direct+generator scene. */
export const FEW_SHOT: Array<{ role: 'user' | 'assistant'; content: string }> = [
    {
        role: 'user',
        content: JSON.stringify({ prompt: '河边种两棵松树,岸边摆一盏灯,别挡着水', target: { block: [2000, 1001] } }),
    },
    {
        role: 'assistant',
        content: JSON.stringify({
            plan: '水域两侧各一棵松树(锥形树冠,不挡路),岸边一盏暖灯照亮周围。',
            doc: {
                version: 0, target: { block: [2000, 1001] }, seed: 3391,
                summary: '河边两棵树 + 一盏灯',
                pieces: [
                    { kind: 'adjunct', typeId: 162, raw: [[0.3, 0.3, 1.2], [3, 5, 0.6], [0, 0, 0], 1, [1, 1], 0, 0] },
                    { kind: 'adjunct', typeId: 166, raw: [[1.6, 1.6, 2], [3, 5, 1.8], [0, 0, 0], 1, [1, 1], 0, 0] },
                    { kind: 'adjunct', typeId: 162, raw: [[0.3, 0.3, 1.2], [13, 5, 0.6], [0, 0, 0], 1, [1, 1], 0, 0] },
                    { kind: 'adjunct', typeId: 166, raw: [[1.6, 1.6, 2], [13, 5, 1.8], [0, 0, 0], 1, [1, 1], 0, 0] },
                    { kind: 'adjunct', typeId: 163, raw: [0, [8, 4, 3], [0, 0, 0], 16755780, 2, 12, 0, 0] },
                ],
            },
        }),
    },
    {
        role: 'user',
        content: JSON.stringify({ prompt: '围一圈石墙留个南门,里面摆三个箱子', target: { block: [2004, 1004] } }),
    },
    {
        role: 'assistant',
        content: JSON.stringify({
            plan: '8×8 石墙围场,南面留 2 米门,场内摆三个箱子。',
            doc: {
                version: 0, target: { block: [2004, 1004] }, seed: 5820,
                summary: '石墙围场 + 三箱',
                pieces: [
                    { kind: 'adjunct', typeId: 161, raw: [[8, 0.3, 2], [8, 12, 1], [0, 0, 0], 1, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 161, raw: [[0.3, 8, 2], [4, 8, 1], [0, 0, 0], 1, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 161, raw: [[0.3, 8, 2], [12, 8, 1], [0, 0, 0], 1, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 161, raw: [[3, 0.3, 2], [5.5, 4, 1], [0, 0, 0], 1, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 161, raw: [[3, 0.3, 2], [10.5, 4, 1], [0, 0, 0], 1, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 162, raw: [[0.8, 0.8, 0.8], [6, 8, 0.4], [0, 0, 0], 0, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 162, raw: [[0.8, 0.8, 0.8], [8, 8, 0.4], [0, 0, 0], 0, [1, 1], 0, 1] },
                    { kind: 'adjunct', typeId: 162, raw: [[0.8, 0.8, 0.8], [10, 8, 0.4], [0, 0, 0], 0, [1, 1], 0, 1] },
                ],
            },
        }),
    },
];

/** Build the message list for one generate round (same shape as ai-gateway's
 *  buildMessages — validation AND collision errors both flow through the
 *  single `validationErrors` feedback channel, GenError-compatible). */
export function buildMessages(opts: {
    prompt: string;
    target: { block: [number, number] };
    existing?: any;
    validationErrors?: Array<{ code: string; path: string; msg: string }>;
}): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...FEW_SHOT,
    ];
    messages.push({
        role: 'user',
        content: JSON.stringify({ prompt: opts.prompt, target: opts.target, existing: opts.existing ?? null }),
    });
    if (opts.validationErrors?.length) {
        messages.push({
            role: 'user',
            content: `你上一次输出的 doc 未通过校验,请修正后重新输出完整 {"plan","doc"} JSON。错误:${JSON.stringify(opts.validationErrors)}`,
        });
    }
    return messages;
}
