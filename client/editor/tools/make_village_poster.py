import os
from PIL import Image, ImageDraw, ImageFont

BRAIN_DIR = '/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0'
ISO_IMG = os.path.join(BRAIN_DIR, 'pal1_village_isometric.png')
PATH_EAST_IMG = os.path.join(BRAIN_DIR, 'pal1_village_path_east.png')
EAST_GATE_IMG = os.path.join(BRAIN_DIR, 'pal1_village_east_gate.png')
WEST_GATE_IMG = os.path.join(BRAIN_DIR, 'pal1_village_west_gate.png')
WEST_LOOK_IMG = os.path.join(BRAIN_DIR, 'pal1_village_west_look.png')
DETAIL_IMG = os.path.join(BRAIN_DIR, 'pal1_village_detail.png')
OUTPUT_POSTER = os.path.join(BRAIN_DIR, 'pal1_village_evaluation_poster.png')

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

title_text = "SPP《仙剑奇侠传》盛渔村 · 外部环境布局与多合院串联评测报告"
draw.text((W // 2, 40), title_text, font=title_font, fill=(245, 205, 120), anchor="mm")

sub_text = "实装验证：外部环境布局 SPP (青石步道网 + 垂柳修竹 + 石灯笼) 串联东跨院与西跨院多合院聚落"
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
# Top Row: 2 large cards (Isometric Overview + Promenade Looking East)
draw_card(ISO_IMG, (40, 125, 1220, 750), "① 多合院水乡全貌 · 外部青石大道贯穿串联「东院客栈正房」与「西院幽篁别院」全景", border_color=(235, 175, 75))
draw_card(PATH_EAST_IMG, (1300, 125, 1220, 750), "② 外部主步道东望 · 青石板路、暖光石经幢灯笼、苍劲垂柳、单孔小青石桥与竹篱柴扉", border_color=(60, 200, 140))

# Bottom Row: 4 detail cards across
draw_card(EAST_GATE_IMG, (40, 895, 600, 525), "③ 东院月亮门步道接口 · 丁字路口分支无缝接入圆形月亮门（移步换景）", border_color=(100, 180, 245))
draw_card(WEST_GATE_IMG, (660, 895, 600, 525), "④ 西院别院步道接口 · 穿过石灯与修竹林进入西跨院幽篁雅轩", border_color=(220, 100, 140))
draw_card(WEST_LOOK_IMG, (1280, 895, 600, 525), "⑤ 石桥西望全景通道 · 从东侧单孔小石桥回望水乡林荫长街与院落群", border_color=(100, 200, 220))
draw_card(DETAIL_IMG, (1900, 895, 620, 525), "⑥ 外部自然构件特写 · 八角石灯笼暖光灯芯 + 茂密修竹林簇 + 垂柳依依", border_color=(200, 140, 230))

# Footer bar (Y: 1440 to 1600)
draw.rectangle([(0, 1440), (W, H)], fill=(18, 22, 30))
draw.line([(0, 1440), (W, 1440)], fill=(45, 55, 75), width=2)

footer_col1 = [
    "【外部环境布局 SPP 的技术创新与空间串联模式】",
    "1. 室外交通骨干网 SPP 化：通过 4m 单元网格标准化步道语法（path_stone_ns, path_stone_ew, path_stone_t_north, path_stone_cross），实现任意复杂聚落街道网络的拼装扩建。",
    "2. 跨 SPP 双向对齐通道：主街丁字路口与各合院月亮门（moon_gate）毫米级精准对齐，石板地面无缝接入门槛，实现真正意义上的「从小院走出、漫步林荫石径、步入另一小院」！",
    "3. 纯露天自然景观层级：环境 SPP 顶面 100% empty，阳光遍洒青石板与绿草地，竹篱柴扉阻隔视线与物理穿模，形成错落有致的私密合院与公共村道格局。"
]

footer_col2 = [
    "【5 款高精仙剑环境构件与全套工程规范保障】",
    "1. 5 款高精 3D 构件：江南石经幢石灯笼（ID 110）、青翠修竹林簇（ID 111）、古意垂柳（ID 112）、单孔青石小拱桥（ID 113）、柴扉竹篱笆（ID 114）。",
    "2. 资产与规范保证：全量注册 demo.manifest.json，纯 JSON 编写，引擎 0 侧门，碰撞体隐形标志统一配置（stopHidden: true，彻底杜绝半透明力场）。",
    "3. 门禁全绿：vitest spp-pal1-environment.test.ts 通过，全套 975 项测试 100% 保持全绿，PWA 生产构建顺利打包。"
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
print(f"Master village poster saved successfully to: {OUTPUT_POSTER}")
