import os
from PIL import Image, ImageDraw, ImageFont

brain_dir = "/Users/fuu/.gemini/antigravity-ide/brain/88b04b9e-783f-4aab-abe1-d75390b32bb0"
output_path = os.path.join(brain_dir, "sc1_terran_habitation_reference.png")

# Board dimensions: 2560 x 1440
W, H = 2560, 1440
board = Image.new("RGB", (W, H), (14, 18, 24))
draw = ImageDraw.Draw(board)

# Fonts
def get_font(size, bold=False):
    font_paths = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/STHeiti Light.ttc"
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

font_title = get_font(42, bold=True)
font_subtitle = get_font(20)
font_card_title = get_font(24, bold=True)
font_text = get_font(16)
font_badge = get_font(14, bold=True)

# Header
draw.rectangle([(0, 0), (W, 110)], fill=(20, 26, 36))
draw.rectangle([(0, 108), (W, 110)], fill=(0, 200, 230))
draw.text((60, 22), "《星际争霸1》官方人族居住与后勤建筑全景考证图录", font=font_title, fill=(240, 245, 255))
draw.text((60, 72), "Official StarCraft 1 Terran Habitation & Logistics Archival Reference Board ｜ 揭秘官方设定中“居住”与“人口”形态演变", font=font_subtitle, fill=(0, 200, 230))

# 4 Columns / Cards layout
cards = [
    {
        "title": "一、 《星际1》官方人口与居住核心：补给站 (Supply Depot)",
        "sub": "在 SC1 科技树中，补给站即为官方定义的人口、食物与士兵居住休整设施",
        "imgs": [
            ("sc1_supply_depot_remastered.png", "《星际1 重制版》高清重绘 3D 模型 (HD Sprite)"),
            ("sc1_supply_depot_classic.png", "1998年原版经典像素切片 (Classic 2D Sprite)")
        ],
        "desc": [
            "• 为什么《星际1》对战科技树没有叫“居住舱”的建筑？",
            "  因为在《星际1》官方说明书（Manual 1998）中，Supply Depot",
            "  （补给站）正是为人族部队与殖民拓荒者提供“食物冷藏、",
            "  电力供应、战术休整与居住床位（+8 人口）”的多功能复合设施。",
            "• 特征：重型防爆装甲外壳、上浮排气百叶窗、高压线缆与警示标贴。"
        ]
    },
    {
        "title": "二、 《星际1》室内基地生活与科研环境 (Installation)",
        "sub": "战役经典任务“雅各布基地”与阿梅里戈号飞船内部生活/工作舱",
        "imgs": [
            ("sc1_jacobs_station.jpg", "官方 CG：联邦驻军/科研基地指挥走廊与气闸"),
            ("sc1_installation_interior.jpg", "官方 CG：双向气压防爆密封大门内构")
        ],
        "desc": [
            "• 《星际1》人族室内建筑的标志性 Dieselpunk 复古未来美学：",
            "  - 重型双向气压滑动防爆门（带液压锁止齿与红/绿状态信号灯）",
            "  - 下沉式冲压防滑地板、排风排污钢网与天花板工字钢梁架",
            "  - 显像管荧光绿 CRT 监控终端与外露线缆，粗犷硬朗。"
        ]
    },
    {
        "title": "三、 《星际1》荒野定居点原画与平民生态 (Civilian)",
        "sub": "玛·萨拉荒漠拓荒前哨官方概念原画与身穿工装夹克的平民单位",
        "imgs": [
            ("sc1_wasteland_art.jpg", "暴雪官方原画：玛·萨拉荒野人类拓荒定居点"),
            ("sc1_civilian.png", "《星际1》官方唯一平民单位 (Civilian)")
        ],
        "desc": [
            "• 拓荒殖民地（Colony Outpost）的生存图景：",
            "  - 殖民者居住在由集装箱与装甲板改装而成的模块化铁皮棚屋中。",
            "  - 《星际1》平民（Civilian）身穿耐磨防尘帆布工装与厚重皮靴，",
            "    手握机械维修扳手，展现典型的“太空蓝领矿工”形象。"
        ]
    },
    {
        "title": "四、 暴雪后续推出的独立人族居住舱 (Civilian Hut)",
        "sub": "暴雪官方在《星际》体系中首次将人族民居独立建模的“殖民地小屋”",
        "imgs": [
            ("sc2_civilian_hut_1.jpg", "暴雪官方人族殖民地单体居住舱 (Hut Model 1)"),
            ("sc2_civilian_hut_2.jpg", "带观察窗与气闸门的强化居住舱 (Hut Model 2)")
        ],
        "desc": [
            "• 暴雪在后续作品中，将平民居住空间独立为【Civilian Hut】：",
            "  - 采用模块化长方体/八角防爆舱结构，外覆浅灰新钢铁装甲板；",
            "  - 正面设有气压防爆滑门与舷窗，顶部配备空调排风与通讯天线；",
            "• 这与我们本次按 SPP 规范推理构建的人族生活舱高度吻合！"
        ]
    }
]

# Layout: 4 columns
col_w = (W - 50 * 5) // 4
card_y = 135
card_h = H - card_y - 40

for i, c in enumerate(cards):
    cx = 50 + i * (col_w + 50)
    # Background card
    draw.rectangle([(cx, card_y), (cx + col_w, card_y + card_h)], fill=(22, 28, 38), outline=(38, 48, 64), width=1)
    
    # Title bar
    draw.rectangle([(cx, card_y), (cx + col_w, card_y + 80)], fill=(28, 36, 48))
    draw.text((cx + 16, card_y + 14), c["title"][:22], font=font_card_title, fill=(255, 255, 255))
    if len(c["title"]) > 22:
        draw.text((cx + 16, card_y + 42), c["title"][22:], font=font_card_title, fill=(255, 255, 255))
    draw.text((cx + 16, card_y + 86), c["sub"], font=font_badge, fill=(0, 200, 230))
    
    # Image area
    img_y = card_y + 115
    for img_file, img_label in c["imgs"]:
        fpath = os.path.join(brain_dir, img_file)
        if os.path.exists(fpath):
            try:
                sub_im = Image.open(fpath)
                # target aspect fit inside col_w - 32, max_h 210
                max_w = col_w - 32
                max_h = 220
                
                # Fit image
                ratio = min(max_w / sub_im.width, max_h / sub_im.height)
                nw, nh = int(sub_im.width * ratio), int(sub_im.height * ratio)
                if nw > 0 and nh > 0:
                    resized = sub_im.resize((nw, nh), Image.Resampling.LANCZOS)
                    # center horizontally
                    ox = cx + 16 + (max_w - nw) // 2
                    oy = img_y + (max_h - nh) // 2
                    
                    # Background frame
                    draw.rectangle([(cx + 16, img_y), (cx + 16 + max_w, img_y + max_h)], fill=(12, 16, 22), outline=(45, 58, 76), width=1)
                    if resized.mode == "RGBA":
                        board.paste(resized, (ox, oy), resized)
                    else:
                        board.paste(resized, (ox, oy))
                    
                    # Label below image
                    draw.text((cx + 16, img_y + max_h + 6), img_label, font=font_badge, fill=(200, 210, 225))
            except Exception as e:
                print(f"Error drawing image {img_file}: {e}")
        img_y += max_h + 38
        
    # Text description area
    draw.rectangle([(cx + 16, img_y), (cx + col_w - 16, card_y + card_h - 16)], fill=(16, 22, 30), outline=(32, 42, 56), width=1)
    ty = img_y + 12
    for line in c["desc"]:
        draw.text((cx + 24, ty), line, font=font_text, fill=(185, 195, 210))
        ty += 24

board.save(output_path, "PNG", quality=95)
print(f"Successfully generated reference board at {output_path} ({os.path.getsize(output_path)} bytes)")
