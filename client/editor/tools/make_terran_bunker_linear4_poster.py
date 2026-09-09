import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ISO_IMG = os.path.join(BRAIN_DIR, 'bunker_linear4_iso.png')
CORRIDOR_IMG = os.path.join(BRAIN_DIR, 'bunker_linear4_interior_corridor.png')
FRONT_IMG = os.path.join(BRAIN_DIR, 'bunker_linear4_front.png')
BAY3_IMG = os.path.join(BRAIN_DIR, 'bunker_linear4_bay3_cutaway.png')
REAR_IMG = os.path.join(BRAIN_DIR, 'bunker_linear4_rear.png')
SINGLE_IMG = os.path.join(BRAIN_DIR, 'bunker_exterior_iso.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_bunker_linear4_poster.png')

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

title_font = get_font(34)
subtitle_font = get_font(18)
card_title_font = get_font(17)
footer_font = get_font(15)

# Top Bar / Title
draw.rectangle([(0, 0), (W, 110)], fill=(20, 26, 40))
draw.line([(0, 110), (W, 110)], fill=(212, 160, 23), width=2)

title_text = "SPP《星际争霸1》经典人族4联横向贯通地堡（Terran 4-Linked Bunker）SPP选项扩展与便利性验证"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "验证 SPP 贴近原版造型后的模块化扩展便利性 · 新增「横连射击狭缝」「横向互通大拱」「横连加固外壁」「横连顶盖装甲」· 单胞矩阵从 2x2 到 8x2 瞬时扩展 · 32米贯通式交叉火力与漫游实况"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(203, 213, 225), anchor="mm")

def draw_card(img_path, rect, title, border_color=(212, 160, 23)):
    x, y, w, h = rect
    draw.rectangle([x, y, x + w, y + h], fill=(24, 32, 48), outline=border_color, width=2)
    
    header_h = 36
    draw.rectangle([x, y, x + w, y + header_h], fill=(30, 41, 59))
    draw.line([x, y + header_h, x + w, y + header_h], fill=border_color, width=1)
    draw.text((x + 16, y + header_h // 2), title, font=card_title_font, fill=(255, 255, 255), anchor="lm")
    
    img_rect_y = y + header_h
    img_rect_h = h - header_h
    if os.path.exists(img_path):
        img = Image.open(img_path)
        img_aspect = img.width / img.height
        target_aspect = w / img_rect_h
        
        if img_aspect > target_aspect:
            new_w = int(img.height * target_aspect)
            offset_x = (img.width - new_w) // 2
            img = img.crop((offset_x, 0, offset_x + new_w, img.height))
        else:
            new_h = int(img.width / target_aspect)
            offset_y = (img.height - new_h) // 2
            img = img.crop((0, offset_y, img.width, offset_y + new_h))
            
        img = img.resize((w - 4, img_rect_h - 4), Image.Resampling.LANCZOS)
        poster.paste(img, (x + 2, img_rect_y + 2))

# Top Row: 2 Hero Cards (Height 700)
top_y = 125
top_h = 700
hero_w = (W - 40 - 20) // 2 # 1240

draw_card(ISO_IMG, (20, top_y, hero_w, top_h), "① 32米 4联贯通地堡俯瞰全景（纯数据 SPP 8x2 格矩阵 · 新增横连选项自动缝合 · 第3战位升空剖透 · 顶盖横跨平滑搭接）")
draw_card(CORRIDOR_IMG, (20 + hero_w + 20, top_y, hero_w, top_h), "② 内部长廊透视贯通（透过3组「横向互通大拱」贯通4个射击战位 · 右侧重型 C-14 火线与左侧供弹塔通视直达）")

# Bottom Row: 4 Detailed Functional Cards (Height 690)
bot_y = top_y + top_h + 20 # 845
bot_h = H - bot_y - 65     # 690
card_w = (W - 40 - 60) // 4 # 605

draw_card(FRONT_IMG, (20, bot_y, card_w, bot_h), "③ 32米正面连续射击狭缝（「横连狭缝」选项整线拉通）")
draw_card(BAY3_IMG, (20 + (card_w + 20) * 1, bot_y, card_w, bot_h), "④ 第3战位升空特写（SPP 舱壁与中央供弹塔、枪架贴合）")
draw_card(REAR_IMG, (20 + (card_w + 20) * 2, bot_y, card_w, bot_h), "⑤ 后方双气闸门与「横连加固外壁」（结构卡箍与装甲肋）")
draw_card(SINGLE_IMG, (20 + (card_w + 20) * 3, bot_y, card_w, bot_h), "⑥ 经典 2x2 单体地堡原型（证明 1 到 4 仅需更改单胞网格）")

# Footer
draw.rectangle([(0, H - 45), (W, H)], fill=(20, 26, 40))
draw.line([(0, H - 45), (W, H - 45)], fill=(38, 48, 64), width=1)
footer_text = "Septopus Engine 3D SPP 架构 · 纯数据风格包与关卡 · 新增横连选项（bunker_link_arch, bunker_link_firing, bunker_link_wall, roof_dome_link） · 门禁 100% 绿灯通过"
draw.text((W // 2, H - 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master Linear4 Bunker Poster saved to {OUTPUT_POSTER}")
