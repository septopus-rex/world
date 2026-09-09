import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
REF_IMG = os.path.join(BRAIN_DIR, 'sc1_bunker_remastered.png')
BEFORE_CLOSED_IMG = os.path.join(BRAIN_DIR, 'bunker_before_closed.png')
AFTER_CLOSED_IMG = os.path.join(BRAIN_DIR, 'bunker_exterior_iso.png')
BEFORE_LIFTED_IMG = os.path.join(BRAIN_DIR, 'bunker_before_lifted.png')
AFTER_LIFTED_IMG = os.path.join(BRAIN_DIR, 'bunker_lifted_cutaway.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'terran_bunker_comparison_poster.png')

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
card_desc_font = get_font(18)
footer_font = get_font(18)

# --- Header ---
draw.rectangle([(0, 0), (W, 115)], fill=(20, 26, 40))
draw.line([(0, 115), (W, 115)], fill=(212, 160, 23), width=2)

title_text = "SPP《星际争霸1》经典人族地堡（Terran Bunker）空间拓扑重大升级前后对比"
draw.text((W // 2, 42), title_text, font=title_font, fill=(245, 190, 45), anchor="mm")

sub_text = "落实用户“2面连通/2面阻断 1/4圆角单胞”拓扑构想 · 90°生硬直角方盒 → 45°斜切圆角八角碉堡全面蜕变"
draw.text((W // 2, 85), sub_text, font=subtitle_font, fill=(203, 213, 225), anchor="mm")

def draw_card(img_path, rect, title, desc, border_color=(212, 160, 23), bg_color=(22, 29, 44), fit_mode="contain"):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=bg_color, outline=border_color, width=3)

    # Title badge
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 46)], radius=6, fill=(32, 43, 62))
    draw.text((x + 20, y + 28), title, font=card_title_font, fill=(241, 245, 249), anchor="lm")

    # Bottom description badge
    draw.rounded_rectangle([(x + 12, y + h - 42), (x + w - 12, y + h - 10)], radius=6, fill=(26, 35, 52))
    draw.text((x + 20, y + h - 26), desc, font=card_desc_font, fill=(212, 160, 23) if "After" in title or "还原" in title else (148, 163, 184), anchor="lm")

    # Inner viewport
    pad = 12
    vx, vy, vw, vh = x + pad, y + 52, w - 2 * pad, h - 52 - 48
    if os.path.exists(img_path):
        im = Image.open(img_path).convert('RGB')
        im_ratio = im.width / im.height
        view_ratio = vw / vh

        if fit_mode == "contain":
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
        elif fit_mode == "center":
            scale = min(vw / im.width, vh / im.height)
            # if small icon, enlarge with nearest / box
            if im.width < 300:
                scale = min(vw / im.width, vh / im.height) * 0.85
                im_resized = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.NEAREST)
            else:
                im_resized = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
            ox = (vw - im_resized.width) // 2
            oy = (vh - im_resized.height) // 2
            poster.paste(im_resized, (vx + ox, vy + oy))
    else:
        draw.rectangle([(vx, vy), (vx + vw, vy + vh)], fill=(15, 23, 42))
        draw.text((vx + vw // 2, vy + vh // 2), f"Missing: {os.path.basename(img_path)}", font=card_title_font, fill=(148, 163, 184), anchor="mm")

# --- Top Row: 3 Cards (Height 690) ---
top_y = 130
top_h = 690
card_w3 = (W - 40 - 20 * 2) // 3 # 826

# Card 1: Original SC1 Reference
draw_card(
    REF_IMG,
    (20, top_y, card_w3, top_h),
    "【设计基准】《星际争霸1》原版人族地堡经典原画",
    "特征：低矮坚固八角碉堡 · 45°斜切立柱 · 顶置360°旋转探照灯 · 防爆射击口百叶",
    border_color=(70, 95, 130),
    fit_mode="center"
)

# Card 2: Before (90° Square Box)
draw_card(
    BEFORE_CLOSED_IMG,
    (20 + card_w3 + 20, top_y, card_w3, top_h),
    "【改造前 · Before】90°直角方盒 + 方形顶板外突",
    "问题：生硬方形90°直角外墙 · 四角平顶多余折角外突 · 结构呈方盒亭子，缺乏地堡质感",
    border_color=(180, 70, 70)
)

# Card 3: After (1/4 Octagonal Curved Chamfer)
draw_card(
    AFTER_CLOSED_IMG,
    (20 + (card_w3 + 20) * 2, top_y, card_w3, top_h),
    "【改造后 · After】2面连通/2面阻断 1/4圆角八角碉堡",
    "提升：45°斜切承重立柱+螺栓百叶 · 八角穹顶严丝合缝无外突 · 正面气闸门与红外射孔",
    border_color=(46, 204, 113)
)

# --- Bottom Row: 2 Major Comparison Cards (Height 690) ---
bot_y = top_y + top_h + 20
bot_h = 690
card_w2 = (W - 40 - 20) // 2 # 1240

# Bottom Left: Interior Before
draw_card(
    BEFORE_LIFTED_IMG,
    (20, bot_y, card_w2, bot_h),
    "【内部战位改造前 · Before】四角离散分离，无连续围护",
    "问题：4个单胞四角完全镂空断开，外墙互不相连，防爆与防御完整性不足",
    border_color=(180, 70, 70)
)

# Bottom Right: Interior After
draw_card(
    AFTER_LIFTED_IMG,
    (20 + card_w2 + 20, bot_y, card_w2, bot_h),
    "【内部战位改造后 · After】浑然一体八角环形封闭堡垒，战位供弹全面互联",
    "提升：1/4削角单胞围合连续八角外壁 · 4组C-14战位 · 中央旋转供弹滑轨 · 雷达台与逃生舱",
    border_color=(46, 204, 113)
)

# --- Footer ---
draw.rectangle([(0, H - 45), (W, H)], fill=(20, 26, 40))
draw.line([(0, H - 45), (W, H - 45)], fill=(38, 48, 64), width=1)
footer_text = "Septopus Engine 3D SPP 空间架构 · 纯数据 JSON 驱动 · 10组定制 PBR 3D 资产（ID 144-153） · 严守《AGENTS.md》红线 · 单元测试 100% 绿灯"
draw.text((W // 2, H - 22), footer_text, font=footer_font, fill=(148, 163, 184), anchor="mm")

poster.save(OUTPUT_POSTER)
print(f"Successfully generated comparison poster at {OUTPUT_POSTER} ({os.path.getsize(OUTPUT_POSTER)} bytes)")
