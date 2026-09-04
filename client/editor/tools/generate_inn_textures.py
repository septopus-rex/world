import os
import random
from PIL import Image, ImageDraw, ImageFilter

ASSETS_DIR = '/Users/fuu/Desktop/AI/world/client/desktop/public/assets'

def generate_ground():
    w, h = 512, 512
    img = Image.new('RGB', (w, h), (86, 88, 84))
    pixels = img.load()
    
    num_tiles = 4
    tile_size = w // num_tiles
    
    random.seed(199507)
    
    # Base tile hue - authentic PAL1 slate flagstones
    for y in range(h):
        for x in range(w):
            tx = x // tile_size
            ty = y // tile_size
            
            # Subtle variation per tile: warm stone vs cool slate
            th = ((tx * 89 + ty * 233) % 19) - 9
            th_cool = ((tx * 41 + ty * 113) % 9) - 4
            
            r0 = 87 + th + th_cool
            g0 = 90 + th
            b0 = 88 + th - th_cool
            pixels[x, y] = (max(0, min(255, r0)), max(0, min(255, g0)), max(0, min(255, b0)))
            
    # Add subtle slate stone texture and mottling
    for _ in range(16000):
        rx = random.randint(0, w - 1)
        ry = random.randint(0, h - 1)
        dv = random.randint(-18, 18)
        cr, cg, cb = pixels[rx, ry]
        pixels[rx, ry] = (max(40, min(210, cr + dv)), max(40, min(210, cg + dv)), max(40, min(210, cb + dv)))
        
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    draw = ImageDraw.Draw(img)
    
    # Grout lines & bevels - crisper contrast matching PAL1 1995 pixel map
    grout_color = (124, 126, 120)      # PAL1 classic light grey mortar joint
    grout_core = (142, 145, 138)       # Centre bright highlight of grout
    shadow_color = (52, 54, 51)        # Tile chiseled edge shadow
    highlight_color = (112, 115, 110)  # Tile edge highlight
    
    for i in range(num_tiles):
        for j in range(num_tiles):
            x0 = j * tile_size
            y0 = i * tile_size
            x1 = x0 + tile_size
            y1 = y0 + tile_size
            
            # Tile perimeter bevel
            draw.line([(x0 + 1, y1 - 2), (x1 - 1, y1 - 2)], fill=shadow_color, width=1)
            draw.line([(x1 - 2, y0 + 1), (x1 - 2, y1 - 1)], fill=shadow_color, width=1)
            draw.line([(x0 + 2, y0 + 2), (x1 - 2, y0 + 2)], fill=highlight_color, width=1)
            draw.line([(x0 + 2, y0 + 2), (x0 + 2, y1 - 2)], fill=highlight_color, width=1)

    # Grout grid (seamless wrapping across borders)
    for k in range(num_tiles):
        p = k * tile_size
        draw.line([(0, p), (w, p)], fill=grout_color, width=4)
        draw.line([(p, 0), (p, h)], fill=grout_color, width=4)
        draw.line([(0, p), (w, p)], fill=grout_core, width=2)
        draw.line([(p, 0), (p, h)], fill=grout_core, width=2)
        
    out_path = os.path.join(ASSETS_DIR, 'pal1-inn-ground.png')
    img.save(out_path, 'PNG')
    print(f'Generated: {out_path}')

def generate_woodfloor():
    w, h = 512, 512
    img = Image.new('RGB', (w, h), (92, 58, 38))
    pixels = img.load()
    
    num_planks = 8
    plank_h = h // num_planks
    
    random.seed(202609)
    
    for ty in range(num_planks):
        py0 = ty * plank_h
        py1 = py0 + plank_h
        
        # Warm chestnut/teak wood tone (strictly warm reddish brown)
        pr = random.randint(94, 114)
        pg = random.randint(54, 68)
        pb = random.randint(34, 44)
        
        for y in range(py0, py1):
            for x in range(w):
                grain = random.randint(-6, 6)
                streak = random.randint(-12, 12) if random.random() < 0.22 else 0
                r = max(45, min(150, pr + grain + streak))
                g = max(25, min(95, pg + grain + streak))
                b = max(15, min(65, pb + grain + streak))
                pixels[x, y] = (r, g, b)
                
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    draw = ImageDraw.Draw(img)
    
    seam_dark = (40, 22, 15)
    seam_highlight = (124, 82, 54)
    for k in range(num_planks):
        y = k * plank_h
        draw.line([(0, (y - 1) % h), (w, (y - 1) % h)], fill=seam_dark, width=1)
        draw.line([(0, y), (w, y)], fill=seam_dark, width=1)
        draw.line([(0, (y + 1) % h), (w, (y + 1) % h)], fill=seam_highlight, width=1)
        
    out_path = os.path.join(ASSETS_DIR, 'pal1-inn-woodfloor.png')
    img.save(out_path, 'PNG')
    print(f'Generated: {out_path}')

def generate_wallboard():
    w, h = 512, 512
    img = Image.new('RGB', (w, h), (116, 58, 42))
    pixels = img.load()
    
    num_panels = 4
    panel_w = w // num_panels
    
    random.seed(199511)
    
    for tx in range(num_panels):
        px0 = tx * panel_w
        px1 = px0 + panel_w
        
        pr = random.randint(112, 128)
        pg = random.randint(54, 66)
        pb = random.randint(36, 46)
        
        for x in range(px0, px1):
            for y in range(h):
                grain = random.randint(-6, 6)
                vert_streak = random.randint(-10, 10) if random.random() < 0.25 else 0
                r = max(50, min(170, pr + grain + vert_streak))
                g = max(25, min(110, pg + grain + vert_streak))
                b = max(15, min(80, pb + grain + vert_streak))
                pixels[x, y] = (r, g, b)
                
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    draw = ImageDraw.Draw(img)
    
    seam_dark = (50, 24, 18)
    seam_highlight = (148, 82, 60)
    for k in range(num_panels):
        x = k * panel_w
        draw.line([((x - 1) % w, 0), ((x - 1) % w, h)], fill=seam_dark, width=1)
        draw.line([(x, 0), (x, h)], fill=seam_dark, width=1)
        draw.line([((x + 1) % w, 0), ((x + 1) % w, h)], fill=seam_highlight, width=1)
        
    out_path = os.path.join(ASSETS_DIR, 'pal1-inn-wallboard.png')
    img.save(out_path, 'PNG')
    print(f'Generated: {out_path}')

if __name__ == '__main__':
    generate_ground()
    generate_woodfloor()
    generate_wallboard()
