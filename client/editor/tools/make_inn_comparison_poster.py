import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ORIGINAL_MAP = os.path.join(BRAIN_DIR, 'pal1_original_map.png')
ISO_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_isometric.png')
GROUND_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_ground_detail.png')
RAILING_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_railing_detail.png')
WINDOW_IMG = os.path.join(BRAIN_DIR, 'pal1_inn_window_detail.png')
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

title_font = get_font(40)
subtitle_font = get_font(21)
card_title_font = get_font(22)
code_font = get_font(16)

# Draw gradient-style header bar
draw.rectangle([(0, 0), (W, 110)], fill=(20, 24, 33))
draw.line([(0, 110), (W, 110)], fill=(45, 55, 75), width=2)

# Titles
title_text = "《仙剑奇侠传》余杭客栈大堂 · 青石方砖地面与古建木构 完整复刻对比"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "重构地面体系：青灰大方砖（ID 96）+ 走廊实木地板（ID 97）+ 素雅木板壁（ID 98），告别错位墙砖与金圈贴图，全面对齐 1995 原作神韵"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(180, 195, 215), anchor="mm")

# Helper to paste an image card with border and header
def draw_card(img_path, rect, title, border_color=(70, 130, 220)):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=(24, 28, 38), outline=border_color, width=3)
    
    # Title badge
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 44)], radius=6, fill=(35, 42, 58))
    draw.text((x + 20, y + 27), title, font=card_title_font, fill=(235, 240, 250), anchor="lm")
    
    # Inner viewport
    pad = 12
    vx, vy, vw, vh = x + pad, y + 50, w - 2 * pad, h - 50 - pad
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
# Y: 125, Height: 750
# X: 40 to 1260 (W=1220), 1300 to 2520 (W=1220)
draw_card(ORIGINAL_MAP, (40, 125, 1220, 750), "① 1995 原版经典像素地图（余杭客栈大堂 2D 切角）", border_color=(235, 175, 75))
draw_card(ISO_IMG, (1300, 125, 1220, 750), "② 2026 最新 3D 建筑复刻（青石方砖铺地 · 实木回廊 · 63 构件全量渲染）", border_color=(60, 200, 140))

# Bottom Row: 4 detail cards across
# Y: 895, Height: 525
# W: 590 each, gap = 20
# X0 = 40, X1 = 660, X2 = 1280, X3 = 1900 (Total W = 590*4 + 20*3 = 2420)
draw_card(GROUND_IMG, (40, 895, 600, 525), "③ 一楼地面 · 大方青石板砖与平直浅灰勾缝", border_color=(100, 200, 220))
draw_card(RAILING_IMG, (660, 895, 600, 525), "④ 二楼回廊 · 实木地板铺设与 3D 透空栏杆", border_color=(220, 100, 140))
draw_card(WINDOW_IMG, (1280, 895, 600, 525), "⑤ 落地隔扇花窗 · 3D 方胜格眼与丝绢衬纸", border_color=(100, 180, 245))
draw_card(COUNTER_IMG, (1900, 895, 620, 525), "⑥ 掌柜账台 · 迎客松盆景、绍兴老酒与素木板壁", border_color=(200, 140, 230))

# Footer bar (Y: 1440 to 1580)
draw.rectangle([(0, 1440), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1440), (W, 1440)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【地面材质缺陷与排查诊断】",
    "1. 地砖类型错乱：原场景使用 oriental-brick.png (ID 54)，其本质是立面错缝青砖墙，直接平铺导致大堂像室外马路或翻倒的砖墙，比例狭长杂乱。",
    "2. 走廊违和图案：二楼走廊与外墙套用带有金色同心圆环的 oriental-wood.png (ID 52)，与中国古典木构建筑风格完全脱节，极其抢戏刺眼。",
    "3. 色彩与光感脱节：原版余杭客栈地面为素雅冷青灰色大方砖（RGB ~85,85,81），与朱红木构形成经典冷暖对比，此前版本呈现暗沉死灰。"
]

footer_col2 = [
    "【本次针对性优化与材质重塑】",
    "1. 专属青石大方砖 (ID 96)：制作 4×4 正方青石板砖贴图，精确计算平铺比例实现 0.8m×0.8m 真实尺度，45° 轴测视角下完美重现 1995 原作菱形铺地网格与浅灰勾缝。",
    "2. 专属二楼走廊实木地板 (ID 97)：沉稳温暖的栗壳色木板条横向密排，与 3D 透空寻杖栏杆紧密契合，消除所有金色同心圆图案。",
    "3. 素雅中式实木板壁 (ID 98)：将实体墙段全部统一为古典朱红板壁材质，与 3D 落地隔扇花窗（ID 93）浑然一体，100% 遵守 64 构件上限门禁。"
]

fy = 1455
for line in footer_col1:
    draw.text((60, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 26

fy = 1455
for line in footer_col2:
    draw.text((1300, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 26

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master comparison poster saved successfully to: {OUTPUT_POSTER}")
