import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ISO_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_isometric.png')
CORRIDOR_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_corridor.png')
DOOR_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_door.png')
WINDOW_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_window.png')
INSIDE_DOOR_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_inside_door.png')
WEST_WALL_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_west_wall.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'pal1_rooms_evaluation_poster.png')

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

title_font = get_font(38)
subtitle_font = get_font(20)
card_title_font = get_font(22)
code_font = get_font(16)

# Header
draw.rectangle([(0, 0), (W, 110)], fill=(20, 24, 33))
draw.line([(0, 110), (W, 110)], fill=(45, 55, 75), width=2)

title_text = "SPP《仙剑奇侠传》余杭客栈 · 3 连间客房与外回廊生成评测与模数调优报告"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "基于 6 单元 SPP 字符串粒子自动膨胀：外走廊 (0,0..2,0) + 3 连间客房 (0,1..2,1) · 模数比例与侧向坐标置换适配"
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

ROOF_DETAIL_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_roof_detail.png')
EAVE_IMG = os.path.join(BRAIN_DIR, 'pal1_rooms_eave_underside.png')

# Layout:
# Top Row: 2 large cards (Isometric Overview + 3D Roof Detail)
draw_card(ISO_IMG, (40, 125, 1220, 750), "① SPP 整体鸟瞰 · 中式双坡青瓦飞檐大屋顶（正脊宝顶 + 鎏金鸱吻 + 四角飞檐起翘 + 双侧博风板）", border_color=(235, 175, 75))
draw_card(ROOF_DETAIL_IMG, (1300, 125, 1220, 750), "② 屋面特写 · 16 垄小青瓦立体垄背 + 连续防水瓦沟 + 正脊滚筒瓦 + 鎏金角兽", border_color=(60, 200, 140))

# Bottom Row: 4 detail cards across (Eave underside, Corridor perspective, Door bay, Lattice window)
draw_card(EAVE_IMG, (40, 895, 600, 525), "③ 出檐仰视 · 0.8m 挑檐 + 密排飞椽木檩 + 瓦当滴水", border_color=(100, 180, 245))
draw_card(CORRIDOR_IMG, (660, 895, 600, 525), "④ 走廊漫游 · 实木地板 + 暖光宫灯 + 寻杖栏杆 + 客房大门", border_color=(220, 100, 140))
draw_card(DOOR_IMG, (1280, 895, 600, 525), "⑤ 客房大门开间 · 2.4m 双开门 + 0.8m 柱壁包边", border_color=(100, 200, 220))
draw_card(WINDOW_IMG, (1900, 895, 620, 525), "⑥ 落地隔扇长窗 · 4 扇连排细长方胜纹格眼", border_color=(200, 140, 230))

# Footer bar (Y: 1440 to 1600)
draw.rectangle([(0, 1440), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1440), (W, 1440)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【屋顶优化前痛点：原为扁平板条】",
    "1. 原屋顶缺乏立体起伏：原版仅为木构平板（flat slab），无法体现中国传统木构古建双坡悬山/硬山顶的宏伟大屋顶气势与飞檐遮阳韵味。",
    "2. SPP 顶面面变体缺失：此前 SPP 仅展开四周墙面与底面，缺少对 ParticleFace.Top（顶面）针对大屋顶的独立变体拆分与出檐外挑模数。",
    "3. 轴向转换与包围盒对齐失真：在 Three.js 引擎坐标系（Y-Up）中，需精确钉死包围盒 [-2..2, -0.75..0.75, -2.4..2.4]，杜绝非均匀缩放与拼缝错位。"
]

footer_col2 = [
    "【本次实施的 3D 中式青瓦飞檐大屋顶重构】",
    "1. 纯数据驱动：严格遵循 AGENTS.md 守则，模型经 demo.manifest.json 注册（ID 99~104），在 pal1_inn.stylepack.json 定义 6 大屋面面变体，引擎 0 侧门。",
    "2. 连续防水曲面与小青瓦垄：密闭连续曲面基层杜绝漏光漏天，16 垄小青瓦圆柱垄背（0.25m 模数间距）连绵横跨 12 米，垄脊立体光影极度逼真。",
    "3. 真实古建构件规制：深达 0.8m 的挑檐遮阳，下衬 24 根密排飞椽木檩与挑檐枋；檐口布设交替排列的圆形瓦当与倒三角滴水；正脊横亘 12 米滚筒瓦宝顶；四角微扬飞檐起翘；两端博风板下雕饰鎏金鸱吻防火瑞兽！"
]

fy = 1452
for line in footer_col1:
    draw.text((60, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 26

fy = 1452
for line in footer_col2:
    draw.text((1300, fy), line, font=code_font, fill=(210, 220, 235))
    fy += 26

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master evaluation poster saved successfully to: {OUTPUT_POSTER}")
print(f"Master evaluation poster saved successfully to: {OUTPUT_POSTER}")
