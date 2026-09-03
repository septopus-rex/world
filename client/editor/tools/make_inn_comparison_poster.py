import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ORIGINAL_MAP = os.path.join(BRAIN_DIR, 'pal1_original_map.png')
ISO_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_isometric.png')
INT_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_interior.png')
RAILING_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_railing_detail.png')
COUNTER_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_counter_detail.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'pal1_indoor_recreation_comparison.png')

W, H = 2560, 1600
poster = Image.new('RGB', (W, H), (14, 17, 23))
draw = ImageDraw.Draw(poster)

# Load font
def get_font(size):
    font_candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for fc in font_candidates:
        if os.path.exists(fc):
            try:
                return ImageFont.truetype(fc, size)
            except:
                pass
    return ImageFont.load_default()

title_font = get_font(42)
subtitle_font = get_font(22)
card_title_font = get_font(24)
text_font = get_font(18)
code_font = get_font(16)

# Draw gradient-style header bar
draw.rectangle([(0, 0), (W, 110)], fill=(20, 24, 33))
draw.line([(0, 110), (W, 110)], fill=(45, 55, 75), width=2)

# Titles
title_text = "《仙剑奇侠传》余杭客栈一楼大堂 · 3D 隔扇花窗与透空寻杖栏杆 完整复刻对比"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "告别平面贴图与假窗 → 引入 img2three 程序化 3D 网格管线（落地隔扇花窗 ID 93、透空栏杆 ID 94、客房双开门 ID 95），解决 64 构件上限无损渲染"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(180, 195, 215), anchor="mm")

# Helper to paste an image card with border and header
def draw_card(img_path, rect, title, border_color=(70, 130, 220)):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=(24, 28, 38), outline=border_color, width=3)
    
    # Title badge
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 46)], radius=6, fill=(35, 42, 58))
    draw.text((x + 24, y + 28), title, font=card_title_font, fill=(235, 240, 250), anchor="lm")
    
    # Inner viewport
    pad = 12
    vx, vy, vw, vh = x + pad, y + 54, w - 2 * pad, h - 54 - pad
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        im_ratio = im.width / im.height
        box_ratio = vw / vh
        
        # Center crop / fit
        if im_ratio > box_ratio:
            new_h = vh
            new_w = int(vh * im_ratio)
            im_resized = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
            cx = (new_w - vw) // 2
            im_cropped = im_resized.crop((cx, 0, cx + vw, vh))
        else:
            new_w = vw
            new_h = int(vw / im_ratio)
            im_resized = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
            cy = (new_h - vh) // 2
            im_cropped = im_resized.crop((0, cy, vw, cy + vh))
            
        poster.paste(im_cropped, (vx, vy))
        draw.rectangle([(vx, vy), (vx + vw, vy + vh)], outline=(50, 60, 80), width=1)

# Layout:
# Top Row: 2 large cards (1995 Original vs 2026 3D Isometric View)
# Y: 130, Height: 750
# X: 40 to 1260 (W=1220), 1300 to 2520 (W=1220)
draw_card(ORIGINAL_MAP, (40, 130, 1220, 750), "① 1995 原版经典像素地图（余杭客栈大堂 2D 切角）", border_color=(235, 175, 75))
draw_card(ISO_IMG, (1300, 130, 1220, 750), "② 2026 本次 3D 建筑复刻（同角度剖切鸟瞰全景 · 63 构件全量渲染）", border_color=(60, 200, 140))

# Bottom Row: 3 detail cards
# Y: 900, Height: 530
# 3 cards across: W = 786 each
draw_card(RAILING_IMG, (40, 900, 786, 530), "③ 二楼回廊 · 3D 透空雕花栏杆（无跨廊阻挡）", border_color=(220, 100, 140))
draw_card(WINDOW_DETAIL if 'WINDOW_DETAIL' in locals() else os.path.join(BRAIN_DIR, 'pal1_inn_window_detail.png'), (886, 900, 786, 530), "④ 3D 隔扇长窗 · 方胜菱形木棂与丝绢衬纸", border_color=(100, 180, 245))
draw_card(COUNTER_IMG, (1732, 900, 786, 530), "⑤ 账台与后厨 · 迎客松盆景、绍兴老酒坛与隔扇门", border_color=(200, 140, 230))

# Footer bar (Y: 1450 to 1580)
draw.rectangle([(0, 1450), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1450), (W, 1450)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【问题根因与排查定位】",
    "1. 假窗与贴图感：此前版本使用 a2 单块贴红木贴图作为实墙，窗户仅为浮贴的扁平白色贴片，缺失中国古典木构建筑的抹挺榫卯框架与菱花格眼深度。",
    "2. 跨廊拦路与错位：因引擎在 MeshGroup 与 Child 两级均同步了 rotation，导致 90° 旋转叠加为 180°（仍沿 X 轴延伸像跨栏一样横截回廊）。",
    "3. 构件截断：原版场景包含 88 行附属物，触发世界引擎 block.max (64) 门禁，后 24 行（包括关键花窗与回廊栏杆）被静默截断丢弃。"
]

footer_col2 = [
    "【本次核心改进与技术突破】",
    "1. img2three 程序化 3D 网格重塑：开发落地隔扇花窗（ID 93，方胜木棂+浮雕裙板）、透空寻杖栏杆（ID 94，莲花望柱+实通透空立柱）、客房双开门（ID 95）。",
    "2. 旋转矩阵精确归一化：通过 45° 欧拉角抵消双级旋转，回廊全线完美贴合二楼边沿，实现 360° 透空通视中庭与一层大堂。",
    "3. 拓扑合并与 63 构件零截断：重整结构至 63 行（162基础底座 9 行 + 167木柱 4 行 + 164三维构件 45 行 + 163暖灯 3 行 + 180碰撞 2 行），100% 满额稳定加载。"
]

fy = 1465
for line in footer_col1:
    draw.text((60, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 28

fy = 1465
for line in footer_col2:
    draw.text((1320, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 28

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master comparison poster saved successfully to: {OUTPUT_POSTER}")
