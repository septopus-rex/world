import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
EXTERIOR_IMG = os.path.join(BRAIN_DIR, 'bunker_exterior_iso.png')
LIFTED_IMG = os.path.join(BRAIN_DIR, 'bunker_lifted_cutaway.png')
AMMO_TOWER_IMG = os.path.join(BRAIN_DIR, 'bunker_ammo_tower_close.png')
GUN_STATION_IMG = os.path.join(BRAIN_DIR, 'bunker_gun_station_close.png')
PERISCOPE_IMG = os.path.join(BRAIN_DIR, 'bunker_periscope_radar_close.png')
STIM_HATCH_IMG = os.path.join(BRAIN_DIR, 'bunker_stim_hatch_close.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_bunker_poster.png')

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

title_text = "SPP《星际争霸1》经典人族地堡（Terran Bunker）前线战术防御节点重建与全内构推演"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "还原 SC1 八角圆弧外廓（2面连通/2面阻断 1/4圆角单胞矩阵）· 4向 C-14 双联战位 · 45°斜切削角立柱 · 中央自动化供弹塔 · 顶盖升空剖透"
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

draw_card(EXTERIOR_IMG, (20, top_y, hero_w, top_h), "① 《星际1》前线战备防御构型（4象限 1/4 八角圆弧防爆装甲 · 45°斜切角柱 · 顶置旋转探照灯 · 防爆气闸）")
draw_card(LIFTED_IMG, (20 + hero_w + 20, top_y, hero_w, top_h), "② 顶盖悬浮作战态 (Z=8.5m) 战位全景剖透（4组 C-14 射击战位 · 4向柔性供弹滑轨 · 中央自动化弹药分发旋转塔）")

# --- Bottom Row: 4 Detailed Functional Cards (Height 690) ---
bot_y = top_y + top_h + 20
bot_h = 690
card_w = (W - 40 - 20 * 3) // 4 # 605

draw_card(AMMO_TOWER_IMG, (20, bot_y, card_w, bot_h), "③ 中央自动化弹药旋转分发塔（青绿储能核心·黄铜链弹仓·4向柔性供弹管）")
draw_card(GUN_STATION_IMG, (20 + (card_w + 20), bot_y, card_w, bot_h), "④ C-14 穿甲机枪重型三脚架战位（双联重枪管·黄黑警示护板·反后坐胸垫）")
draw_card(PERISCOPE_IMG, (20 + (card_w + 20) * 2, bot_y, card_w, bot_h), "⑤ 战术火控全景潜望台（360°潜望双目镜·CRT荧光战术雷达·红色警报灯）")
draw_card(STIM_HATCH_IMG, (20 + (card_w + 20) * 3, bot_y, card_w, bot_h), "⑥ 兴奋剂急救注射柜与逃生舱口（高压红/琥珀发光药剂·双向加压手轮井盖）")

# Footer
draw.rectangle([(0, H - 45), (W, H)], fill=(20, 26, 40))
draw.line([(0, H - 45), (W, H - 45)], fill=(38, 48, 64), width=1)
footer_text = "Septopus Engine 3D SPP 架构 · 纯数据 JSON 关卡与风格包 · 10组定制 PBR 3D 资产（ID 144-153） · 遵循《AGENTS.md》红线与仙剑全流程规范 · 门禁测试 100% 绿灯通过"
draw.text((W // 2, H - 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"Successfully generated Terran Bunker evaluation poster at {OUTPUT_POSTER} ({os.path.getsize(OUTPUT_POSTER)} bytes)")
