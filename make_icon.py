# make_icon.py
# 生成极简对勾图标（多尺寸 ICO），输出到 ./assets/icon.ico
# 依赖：Pillow  ->  pip install pillow

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

# 你可以改这些颜色/尺寸来定制风格
BG_COLOR_TOP = (67, 160, 71, 255)    # 顶部绿色
BG_COLOR_BOTTOM = (46, 125, 50, 255) # 底部绿色
CHECK_COLOR = (255, 255, 255, 255)   # 对勾白色
CANVAS = 512                          # 先画 512x512，再生成多尺寸
RADIUS = 96                           # 圆角半径
SIZES = [256, 128, 64, 48, 32, 16]    # ICO 里包含的尺寸

def rounded_rect(draw: ImageDraw.ImageDraw, xy, r, fill):
    """画圆角矩形"""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill)

def vertical_gradient(size, top_rgba, bottom_rgba):
    """生成纵向渐变图层"""
    w, h = size
    grad = Image.new("RGBA", size, 0)
    p = grad.load()
    for y in range(h):
        t = y / (h - 1)
        pcolor = tuple(int(top_rgba[i] * (1 - t) + bottom_rgba[i] * t) for i in range(4))
        for x in range(w):
            p[x, y] = pcolor
    return grad

def draw_checkmark(draw: ImageDraw.ImageDraw, w, h, color):
    """
    画一个圆角粗线的对勾：
      起点：左下 0.28w, 0.55h
      中点：0.45w, 0.72h
      终点：右上 0.75w, 0.38h
    """
    ax, ay = int(0.28*w), int(0.55*h)
    bx, by = int(0.45*w), int(0.72*h)
    cx, cy = int(0.75*w), int(0.38*h)
    width = max(10, int(w * 0.10))  # 线宽约 10% 宽度

    # Pillow 新版本支持 joint/cap；旧版本忽略这些参数也不影响效果
    draw.line([ (ax, ay), (bx, by) ], fill=color, width=width, joint="round")
    draw.line([ (bx, by), (cx, cy) ], fill=color, width=width, joint="round")

def make_icon():
    dst_dir = Path("assets")
    dst_dir.mkdir(parents=True, exist_ok=True)
    out_ico = dst_dir / "icon.ico"

    # 画基础画布（透明）
    base = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    # 背景圆角矩形 + 轻微内阴影
    bg = vertical_gradient((CANVAS, CANVAS), BG_COLOR_TOP, BG_COLOR_BOTTOM)
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, CANVAS-1, CANVAS-1], radius=RADIUS, fill=255)
    bg_round = Image.composite(bg, Image.new("RGBA", (CANVAS, CANVAS), 0), mask)

    # 内阴影（可选，柔和一点）
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0,0,0,0))
    sh_draw = ImageDraw.Draw(shadow)
    sh_draw.rounded_rectangle([16, 16, CANVAS-17, CANVAS-17], radius=RADIUS, fill=(0,0,0,90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))

    composed = Image.alpha_composite(base, shadow)
    composed = Image.alpha_composite(composed, bg_round)

    # 画对勾
    draw2 = ImageDraw.Draw(composed)
    draw_checkmark(draw2, CANVAS, CANVAS, CHECK_COLOR)

    # 生成多尺寸并保存为 ICO
    # 注意：必须传 sizes 参数，生成真正的多分辨率 ICO
    composed.save(out_ico, format="ICO", sizes=[(s, s) for s in SIZES])

    print(f"[OK] 生成完成：{out_ico.resolve()}  （包含尺寸：{SIZES}）")

if __name__ == "__main__":
    try:
        make_icon()
    except ModuleNotFoundError:
        print("请先安装 Pillow： pip install pillow")
