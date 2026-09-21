"""アプリアイコンを生成する。

    python3 scripts/make-icon.py

Pillow が要る（pip install Pillow）。build/icon.png と build/icon.ico を書き出す。
意匠：Excel の緑を背景に、白いシートと格子、右下に集計セルらしいアクセント。
"""
from PIL import Image, ImageDraw

S = 1024
BG_TOP = (16, 124, 65)  # Excel の緑
BG_BOTTOM = (11, 90, 47)
SHEET = (255, 255, 255)
GRID = (205, 214, 226)
HEADER = (225, 240, 231)
ACCENT = (16, 124, 65)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

grad = Image.new("RGB", (1, S))
for y in range(S):
    t = y / (S - 1)
    grad.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
grad = grad.resize((S, S))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * 0.22), fill=255)
img.paste(grad, (0, 0), mask)

m = round(S * 0.18)
sheet = [m, m, S - m, S - m]
d.rounded_rectangle(sheet, radius=round(S * 0.03), fill=SHEET)

x0, y0, x1, y1 = sheet
cols = rows = 4
cw = (x1 - x0) / cols
rh = (y1 - y0) / rows

d.rectangle([x0, y0, x1, y0 + rh], fill=HEADER)
d.rectangle([x0, y0, x0 + cw, y1], fill=HEADER)

lw = max(2, round(S * 0.005))
for i in range(1, cols):
    x = x0 + cw * i
    d.line([x, y0, x, y1], fill=GRID, width=lw)
for i in range(1, rows):
    y = y0 + rh * i
    d.line([x0, y, x1, y], fill=GRID, width=lw)
d.rounded_rectangle(sheet, radius=round(S * 0.03), outline=GRID, width=lw)

d.rectangle([x0 + cw * 3 + lw, y0 + rh * 3 + lw, x1 - lw, y1 - lw], fill=ACCENT)

img.save("build/icon.png")
img.save("build/icon.ico", sizes=[(s, s) for s in [256, 128, 64, 48, 32, 16]])
print("wrote build/icon.png and build/icon.ico")
