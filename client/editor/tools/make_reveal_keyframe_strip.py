import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
FRAMES = [
    ('reveal_f1.png', '① 0.8s: 粒子诞生\n4m 基础空间单胞晶格生长'),
    ('reveal_f2.png', '② 2.0s: 空间叠加态\n六面候选变体线框高频交替'),
    ('reveal_f3.png', '③ 3.6s: 坍缩波扫描\n物理材质与贴图自底向上成型'),
    ('reveal_f4.png', '④ 5.2s: 递归空间细分\n1胞分为8细化子胞 (Refinement)'),
    ('reveal_f5.png', '⑤ 7.2s: 空间连续生长\n多胞拼装生长为完整建筑结构'),
    ('reveal_f6.png', '⑥ 9.2s: 光墙瞬时换皮\nBrick -> Terran -> Ice -> Garden')
]

OUTPUT_STRIP = os.path.join(BRAIN_DIR, 'spp_reveal_9x16_breakdown.png')

W, H = 2560, 1080
strip = Image.new('RGB', (W, H), (14, 17, 23))
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
draw.rectangle([(0, 0), (W, 90)], fill=(20, 24, 33))
draw.line([(0, 90), (W, 90)], fill=(45, 55, 75), width=2)
draw.text((W // 2, 32), "SPP 核心概念宣传片《spp-reveal-9x16》分镜与演进解析", font=title_font, fill=(245, 205, 120), anchor="mm")
draw.text((W // 2, 68), "一个粒子如何变成一栋楼：网格诞生 → 6面叠加态 → 坍缩波扫描 → 递归细化 → 矩阵生长 → 光墙秒换风格", font=subtitle_font, fill=(180, 195, 215), anchor="mm")

pad = 20
card_w = (W - pad * 7) // 6
card_h = H - 120

for i, (fn, desc) in enumerate(FRAMES):
    x = pad + i * (card_w + pad)
    y = 110
    draw.rounded_rectangle([(x, y), (x + card_w, y + card_h)], radius=10, fill=(24, 28, 38), outline=(60, 80, 120), width=2)
    
    img_path = os.path.join(BRAIN_DIR, fn)
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        # Frame aspect ratio is 9:16
        im_w, im_h = card_w - 16, int((card_w - 16) * 16 / 9)
        if im_h > card_h - 100:
            im_h = card_h - 100
            im_w = int(im_h * 9 / 16)
        im_resized = im.resize((im_w, im_h), Image.Resampling.LANCZOS)
        strip.paste(im_resized, (x + (card_w - im_w) // 2, y + 12))
    
    # Text below
    draw.rectangle([(x + 6, y + card_h - 75), (x + card_w - 6, y + card_h - 8)], fill=(32, 38, 52))
    lines = desc.split('\n')
    draw.text((x + card_w // 2, y + card_h - 60), lines[0], font=card_title_font, fill=(235, 200, 110), anchor="mm")
    draw.text((x + card_w // 2, y + card_h - 26), lines[1], font=subtitle_font, fill=(200, 215, 230), anchor="mm")

strip.save(OUTPUT_STRIP, quality=95)
print(f"Keyframe breakdown saved to: {OUTPUT_STRIP}")
