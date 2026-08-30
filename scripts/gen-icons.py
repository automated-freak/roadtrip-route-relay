#!/usr/bin/env python3
"""Generate Route Relay PWA/app icons + iOS splash/launch images with Pillow.

Design: dark slate gradient background, a blue route polyline with a white
dashed centre line, a start dot, and a green destination pin.

Outputs (into icons/):
  - icon-512.png, icon-192.png, maskable-512.png, apple-touch-icon.png (180),
    favicon-48.png
  - splash-<W>x<H>.png for common portrait iPhones (solid #0f1115 + centred motif)
"""
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
)

# Route geometry in a normalized 0..1 coordinate space (y down).
# Kept inside the maskable safe zone (~80% diameter).
ROUTE = [(0.275, 0.74), (0.42, 0.58), (0.60, 0.56), (0.725, 0.385)]
START = ROUTE[0]
END = ROUTE[-1]

GRAD_TOP = (23, 35, 58)
GRAD_BOTTOM = (11, 15, 24)
SPLASH_BG = (15, 17, 21)  # #0f1115 (matches manifest background_color / theme_color)

# Common portrait iPhone launch-image sizes (filename, pixel width, pixel height).
SPLASHES = [
    ("splash-640x1136.png", 640, 1136),    # iPhone SE (1st) / 5s
    ("splash-750x1334.png", 750, 1334),    # iPhone 8 / SE (2nd/3rd)
    ("splash-828x1792.png", 828, 1792),    # iPhone XR / 11
    ("splash-1125x2436.png", 1125, 2436),  # iPhone X / XS / 11 Pro
    ("splash-1170x2532.png", 1170, 2532),  # iPhone 12 / 13 / 14
    ("splash-1179x2556.png", 1179, 2556),  # iPhone 14 Pro / 15
    ("splash-1290x2796.png", 1290, 2796),  # iPhone 14 Pro Max / 15 Plus
]


def lerp(a, b, t):
    return a + (b - a) * t


def polyline_length(points):
    total = 0.0
    for i in range(1, len(points)):
        dx = points[i][0] - points[i - 1][0]
        dy = points[i][1] - points[i - 1][1]
        total += math.hypot(dx, dy)
    return total


def point_at(points, dist):
    """Return (x, y) at `dist` along the polyline (normalized units)."""
    for i in range(1, len(points)):
        seg = math.hypot(
            points[i][0] - points[i - 1][0],
            points[i][1] - points[i - 1][1],
        )
        if dist <= seg:
            t = dist / seg if seg else 0
            return (
                lerp(points[i - 1][0], points[i][0], t),
                lerp(points[i - 1][1], points[i][1], t),
            )
        dist -= seg
    return points[-1]


def draw_motif(d, s, x0=0, y0=0):
    """Draw the route motif into a square of side `s` with top-left (x0, y0)."""

    def P(p):
        return (x0 + p[0] * s, y0 + p[1] * s)

    pts = [P(p) for p in ROUTE]

    # Road (dark underlay)
    d.line(pts, fill=(30, 41, 59, 255), width=max(2, int(s * 0.145)), joint="curve")
    # Route (blue)
    d.line(pts, fill=(10, 132, 255, 255), width=max(2, int(s * 0.078)), joint="curve")

    # Dashed white centre line (dash/gap in normalized units along the polyline).
    dash = 0.05
    gap = 0.045
    length = polyline_length(ROUTE)
    x = 0.0
    while x < length:
        end = min(x + dash, length)
        p1 = P(point_at(ROUTE, x))
        p2 = P(point_at(ROUTE, end))
        d.line([p1, p2], fill=(255, 255, 255, 235), width=max(2, int(s * 0.016)))
        x += dash + gap

    # Start dot (current location)
    sx, sy = P(START)
    r = max(1, int(s * 0.05))
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(10, 132, 255, 255),
              outline=(255, 255, 255, 255), width=max(1, int(s * 0.014)))

    # Destination pin (green)
    ex, ey = P(END)
    pr = max(1, int(s * 0.062))
    d.ellipse([ex - pr, ey - pr, ex + pr, ey + pr], fill=(52, 199, 89, 255),
              outline=(255, 255, 255, 255), width=max(1, int(s * 0.016)))
    # inner dot
    ir = max(1, int(s * 0.022))
    d.ellipse([ex - ir, ey - ir, ex + ir, ey + ir], fill=(255, 255, 255, 255))


def draw_icon(size, rounded=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Vertical gradient background (dark slate).
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t)
        g = int(GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t)
        b = int(GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Optional rounded mask (for "any"-purpose icons). Applied to the background
    # before the motif is drawn; the motif sits well inside the safe zone.
    if rounded:
        mask = Image.new("L", (size, size), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        flat = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        flat.paste(img, (0, 0), mask)
        img = flat
        d = ImageDraw.Draw(img)

    draw_motif(d, size)
    return img


def draw_splash(w, h):
    img = Image.new("RGBA", (w, h), SPLASH_BG + (255,))
    d = ImageDraw.Draw(img)
    s = int(w * 0.22)          # motif side ≈ app-icon size
    x0 = (w - s) // 2
    y0 = int(h * 0.40)         # slightly above centre (clear of the home indicator)
    draw_motif(d, s, x0, y0)
    return img.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)

    draw_icon(512).save(f"{OUT}/icon-512.png")
    draw_icon(192).save(f"{OUT}/icon-192.png")
    draw_icon(512).save(f"{OUT}/maskable-512.png")           # full-bleed square = maskable-safe
    draw_icon(180).save(f"{OUT}/apple-touch-icon.png")       # iOS applies its own mask
    draw_icon(48, rounded=True).save(f"{OUT}/favicon-48.png")

    for name, w, h in SPLASHES:
        draw_splash(w, h).save(f"{OUT}/{name}", "PNG")
        print("wrote", name)

    print("icons + splash written to", OUT)


if __name__ == "__main__":
    main()
