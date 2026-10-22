"""生成 Chrome Web Store 所需的素材（运行：python3 tools/make_store_assets.py）。

输入（默认 ./.raw-shots，可用 --raw-dir 指定）：
  raw-options-top.png   设置页 1280x800
  raw-options-add.png   设置页「添加站点」1280x800
  raw-popup.png         弹窗 2x 截图
  raw-bilibili.png      B 站页面 1280x800

输出（默认 ./store）：
  icon-128.png          带 16px 透明留白的商店图标
  promo-440x280.png     小宣传图
  promo-1400x560.png    Marquee
  screenshot-1..5.png   商店截图 1280x800
"""

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BOLD = "/System/Library/Fonts/STHeiti Medium.ttc"
REG = "/System/Library/Fonts/Hiragino Sans GB.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"

ACCENT = (12, 166, 120)
DARK = (15, 23, 42)
MUTED = (91, 101, 119)
FAINT = (122, 132, 148)
WHITE = (255, 255, 255)


def F(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def make_bg(size, top=(248, 250, 249), bottom=(232, 241, 237)):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / (h - 1)))
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((w - 620, -300, w + 160, 420), fill=(12, 166, 120, 28))
    gd.ellipse((-260, h - 300, 420, h + 220), fill=(12, 166, 120, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    return Image.alpha_composite(img.convert("RGBA"), glow).convert("RGBA")


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=255
    )
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def place_card(base, card, xy, radius=20, blur=28, offset=(0, 14), alpha=60):
    x, y = xy
    w, h = card.size
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle(
        (x, y + offset[1], x + w, y + h + offset[1]), radius=radius, fill=(9, 40, 30, alpha)
    )
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(sh)
    base.alpha_composite(rounded(card, radius), (x, y))


def chip(img, xy, label, f):
    w = int(f.getlength(label)) + 26
    layer = Image.new("RGBA", (w, 30), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle((0, 0, w - 1, 29), radius=15, fill=(12, 166, 120, 30))
    ld.text((13, 15), label, font=f, fill=ACCENT, anchor="lm")
    img.alpha_composite(layer, xy)


def text(d, xy, s, f, fill, anchor="la"):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


TOKEN_RE = re.compile(r"[A-Za-z0-9_.$()\[\]{}/<>:=+*#%&|\\-]+|\s+|.", re.S)
# 行首禁则：这些标点不能出现在一行开头
NO_LINE_START = set("，。、；：？！）]」』】》%,.;:!?)]}")


def wrap(d, s, f, width):
    lines, cur = [], ""
    for tok in TOKEN_RE.findall(s):
        if not cur.strip() and tok in NO_LINE_START and lines:
            lines[-1] += tok
            continue
        if d.textlength(cur + tok, font=f) <= width:
            cur += tok
            continue
        if cur.strip():
            lines.append(cur.rstrip())
        if tok in NO_LINE_START and lines:
            lines[-1] += tok
            cur = ""
        else:
            cur = "" if tok.isspace() else tok
    if cur.strip():
        lines.append(cur.rstrip())
    return lines or [""]


# ---------------------------------------------------------------- icon
def store_icon(out, icon_path):
    src = Image.open(icon_path).convert("RGBA")
    src = src.resize((96, 96), Image.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(src, (16, 16))
    canvas.save(out, "PNG", optimize=True)


# ---------------------------------------------------------------- promo
def promo_small(icon_path, out):
    W, H = 440, 280
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp((10, 54, 43), (10, 132, 99), y / (H - 1)) + (255,))

    decor = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(decor)
    dd.ellipse((230, -120, 560, 210), fill=(255, 255, 255, 12))
    dd.ellipse((-120, 170, 200, 420), fill=(255, 255, 255, 8))
    img.alpha_composite(decor.filter(ImageFilter.GaussianBlur(40)))

    icon = rounded(Image.open(icon_path).convert("RGBA").resize((86, 86), Image.LANCZOS), 20)
    img.alpha_composite(icon, (30, 30))

    d = ImageDraw.Draw(img)
    text(d, (132, 38), "Keep Alive", F(BOLD, 31, 1), WHITE)
    text(d, (133, 80), "后台视频常亮", F(REG, 16), (255, 255, 255, 200))

    d.rectangle((30, 140, 54, 144), fill=ACCENT)
    text(d, (30, 160), "切到别的标签页", F(BOLD, 23, 1), WHITE)
    text(d, (30, 196), "视频也不降级为纯音频", F(BOLD, 23, 1), (190, 255, 226))
    text(d, (30, 244), "常见视频站点 · 一键启用", F(REG, 13), (255, 255, 255, 160))

    img.convert("RGB").save(out, "PNG", optimize=True)


def promo_marquee(icon_path, popup, out):
    W, H = 1400, 560
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp((9, 48, 39), (10, 128, 96), y / (H - 1)) + (255,))

    decor = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(decor)
    dd.ellipse((740, -260, 1500, 420), fill=(255, 255, 255, 14))
    dd.ellipse((-200, 260, 460, 760), fill=(255, 255, 255, 8))
    img.alpha_composite(decor.filter(ImageFilter.GaussianBlur(70)))

    icon = rounded(Image.open(icon_path).convert("RGBA").resize((112, 112), Image.LANCZOS), 26)
    img.alpha_composite(icon, (92, 84))

    d = ImageDraw.Draw(img)
    text(d, (232, 86), "Keep Alive", F(BOLD, 58, 1), WHITE)
    text(d, (234, 158), "后台视频常亮", F(REG, 27), (190, 255, 226))

    text(d, (92, 264), "让视频网站以为标签页一直在前台", F(BOLD, 26, 1), WHITE)
    text(d, (92, 302), "切到后台不再降级为纯音频，切回不卡顿", F(REG, 21), (255, 255, 255, 205))
    for i, line in enumerate(["只在你添加的站点运行", "无网络请求 · 不上传数据", "Chrome / Edge 111+"]):
        y = 372 + i * 38
        d.ellipse((94, y + 8, 102, y + 16), fill=(120, 230, 190))
        text(d, (116, y), line, F(REG, 17), (255, 255, 255, 190))

    pw = 440
    ph = round(popup.size[1] * pw / popup.size[0])
    place_card(img, popup.resize((pw, ph), Image.LANCZOS), (876, 96), radius=22, blur=34, offset=(0, 22), alpha=95)
    img.convert("RGB").save(out, "PNG", optimize=True)


# ---------------------------------------------------------------- slides
def slide_popup(popup, out):
    img = make_bg((1280, 800))
    d = ImageDraw.Draw(img)
    chip(img, (80, 104), "工具栏弹窗", F(REG, 15))
    text(d, (80, 156), "一键切换", F(BOLD, 50, 1), DARK)
    text(d, (80, 220), "当前站点", F(BOLD, 50, 1), DARK)
    d.rectangle((80, 306, 108, 311), fill=ACCENT)
    text(d, (80, 336), "保护中 / 待生效 / 已暂停", F(REG, 21), MUTED)
    text(d, (80, 374), "当前状态一眼看清", F(REG, 21), MUTED)
    text(d, (80, 436), "只对列表内的站点注入脚本，", F(REG, 18), FAINT)
    text(d, (80, 466), "其它网站完全不受影响", F(REG, 18), FAINT)
    text(d, (80, 650), "B 站 · YouTube · 腾讯视频 · 爱奇艺 · 优酷 …", F(REG, 15), FAINT)

    pw = 470
    ph = round(popup.size[1] * pw / popup.size[0])
    place_card(img, popup.resize((pw, ph), Image.LANCZOS), (690, 190), radius=22, blur=36, offset=(0, 20), alpha=80)
    img.convert("RGB").save(out, "PNG", optimize=True)


def slide_bilibili(shot, out):
    img = make_bg((1280, 800))
    d = ImageDraw.Draw(img)
    chip(img, (80, 104), "B 站实测", F(REG, 15))
    text(d, (80, 156), "切走 30 秒", F(BOLD, 50, 1), DARK)
    text(d, (80, 220), "回来接着看", F(BOLD, 50, 1), DARK)
    d.rectangle((80, 306, 108, 311), fill=ACCENT)
    text(d, (80, 336), "播放器收不到「我隐藏了」的信号", F(REG, 19), MUTED)
    text(d, (80, 372), "不会切到纯音频，也不重新缓冲", F(REG, 19), MUTED)
    text(d, (80, 650), "不切音频流 · 不重建解码器 · 不重新缓冲", F(REG, 15), FAINT)

    pw = 738
    ph = round(shot.size[1] * pw / shot.size[0])
    place_card(img, shot.resize((pw, ph), Image.LANCZOS), (468, 176), radius=18, blur=34, offset=(0, 18), alpha=85)
    img.convert("RGB").save(out, "PNG", optimize=True)


def slide_how(out):
    img = make_bg((1280, 800))
    d = ImageDraw.Draw(img)
    chip(img, (80, 92), "工作原理", F(REG, 15))
    text(d, (80, 140), "它只做四件事", F(BOLD, 50, 1), DARK)
    text(d, (80, 218), "在页面加载前注入，把「你切走了」这件事从页面眼里抹掉", F(REG, 19), MUTED)

    cards = [
        ("01", "可见性", "document.hidden 恒为 false，visibilityState 恒为 visible"),
        ("02", "焦点", "document.hasFocus() 恒为 true，播放器不会误判失焦"),
        ("03", "事件", "捕获阶段吞掉 visibilitychange 与窗口 blur，页面收不到"),
        ("04", "帧循环", "后台接管 requestAnimationFrame，动画循环不会停摆"),
    ]
    x0, y0, w, gap = 80, 320, 262, 26
    for i, (num, title, body) in enumerate(cards):
        card = Image.new("RGB", (w, 272), WHITE)
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle((0, 0, w - 1, 271), radius=20, fill=WHITE, outline=(228, 234, 240), width=1)
        cd.text((24, 24), num, font=F(MONO, 22), fill=ACCENT)
        cd.text((24, 72), title, font=F(BOLD, 24, 1), fill=DARK)
        yy = 118
        for line in wrap(cd, body, F(REG, 16), w - 48):
            cd.text((24, yy), line, font=F(REG, 16), fill=MUTED)
            yy += 27
        place_card(img, card, (x0 + i * (w + gap), y0), radius=20, blur=20, offset=(0, 10), alpha=45)

    text(d, (80, 664), "只在你添加的站点运行  ·  无网络请求  ·  无远程代码  ·  不上传数据", F(REG, 15), FAINT)
    img.convert("RGB").save(out, "PNG", optimize=True)


def crop_popup(path, height=560, width=688):
    img = Image.open(path).convert("RGB")
    return img.crop((0, 0, min(width, img.size[0]), min(height, img.size[1])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default=".raw-shots")
    parser.add_argument("--out", default="store")
    parser.add_argument("--icon", default="icons/icon128.png")
    args = parser.parse_args()

    raw = Path(args.raw_dir)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    store_icon(out / "icon-128.png", Path(args.icon))
    promo_small(args.icon, out / "promo-440x280.png")

    popup_src = raw / "raw-popup.png"
    if popup_src.exists():
        popup = crop_popup(popup_src)
        promo_marquee(args.icon, popup, out / "promo-1400x560.png")
        slide_popup(popup, out / "screenshot-2.png")

    bili = raw / "raw-bilibili.png"
    if bili.exists():
        slide_bilibili(Image.open(bili).convert("RGB"), out / "screenshot-3.png")

    slide_how(out / "screenshot-4.png")

    top = raw / "raw-options-top.png"
    if top.exists():
        Image.open(top).convert("RGB").save(out / "screenshot-1.png", "PNG", optimize=True)
    advanced = raw / "raw-options-advanced.png"
    if advanced.exists():
        Image.open(advanced).convert("RGB").save(out / "screenshot-5.png", "PNG", optimize=True)

    print("done →", out)


if __name__ == "__main__":
    main()
