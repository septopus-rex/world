import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ISO_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_isometric.png')
GATE_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_moongate.png')
TABLE_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_table.png')
WELL_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_well.png')
ROOF_UP_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_roof_up.png')
VERANDA_VIEW_IMG = os.path.join(BRAIN_DIR, 'pal1_courtyard_veranda_view.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'pal1_courtyard_evaluation_poster.png')

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

title_font = get_font(38)
subtitle_font = get_font(20)
card_title_font = get_font(22)
code_font = get_font(16)

# Header
draw.rectangle([(0, 0), (W, 110)], fill=(20, 24, 33))
draw.line([(0, 110), (W, 110)], fill=(45, 55, 75), width=2)

title_text = "SPP《仙剑奇侠传》余杭客栈 · 多 SPP 混合合院庭院关卡评测报告"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "方案 B 落地实测：多 SPP 混合处理 (SPP1 北院客房 + SPP2 中庭园林) · 跨 SPP 边界对齐与无缝漫游验证"
draw.text((W // 2, 82), sub_text, font=subtitle_font, fill=(180, 195, 215), anchor="mm")

def draw_card(img_path, rect, title, border_color=(70, 130, 220)):
    x, y, w, h = rect
    draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=12, fill=(24, 28, 38), outline=border_color, width=3)
    
    draw.rounded_rectangle([(x + 12, y + 10), (x + w - 12, y + 44)], radius=6, fill=(35, 42, 58))
    draw.text((x + 20, y + 27), title, font=card_title_font, fill=(235, 240, 250), anchor="lm")
    
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

# Layout:
# Top Row: 2 large cards (Isometric Overview + Moon Gate Entrance)
draw_card(ISO_IMG, (40, 125, 1220, 750), "① 多 SPP 合院全貌 · 北院双坡大屋顶上房 + 中庭露天园林天井 + 南院圆形月亮门", border_color=(235, 175, 75))
draw_card(GATE_IMG, (1300, 125, 1220, 750), "② 南院月亮门入口 · 透过圆形门洞窥见青石茶席、假山古井与北院正房（移步换景）", border_color=(60, 200, 140))

# Bottom Row: 4 detail cards across
draw_card(TABLE_IMG, (40, 895, 600, 525), "③ 中庭青石八仙桌 · 龙泉青瓷提梁茶席 + 四只石鼓绣墩", border_color=(100, 180, 245))
draw_card(WELL_IMG, (660, 895, 600, 525), "④ 八角青石古井台 · 辘轳提水木桶 + 太湖石叠石盆景", border_color=(220, 100, 140))
draw_card(ROOF_UP_IMG, (1280, 895, 600, 525), "⑤ 庭院仰视北院 · 0.8m 挑檐遮阳 + 瓦当滴水 + 飞檐青瓦垄背", border_color=(100, 200, 220))
draw_card(VERANDA_VIEW_IMG, (1900, 895, 620, 525), "⑥ 回廊俯瞰中庭 · 跨 SPP 边界对齐（corridor_open ↔ 庭院开敞路）", border_color=(200, 140, 230))

# Footer bar (Y: 1440 to 1600)
draw.rectangle([(0, 1440), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1440), (W, 1440)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【多 SPP 混合处理发现的新问题与技术验证】",
    "1. 跨 SPP 边界面消除盲区：单一 SPP 内相邻胞元可依靠 NEGATIVE_FACE_DIR 自动消除负向共面，但不同 SPP 实例间彼此隔离无共享索引。若两端未显式约定，将发生双重墙体重叠（Z-fighting）。",
    "2. 跨 SPP 通道接口规范：在 SPP 1 回廊南面配置专用 corridor_open（去除栏杆、保留立柱楣坊），SPP 2 北面对应配置 [0, empty]，彻底实现零阻碍通行与视觉贯通！",
    "3. 露天采光与室内照明对比：SPP 2 顶面配置 empty（直通天空），阳光自然洒入庭院与粉墙，与 SPP 1 回廊与客房内顶棚暖光宫灯形成极佳的明暗层次。"
]

footer_col2 = [
    "【高精 3D 园林构件重构与仙剑风韵再现】",
    "1. 5 款高精古建构件：苏式圆形月亮门（ID 105）、青石八仙桌与石鼓凳茶席（ID 106）、八角古井台与木质辘轳吊桶（ID 107）、太湖石叠石假山盆景（ID 108）、海棠漏窗白粉墙（ID 109）。",
    "2. 严格遵循 AGENTS.md 守则：资产全量注册 demo.manifest.json，纯 JSON 编写 pal1_courtyard.level.json 与 pal1_inn.stylepack.json，引擎 0 侧门。",
    "3. 门禁全绿：vitest spp-pal1-courtyard.test.ts 单元测试通过，全套 967 门禁 100% 保持全绿，PWA 生产构建顺利打包。"
]

def draw_wrapped_text(draw, text, x, y, max_w, font, fill, line_spacing=26):
    words = text
    curr_line = ""
    curr_y = y
    for ch in words:
        test_line = curr_line + ch
        bbox = font.getbbox(test_line)
        w = bbox[2] - bbox[0]
        if w > max_w:
            draw.text((x, curr_y), curr_line, font=font, fill=fill)
            curr_y += line_spacing
            curr_line = ch
        else:
            curr_line = test_line
    if curr_line:
        draw.text((x, curr_y), curr_line, font=font, fill=fill)
        curr_y += line_spacing
    return curr_y

fy1 = 1455
for i, line in enumerate(footer_col1):
    c = (245, 205, 120) if i == 0 else (210, 220, 235)
    fy1 = draw_wrapped_text(draw, line, 50, fy1, 1180, code_font, c, line_spacing=24)

fy2 = 1455
for i, line in enumerate(footer_col2):
    c = (245, 205, 120) if i == 0 else (210, 220, 235)
    fy2 = draw_wrapped_text(draw, line, 1310, fy2, 1180, code_font, c, line_spacing=24)

poster.save(OUTPUT_POSTER, quality=95)
print(f"Master courtyard poster saved successfully to: {OUTPUT_POSTER}")
