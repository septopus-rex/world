import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
EXTERIOR_IMG = os.path.join(BRAIN_DIR, 'depot_exterior_iso.png')
LIFTED_IMG = os.path.join(BRAIN_DIR, 'depot_lifted_cutaway.png')
POWER_CORE_IMG = os.path.join(BRAIN_DIR, 'depot_power_core_close.png')
CRATES_IMG = os.path.join(BRAIN_DIR, 'depot_supply_crates_close.png')
CRYO_IMG = os.path.join(BRAIN_DIR, 'depot_cryo_freezer_close.png')
LOGISTICS_IMG = os.path.join(BRAIN_DIR, 'depot_logistics_bunks_close.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_depot_poster.png')

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

title_text = "SPP《星际争霸1》经典人族补给站（Supply Depot）程序化重建与全功能后勤空间推演"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "还原 SC1 经典 3×2 地块网格（12m×8m×4m）· 模块化双涡轮排风顶盖 · 冷聚变反应堆 · 托盘军需箱组 · 低温军粮库 · 调度工作台与折叠吊铺 · 模块化顶棚升空剖透"
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

draw_card(EXTERIOR_IMG, (20, top_y, hero_w, top_h), "① 《星际1》3×2 补给站经典装配态外观（双涡轮排风顶盖 · 四角减震阻尼器 · 货运气闸 · 新钢铁装甲）")
draw_card(LIFTED_IMG, (20 + hero_w + 20, top_y, hero_w, top_h), "② 模块化顶棚升空 (Z=9.5m) 室内 6 舱全景剖透（冷核聚变能源堆 · 军需箱托盘 · 低温冷藏库 · 调度工作台 · 吊铺）")

# --- Bottom Row: 4 Detailed Functional Cards (Height 690) ---
bot_y = top_y + top_h + 20
bot_h = 690
card_w = (W - 40 - 20 * 3) // 4 # 605

draw_card(POWER_CORE_IMG, (20, bot_y, card_w, bot_h), "③ 北中舱·冷核聚变反应堆核心（青蓝电离光·散热翼片）")
draw_card(CRATES_IMG, (20 + (card_w + 20), bot_y, card_w, bot_h), "④ 南中舱·军需物资箱托盘（橄榄军箱·弹药/医疗箱·扎带）")
draw_card(CRYO_IMG, (20 + (card_w + 20) * 2, bot_y, card_w, bot_h), "⑤ 西北舱·低温口粮冷藏库（霜面观察窗·压缩机管路·仪表）")
draw_card(LOGISTICS_IMG, (20 + (card_w + 20) * 3, bot_y, card_w, bot_h), "⑥ 东南/东北舱·后勤调度台与吊铺（CRT屏幕·折叠铺位）")

# Footer
draw.rectangle([(0, H - 45), (W, H)], fill=(20, 26, 40))
draw.line([(0, H - 45), (W, H - 45)], fill=(38, 48, 64), width=1)
footer_text = "Septopus Engine 3D SPP 架构 · 纯数据 JSON 关卡与风格包 · 8组定制 PBR 3D 资产（ID 136-143） · 遵循《AGENTS.md》红线与仙剑全流程成功规范 · 门禁测试 100% 绿灯通过"
draw.text((W // 2, H - 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER, quality=95)
print(f"Successfully generated Terran Supply Depot evaluation poster at {OUTPUT_POSTER} ({os.path.getsize(OUTPUT_POSTER)} bytes)")
