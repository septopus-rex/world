import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
FRAMES = [
    ('pal1_f1.png', '① 0.6s: 单胞晶格诞生\n灵力粒子定标 4m 客栈空间网格'),
    ('pal1_f2.png', '② 2.2s: 叠加态坍缩成型\n波函数自底向上实体化地板与花窗'),
    ('pal1_f3.png', '③ 4.2s: 青瓦大屋顶就位\n三开间歇山顶起翘飞檐降落锁定'),
    ('pal1_f4.png', '④ 6.0s: 多 SPP 空间混排\n幽篁合院月亮门与外部长街展开'),
    ('pal1_f5.png', '⑤ 8.0s: 后处理合并扫描\n黄金扫描波融合 AABB 消除卡墙重叠'),
    ('pal1_f6.png', '⑥ 9.6s: 完整合院全景巡检\n-25% 实体 / 0 接缝 / 100% 畅通')
]

OUTPUT_STRIP = os.path.join(BRAIN_DIR, 'pal1_reveal_9x16_breakdown.png')

W, H = 2560, 1080
strip = Image.new('RGB', (W, H), (10, 14, 22))
draw = ImageDraw.Draw(strip)

def get_font(size):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for fc in candidates:
        if os.path.exists(fc):
            try:
                return ImageFont.truetype(fc, size)
            except:
                pass
    return ImageFont.load_default()

title_font = get_font(34)
subtitle_font = get_font(18)
card_title_font = get_font(18)

# Header
draw.rectangle([(0, 0), (W, 90)], fill=(18, 22, 32))
draw.line([(0, 90), (W, 90)], fill=(45, 55, 75), width=2)
draw.text((W // 2, 32), "《仙剑奇侠传》SPP 空间预制体动态演化与后处理合并演示", font=title_font, fill=(245, 175, 50), anchor="mm")
draw.text((W // 2, 68), "基于刚优化的仙剑客栈合院预制体：4m 晶格诞生 → 变体叠加坍缩 → 歇山飞檐就位 → 多 SPP 混排展开 → 后处理消缝扫平", font=subtitle_font, fill=(180, 205, 230), anchor="mm")

pad = 20
card_w = (W - pad * 7) // 6
card_h = H - 120

for i, (fn, desc) in enumerate(FRAMES):
    x = pad + i * (card_w + pad)
    y = 110
    draw.rounded_rectangle([(x, y), (x + card_w, y + card_h)], radius=10, fill=(20, 26, 38), outline=(56, 189, 248, 120), width=2)
    
    img_path = os.path.join(BRAIN_DIR, fn)
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        im_w, im_h = card_w - 16, int((card_w - 16) * 16 / 9)
        if im_h > card_h - 100:
            im_h = card_h - 100
            im_w = int(im_h * 9 / 16)
        im_resized = im.resize((im_w, im_h), Image.Resampling.LANCZOS)
        strip.paste(im_resized, (x + (card_w - im_w) // 2, y + 12))
    
    # Text below
    draw.rectangle([(x + 6, y + card_h - 75), (x + card_w - 6, y + card_h - 8)], fill=(28, 36, 52))
    lines = desc.split('\n')
    draw.text((x + card_w // 2, y + card_h - 60), lines[0], font=card_title_font, fill=(245, 185, 65), anchor="mm")
    draw.text((x + card_w // 2, y + card_h - 26), lines[1], font=subtitle_font, fill=(200, 220, 240), anchor="mm")

strip.save(OUTPUT_STRIP, quality=95)
print(f"Pal1 Reveal breakdown saved to: {OUTPUT_STRIP}")
