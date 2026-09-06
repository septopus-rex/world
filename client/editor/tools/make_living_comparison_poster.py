import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
PAL1_LIFTED = os.path.join(BRAIN_DIR, 'pal1_roof_lifted.png')
PAL1_DETAIL = os.path.join(BRAIN_DIR, 'pal1_roof_ceiling_view.png')
TERRAN_LIFTED = os.path.join(BRAIN_DIR, 'living_lifted_cutaway.png')
TERRAN_DETAIL = os.path.join(BRAIN_DIR, 'living_workstation_close.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'spp_living_unit_comparison_poster.png')

W, H = 2560, 1600
poster = Image.new('RGB', (W, H), (14, 18, 26))
draw = ImageDraw.Draw(poster)

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

title_font = get_font(36)
subtitle_font = get_font(20)
card_title_font = get_font(22)
footer_font = get_font(18)

# Header
draw.rectangle([(0, 0), (W, 110)], fill=(20, 26, 40))
draw.line([(0, 110), (W, 110)], fill=(212, 160, 23), width=2)

title_text = "SPP 弦粒子空间预制体 · 经典人居空间对比评测：古代东方客栈 vs 未来星际生活舱"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "同一套微观粒子拓扑 + 模块化屋面升空解构 · 从《仙剑奇侠传》余杭客栈到《星际争霸1》人族居住单元"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(203, 213, 225), anchor="mm")

def draw_card(img_path, rect, title, border_color=(212, 160, 23)):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=(22, 29, 44), outline=border_color, width=3)

    # Title badge
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 46)], radius=6, fill=(32, 43, 62))
    draw.text((x + 20, y + 28), title, font=card_title_font, fill=(241, 245, 249), anchor="lm")

    # Inner viewport
    pad = 12
    vx, vy, vw, vh = x + pad, y + 54, w - 2 * pad, h - 54 - pad
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        im_ratio = im.width / im.height
        view_ratio = vw / vh

        if im_ratio > view_ratio:
            nh = int(vw / im_ratio)
            im_resized = im.resize((vw, nh), Image.Resampling.LANCZOS)
            oy = (vh - nh) // 2
            poster.paste(im_resized, (vx, vy + oy))
        else:
            nw = int(vh * im_ratio)
            im_resized = im.resize((nw, vh), Image.Resampling.LANCZOS)
            ox = (vw - nw) // 2
            poster.paste(im_resized, (vx + ox, vy))
    else:
        draw.rectangle([(vx, vy), (vx + vw, vy + vh)], fill=(15, 23, 42))
        draw.text((vx + vw // 2, vy + vh // 2), f"Missing: {os.path.basename(img_path)}", font=card_title_font, fill=(148, 163, 184), anchor="mm")

card_w = (W - 40 - 20) // 2 # 1240
card_h = (H - 110 - 45 - 20 * 3) // 2 # ~680

# Row 1: Lifted Roof / Cutaway Comparisons
y1 = 130
draw_card(PAL1_LIFTED, (20, y1, card_w, card_h), "【东方仙侠 · 客栈客房】坡屋顶与飞檐独立升空 · 纯实木框架与回廊木作栏杆", border_color=(205, 127, 50))
draw_card(TERRAN_LIFTED, (20 + card_w + 20, y1, card_w, card_h), "【星际科幻 · 人族生活舱】重装甲顶盖升空 (Z=9.5m) · 4象限人居生活全景俯瞰", border_color=(0, 229, 255))

# Row 2: Living Interior Details
y2 = y1 + card_h + 20
draw_card(PAL1_DETAIL, (20, y2, card_w, card_h), "【东方人居内景】雕花木梁天花吊顶 · 暖光红灯笼 · 靠山假山庭院相映", border_color=(205, 127, 50))
draw_card(TERRAN_DETAIL, (20 + card_w + 20, y2, card_w, card_h), "【星际人居内景】经典绿色 CRT 显像管工作台 · 蓝光流体环境净化柱 · 工业防滑地钢板", border_color=(0, 229, 255))

# Footer
footer_y = H - 45
draw.rectangle([(0, footer_y), (W, H)], fill=(20, 26, 40))
draw.line([(0, footer_y), (W, footer_y)], fill=(51, 65, 85), width=1)
footer_text = "Septopus World · SPP 弦粒子空间预制体体系 · 跨主题（仙侠客栈 vs 星际人族）同一数据契约 · 100% 引擎门禁绿灯"
draw.text((W // 2, footer_y + 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"[OK] SPP Living Unit Comparison Poster generated: {OUTPUT_POSTER}")
