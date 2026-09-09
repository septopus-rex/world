import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ISO_IMG = os.path.join(BRAIN_DIR, 'bunker_quad_iso.png')
TOPDOWN_IMG = os.path.join(BRAIN_DIR, 'bunker_quad_topdown.png')
FRONTLINE_IMG = os.path.join(BRAIN_DIR, 'bunker_quad_frontline.png')
INTERIOR_IMG = os.path.join(BRAIN_DIR, 'bunker_quad_interior.png')
CORRIDOR_IMG = os.path.join(BRAIN_DIR, 'bunker_quad_corridor.png')
DETAIL_IMG = os.path.join(BRAIN_DIR, 'bunker_exterior_front.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_bunker_quad_poster.png')

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

title_text = "SPP《星际争霸1》经典人族4联地堡战术防线（Terran Quad-Bunker Citadel Battery）全景推演"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "基于 SPP 空间拓扑与 5x5 单胞矩阵无缝扩展 · 2x2 互联型交叉火力防御要塞 · 16门 C-14 重型穿甲机枪无死角覆盖 · 中央等离子能源与弹药补给走廊 · 升空剖透实况"
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

draw_card(ISO_IMG, (20, top_y, hero_w, top_h), "① 4联星际地堡要塞俯瞰透视（2x2 战术互联阵列 · 钛合金实心防爆斜坡 · 西北堡战时升空剖透 · 纯数据 SPP 拓扑展开）")
draw_card(TOPDOWN_IMG, (20 + hero_w + 20, top_y, hero_w, top_h), "② 90°上帝视角战术防线网格（4向交错无死角火力杀伤网 · 十字互通钢板走廊 · 几何对称布局 · 中央指挥补给站）")

# Bottom Row: 4 Detailed Functional Cards (Height 690)
bot_y = top_y + top_h + 20 # 845
bot_h = H - bot_y - 65     # 690
card_w = (W - 40 - 60) // 4 # 605

draw_card(FRONTLINE_IMG, (20, bot_y, card_w, bot_h), "③ 前线正面对抗视角（主通道射击狭缝与斜面装甲）")
draw_card(INTERIOR_IMG, (20 + (card_w + 20) * 1, bot_y, card_w, bot_h), "④ 西北地堡升空战位特写（4联战位与自动化弹药塔）")
draw_card(CORRIDOR_IMG, (20 + (card_w + 20) * 2, bot_y, card_w, bot_h), "⑤ 中央战术能源与军备枢纽（等离子核心与物资箱）")
draw_card(DETAIL_IMG, (20 + (card_w + 20) * 3, bot_y, card_w, bot_h), "⑥ 100% 还原 SC1 经典地堡单体（钛钢拉丝与防爆锁扣）")

# Footer
draw.rectangle([(0, H - 45), (W, H)], fill=(20, 26, 40))
draw.line([(0, H - 45), (W, H - 45)], fill=(38, 48, 64), width=1)
footer_text = "Septopus Engine 3D SPP 架构 · 纯数据 JSON 关卡（terran_bunker_quad.level.json） · 遵循《AGENTS.md》协议红线 · 门禁测试 100% 绿灯通过"
draw.text((W // 2, H - 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master Quad Bunker Poster saved to {OUTPUT_POSTER}")
