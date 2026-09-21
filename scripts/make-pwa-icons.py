"""PWA / ホーム画面用のアイコンを build/icon.png から生成する。

    python3 scripts/make-pwa-icons.py

Pillow が要る（pip install Pillow）。src/renderer/public/icons/ に書き出す。
  - icon-192.png / icon-512.png : 通常のアイコン（角丸・透明背景）
  - icon-maskable-512.png       : Android の maskable 用。全面を緑で塗り、中央 80% に本体
  - apple-touch-icon.png        : iOS 用 180px。iOS が角を丸めるので全面塗り
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "build" / "icon.png"
OUT = ROOT / "src" / "renderer" / "public" / "icons"
GREEN = (16, 124, 65, 255)

OUT.mkdir(parents=True, exist_ok=True)
base = Image.open(SRC).convert("RGBA")

for size in (192, 512):
    base.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")


def full_bleed(size: int, inner_ratio: float) -> Image.Image:
    """緑で全面を塗り、中央に本体を置く（OS 側が角を丸める前提のアイコン）"""
    img = Image.new("RGBA", (size, size), GREEN)
    inner = round(size * inner_ratio)
    icon = base.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    img.alpha_composite(icon, (offset, offset))
    return img


full_bleed(512, 0.8).save(OUT / "icon-maskable-512.png")
full_bleed(180, 0.86).convert("RGB").save(OUT / "apple-touch-icon.png")
print(f"wrote icons to {OUT}")
