"""生成 Keep Alive 的扩展图标（运行：python3 tools/make_icons.py）。"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
SIZE = 1024
RADIUS = 232


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(size, top, bottom):
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        color = lerp(top, bottom, y / (size - 1))
        row = (*color, 255)
        for x in range(size):
            pixels[x, y] = row
    return image


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def build():
    size = SIZE
    mask = rounded_mask(size, RADIUS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # 1. 青绿渐变底
    canvas.paste(gradient(size, (26, 201, 148), (7, 138, 103)), (0, 0), mask)

    # 2. 顶部柔和高光
    fade = ImageOps.invert(Image.linear_gradient("L").resize((size, size)))
    fade = fade.point(lambda v: int(v * 0.30))
    highlight = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    canvas.alpha_composite(Image.composite(highlight, Image.new("RGBA", (size, size), (0, 0, 0, 0)), fade))

    # 3. 播放三角（先画直角，再用模糊 + 阈值把尖角磨圆）
    triangle_mask = Image.new("L", (size, size), 0)
    pts = [(392, 292), (392, 732), (764, 512)]
    ImageDraw.Draw(triangle_mask).polygon(pts, fill=255)
    triangle_mask = triangle_mask.filter(ImageFilter.GaussianBlur(34)).point(
        lambda v: 255 if v >= 128 else 0
    )
    triangle = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    triangle.putalpha(triangle_mask)

    # 4. 三角形投影
    shadow = triangle.filter(ImageFilter.GaussianBlur(28)).point(lambda v: int(v * 0.5))
    shadow = ImageChops.offset(shadow, 0, 14)
    shadow_layer = Image.new("RGBA", (size, size), (0, 48, 34, 255))
    shadow_layer.putalpha(shadow.split()[3])
    canvas.alpha_composite(shadow_layer)

    canvas.alpha_composite(triangle)

    # 5. 边缘收边，避免半透明毛边
    canvas.putalpha(ImageChops.multiply(canvas.split()[3], mask))

    OUT.mkdir(parents=True, exist_ok=True)
    for target in (128, 48, 32, 16):
        icon = canvas.resize((target, target), Image.LANCZOS)
        icon.save(OUT / f"icon{target}.png", optimize=True)
        print("wrote", OUT / f"icon{target}.png")


if __name__ == "__main__":
    build()
