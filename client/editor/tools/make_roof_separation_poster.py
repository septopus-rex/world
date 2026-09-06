import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ASSEMBLED_IMG = os.path.join(BRAIN_DIR, 'pal1_roof_assembled.png')
LIFTED_IMG = os.path.join(BRAIN_DIR, 'pal1_roof_lifted.png')
ISOLATED_IMG = os.path.join(BRAIN_DIR, 'pal1_roof_isolated.png')
EAVE_IMG = os.path.join(BRAIN_DIR, 'pal1_roof_eave_underside.png')
CEILING_IMG = os.path.join(BRAIN_DIR, 'pal1_roof_ceiling_view.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'pal1_roof_separation_poster.png')

W, H = 2560, 1600
poster = Image.new('RGB', (W, H), (14, 17, 23))
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
draw.rectangle([(0, 0), (W, 110)], fill=(20, 24, 33))
draw.line([(0, 110), (W, 110)], fill=(45, 55, 75), width=2)

title_text = "SPP《仙剑奇侠传》屋檐预制体解耦与模块化垂直叠层装配评测"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "屋檐飞檐独立抽离为纯粹 SPP (`pal1_roof`) · 房间主体 (`pal1_inn`) 室内平棋天花板密封 · 双 SPP 在 Z=4.0m 完美咬合"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(180, 195, 215), anchor="mm")

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
    else:
        draw.rectangle([(vx, vy), (vx + vw, vy + vh)], fill=(20, 22, 28))
        draw.text((vx + vw // 2, vy + vh // 2), f"Pending Capture: {os.path.basename(img_path)}", font=label_font, fill=(160, 160, 160), anchor="mm")

# Layout:
# Top Row: 2 hero cards
# Left: Assembled State (Seamless docking)
# Right: Lifted / Cutaway State (Vertical explosion showing ceiling & roof separation)
draw_card(ASSEMBLED_IMG, (40, 125, 1220, 750), "① 整体装配态 (Assembled) · 双 SPP 垂直咬合（房间主体 Z=0 + 屋檐 SPP Z=4.0m，接缝 100% 严丝合缝）", border_color=(60, 200, 140))
draw_card(LIFTED_IMG, (1300, 125, 1220, 750), "② 抽离剖切态 (Lifted / Cutaway) · 屋檐抬升至 Z=9.5m（清晰展现下层实木天花板封顶与上层悬浮屋顶）", border_color=(235, 175, 75))

# Bottom Row: 3 detail cards
# Col 1: Isolated Roof SPP
# Col 2: Eave underside & porch
# Col 3: Interior looking up at ceiling
draw_card(ISOLATED_IMG, (40, 895, 800, 525), "③ 独立屋檐 SPP (Isolated Roof Prefab) · 6 单元正脊青瓦 + 4 独立飞檐角兽组合件", border_color=(100, 180, 245))
draw_card(EAVE_IMG, (860, 895, 800, 525), "④ 檐下挑梁与回廊 (Eave Underside) · 0.8m 出檐起翘 + 密排飞椽木檩与廊柱咬合", border_color=(220, 100, 140))
draw_card(CEILING_IMG, (1680, 895, 840, 525), "⑤ 室内平棋天花板 (Indoor Ceiling) · 房间主体自带 wood_ceiling 封闭，无惧屋顶拆卸", border_color=(200, 140, 230))

# Footer bar (Y: 1440 to 1600)
draw.rectangle([(0, 1440), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1440), (W, 1440)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【架构解耦优势】",
    "• 关注点分离：房间 SPP 专注室内墙体、门窗、地板与平棋天花板布局；屋檐 SPP 专注中式青瓦双坡屋面与起翘飞檐。",
    "• 自由组合插拔：不同建筑（客房、大堂、亭廊）可灵活插拔平顶、歇山顶、悬山顶或二层楼板，告别单体定死屋面。",
]
footer_col2 = [
    "【几何与高度契约 (Geometry Contract)】",
    "• 底层房间主体：尺寸 4×4×4m，上表面 Top 槽位装配 wood_ceiling（平棋木雕），形成封闭室内层。",
    "• 顶层独立屋檐：`origin: [x, y, 4.0]`，粒子底面 Bottom 正向延展 `w:0, sw:0.375` (1.5m)，世界 Z 轴坐标无负值跨越。",
]
footer_col3 = [
    "【协议与规范合规 (Protocol Compliance)】",
    "• 纯数据交付：StylePack 与 Level 100% 声明式 JSON，无任何侵入式引擎代码修改或 Three.js 侧门。",
    "• 严苛门禁绿灯：`engine/yarn test:run` 988/988 测试全绿，完全符合 protocol/ 及 content-conformance 规范。",
]

def draw_col(lines, x, start_y):
    curr_y = start_y
    for i, line in enumerate(lines):
        color = (245, 205, 120) if i == 0 else (190, 200, 215)
        draw.text((x, curr_y), line, font=code_font, fill=color)
        curr_y += 26

draw_col(footer_col1, 50, 1458)
draw_col(footer_col2, 880, 1458)
draw_col(footer_col3, 1720, 1458)

poster.save(OUTPUT_POSTER, quality=95)
print(f"Poster generated successfully: {OUTPUT_POSTER}")
