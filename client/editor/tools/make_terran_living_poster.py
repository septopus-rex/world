import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
EXTERIOR_IMG = os.path.join(BRAIN_DIR, 'living_exterior_iso.png')
LIFTED_IMG = os.path.join(BRAIN_DIR, 'living_lifted_cutaway.png')
BUNKS_IMG = os.path.join(BRAIN_DIR, 'living_bunks_close.png')
DINING_IMG = os.path.join(BRAIN_DIR, 'living_dining_close.png')
WORKSTATION_IMG = os.path.join(BRAIN_DIR, 'living_workstation_close.png')
AIRLOCK_IMG = os.path.join(BRAIN_DIR, 'living_airlock_entry.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_living_poster.png')

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

title_text = "SPP《星际争霸1》经典人族居住单元（生活舱）程序化生成与人居空间推演评测"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "对标仙剑客栈客房人居尺度 · 8m×8m 4象限居住矩阵 · 合金双层太空舱床 · 自动配给吧台 · 战术终端与维生净化柱 · 重型气密门 · 模块化顶盖升空剖透"
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
        draw.text((vx + vw // 2, vy + vh // 2), f"Missing image: {os.path.basename(img_path)}", font=card_title_font, fill=(148, 163, 184), anchor="mm")

# --- Top Row: 2 Major Hero Cards (Height 700) ---
top_y = 125
top_h = 700
hero_w = (W - 40 - 20) // 2 # 1240

# 1. Left Hero: Lifted Cutaway
draw_card(LIFTED_IMG, (20, top_y, hero_w, top_h), "【升空剖透全景】顶盖模块垂直升空 (Z=9.5m) · 4象限人居生活内景直观俯瞰", border_color=(0, 229, 255))

# 2. Right Hero: Assembled Closed Exterior
draw_card(EXTERIOR_IMG, (20 + hero_w + 20, top_y, hero_w, top_h), "【常态落成外观】Neosteel 复合装甲生活舱 · 顶置双旋翼空调/太阳能/通讯套件 · 气密舱门", border_color=(212, 160, 23))

# --- Bottom Row: 4 Interior/Feature Cards (Height 690) ---
bot_y = top_y + top_h + 20
bot_h = 690
card_w = (W - 40 - 3 * 15) // 4 # 618

# 3. Bottom 1: Sleeping Bunks
draw_card(BUNKS_IMG, (20 + 0 * (card_w + 15), bot_y, card_w, bot_h), "【NW 寝居区】合金双层太空舱床 · 梯架 · 阅读屏 · 储物柜", border_color=(76, 175, 80))

# 4. Bottom 2: Dining & Ration Bar
draw_card(DINING_IMG, (20 + 1 * (card_w + 15), bot_y, card_w, bot_h), "【SE 简餐区】自动口粮配给机 · 操作屏/杯架 · 金属高脚转椅", border_color=(255, 152, 0))

# 5. Bottom 3: Tactical Workstation & Life Support
draw_card(WORKSTATION_IMG, (20 + 2 * (card_w + 15), bot_y, card_w, bot_h), "【NE 工作与维生】经典绿色 CRT 显像管终端 · 蓝光流体净化柱", border_color=(0, 229, 255))

# 6. Bottom 4: Airlock Entry Portal
draw_card(AIRLOCK_IMG, (20 + 3 * (card_w + 15), bot_y, card_w, bot_h), "【SW 出入缓冲区】重型液压双开气密门 · 黄黑警示纹 · 通行指示灯", border_color=(239, 68, 68))

# Footer
footer_y = H - 45
draw.rectangle([(0, footer_y), (W, H)], fill=(20, 26, 40))
draw.line([(0, footer_y), (W, footer_y)], fill=(51, 65, 85), width=1)
footer_text = "Septopus World · SPP 弦粒子空间预制体体系 · 标准 4 单胞矩阵 (8m×8m×4m) · 双风格包 (terran_living + terran_living_roof) · 纯数据驱动 · 引擎全门禁通过 (996/996 Passed)"
draw.text((W // 2, footer_y + 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"[OK] Terran Living Unit Master Evaluation Poster generated: {OUTPUT_POSTER}")
