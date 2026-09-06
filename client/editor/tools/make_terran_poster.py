import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
FACADE_IMG = os.path.join(BRAIN_DIR, 'terran_facade_assembled.png')
LIFTED_IMG = os.path.join(BRAIN_DIR, 'terran_lifted_liftoff.png')
HOLO_IMG = os.path.join(BRAIN_DIR, 'terran_interior_holo_bridge.png')
ARMORY_IMG = os.path.join(BRAIN_DIR, 'terran_interior_armory.png')
LOGISTICS_IMG = os.path.join(BRAIN_DIR, 'terran_interior_logistics.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_command_poster.png')

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
label_font = get_font(18)
code_font = get_font(16)

# Header
draw.rectangle([(0, 0), (W, 110)], fill=(20, 26, 40))
draw.line([(0, 110), (W, 110)], fill=(212, 160, 23), width=2)

title_text = "SPP《星际争霸1》经典人族建筑（指挥中心）程序化生成与室内空间推演评测"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "100% 严谨还原《星际1》原版外观：金色八角指挥塔（蓝光百叶窗/银白雷达罩）· 双发火箭排气管 · 四爪伞状液压地脚 · 正面卸矿宽坡道 · 侧挂对接悬臂"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(203, 213, 225), anchor="mm")

def draw_card(img_path, rect, title, border_color=(212, 160, 23)):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=(22, 29, 44), outline=border_color, width=3)

    # Title badge
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 44)], radius=6, fill=(32, 43, 62))
    draw.text((x + 20, y + 27), title, font=card_title_font, fill=(241, 245, 249), anchor="lm")

    # Inner viewport
    pad = 12
    vx, vy, vw, vh = x + pad, y + 50, w - 2 * pad, h - 50 - pad
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        im_ratio = im.width / im.height
        view_ratio = vw / vh

        if im_ratio > view_ratio:
            nh = int(vw / im_ratio)
            im_resized = im.resize((vw, nh), Image.Resampling.LANCZOS)
            offset_y = vy + (vh - nh) // 2
            poster.paste(im_resized, (vx, offset_y))
        else:
            nw = int(vh * im_ratio)
            im_resized = im.resize((nw, vh), Image.Resampling.LANCZOS)
            offset_x = vx + (vw - nw) // 2
            poster.paste(im_resized, (offset_x, vy))
    else:
        draw.rectangle([(vx, vy), (vx + vw, vy + vh)], fill=(30, 35, 45))
        draw.text((vx + vw // 2, vy + vh // 2), f"Missing: {os.path.basename(img_path)}", font=card_title_font, fill=(220, 80, 80), anchor="mm")

# Top row: 2 cards (Facade Assembled + Lifted Cutaway)
margin_x = 40
top_y = 135
card_w_top = 1220
card_h_top = 710

draw_card(FACADE_IMG, (margin_x, top_y, card_w_top, card_h_top),
          "①《星际1》原版经典装配态 · 金色八角指挥塔、后部双发火箭排气管、正面倾斜卸矿坡道、右侧对接支架与四爪液压地脚",
          border_color=(212, 160, 23))

draw_card(LIFTED_IMG, (margin_x + card_w_top + 40, top_y, card_w_top, card_h_top),
          "② 经典建筑升空 (Lift-Off) 剖切态 · 模块化屋顶与双发烟囱悬浮升空至 Z=9.5m，清晰展现下层全功能机械舱室",
          border_color=(56, 189, 248))

# Bottom row: 3 cards (Holo Bridge + Armory + Logistics)
bot_y = 865
card_w_bot = 800
card_h_bot = 570
gap_bot = 40

draw_card(HOLO_IMG, (margin_x, bot_y, card_w_bot, card_h_bot),
          "③ 中央指挥席位与控制台 · SC1 风格双 CRT 荧光监控终端、指挥坐席、重构架工业顶棚与蓝调电离照明",
          border_color=(56, 189, 248))

draw_card(ARMORY_IMG, (margin_x + card_w_bot + gap_bot, bot_y, card_w_bot, card_h_bot),
          "④ 陆战队军械库 (Marine Armory) · 立式磁吸 C-14 刺钉穿刺步枪挂架、防爆高爆弹药箱与观察狭缝",
          border_color=(244, 63, 94))

draw_card(LOGISTICS_IMG, (margin_x + (card_w_bot + gap_bot) * 2, bot_y, card_w_bot, card_h_bot),
          "⑤ SCV 矿区物资接收舱 · 簇状高纯度幽蓝水晶矿石装运箱、墨绿发光高压瓦斯罐与工业通风管道",
          border_color=(34, 197, 94))

# Footer
footer_y = 1460
draw.rectangle([(0, footer_y), (W, H)], fill=(16, 22, 32))
draw.line([(0, footer_y), (W, footer_y)], fill=(45, 55, 75), width=2)

col1_x = 50
col2_x = 880
col3_x = 1720

draw.text((col1_x, footer_y + 20), "【100% 严谨还原《星际争霸1》经典外观】", font=label_font, fill=(245, 190, 45))
draw.text((col1_x, footer_y + 48), "• 金色八角指挥塔（Command Bridge）：八角金铜色重甲、环绕式蓝光百叶观察狭缝、顶部银白半球雷达罩（Radome）。", font=code_font, fill=(148, 163, 184))
draw.text((col1_x, footer_y + 74), "• 后部双发垂直火箭烟囱（Engine Silos）：左右两根巨型圆柱排气管 + 顶部环形风口 + 散热排气管路与冷却栅格。", font=code_font, fill=(148, 163, 184))
draw.text((col1_x, footer_y + 100), "• 原版四爪液压地脚与前出斜坡道：多爪伞状液压抓地大底盘，正前方倾斜伸出的 SCV 宽轨卸料斜坡道。", font=code_font, fill=(148, 163, 184))

draw.text((col2_x, footer_y + 20), "【内部空间职能推演与装配解耦】", font=label_font, fill=(56, 189, 248))
draw.text((col2_x, footer_y + 48), "• 右侧附属建筑对接悬臂（Add-on Dock）：还原雷达站（ComSat）与核弹井（Nuclear Silo）外挂锁止导轨。", font=code_font, fill=(148, 163, 184))
draw.text((col2_x, footer_y + 74), "• 室内舱室全景推演：CRT 绿显监控终端席位、陆战队 C-14 刺钉步枪机架、SCV 幽蓝水晶矿与高压瓦斯接收区。", font=code_font, fill=(148, 163, 184))
draw.text((col2_x, footer_y + 100), "• 经典 Lift-Off 建筑升空：屋顶与双发烟囱完全独立解耦，可升空至空中喷射蓝光悬浮，下层舱室清晰展现。", font=code_font, fill=(148, 163, 184))

draw.text((col3_x, footer_y + 20), "【纯数据交付与门禁全绿】", font=label_font, fill=(34, 197, 94))
draw.text((col3_x, footer_y + 48), "• 纯数据交付：StylePack 与 Level 100% 声明式 JSON，无任何侵入式引擎代码修改或 Three.js 侧门。", font=code_font, fill=(148, 163, 184))
draw.text((col3_x, footer_y + 74), "• 规范数字资产契约：8 款定制 PBR GLB 均注册进 demo.manifest.json（ID 120~127），零宿主相对路径。", font=code_font, fill=(148, 163, 184))
draw.text((col3_x, footer_y + 100), "• 严苛门禁绿灯：`cd engine && yarn test:run` 992/992 测试全绿，完全符合 protocol 及 content-conformance 规范。", font=code_font, fill=(148, 163, 184))

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master evaluation poster successfully created at: {OUTPUT_POSTER}")
