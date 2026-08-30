#!/usr/bin/env python3
"""Generate Route Relay PWA/app icons with Pillow (no external assets).

Design: dark slate gradient background, a blue route polyline with a white
dashed center line, a start dot, and a green destination pin.
"""
import math
from PIL import Image, ImageDraw

OUT = "/home/openclaw/.openclaw/workspace/projects/roadtrip-route-relay/icons"

# Route geometry in a normalized 0..1 coordinate space (y down).
# Kept inside the maskable safe zone (~80% diameter).
ROUTE = [(0.275, 0.74), (0.42, 0.58), (0.60, 0.56), (0.725, 0.385)]
START = ROUTE[0]
END = ROUTE[-1]


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


def draw_icon(size, rounded=False, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Vertical gradient background (dark slate).
    top = (23, 35, 58)
    bottom = (11, 15, 24)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Optional rounded mask (for "any"-purpose icons).
    if rounded:
        mask = Image.new("L", (size, size), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        # Soften corners slightly by drawing the gradient into the mask only.
        flat = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        flat.paste(img, (0, 0), mask)
        img = flat
        d = ImageDraw.Draw(img)

    s = size
    def P(p):
        return (p[0] * s, p[1] * s)

    pts = [P(p) for p in ROUTE]

    # Road (dark underlay)
    d.line(pts, fill=(30, 41, 59, 255), width=int(s * 0.145), joint="curve")
    # Route (blue)
    d.line(pts, fill=(10, 132, 255, 255), width=int(s * 0.078), joint="curve")

    # Dashed white center line
    dash = s * 0.05
    gap = s * 0.045
    length = polyline_length(ROUTE)
    x = 0.0
    while x < length:
        a = point_at(ROUTE, x)
        b = point_at(ROUTE, x + dash / s * s if False else x)
        # compute segment end
        end = min(x + dash / s * s, length)
        p1 = P(point_at(ROUTE, x))
        p2 = P(point_at(ROUTE, end))
        d.line([p1, p2], fill=(255, 255, 255, 235), width=max(2, int(s * 0.016)))
        x += (dash + gap) / s

    # Start dot (current location)
    sx, sy = P(START)
    r = int(s * 0.05)
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(10, 132, 255, 255),
              outline=(255, 255, 255, 255), width=max(1, int(s * 0.014)))

    # Destination pin (green)
    ex, ey = P(END)
    pr = int(s * 0.062)
    d.ellipse([ex - pr, ey - pr, ex + pr, ey + pr], fill=(52, 199, 89, 255),
              outline=(255, 255, 255, 255), width=max(1, int(s * 0.016)))
    # inner dot
    ir = int(s * 0.022)
    d.ellipse([ex - ir, ey - ir, ex + ir, ey + ir], fill=(255, 255, 255, 255))

    return img


def main():
    import os
    os.makedirs(OUT, exist_ok=True)

    draw_icon(512, rounded=False, maskable=False).save(f"{OUT}/icon-512.png")
    draw_icon(192, rounded=False, maskable=False).save(f"{OUT}/icon-192.png")
    draw_icon(512, rounded=False, maskable=True).save(f"{OUT}/maskable-512.png")
    # Apple touch icon: full-bleed square (iOS applies its own mask), 180px.
    draw_icon(180, rounded=False, maskable=False).save(f"{OUT}/apple-touch-icon.png")
    # Small favicon.
    draw_icon(48, rounded=True, maskable=False).save(f"{OUT}/favicon-48.png")

    print("icons written to", OUT)


if __name__ == "__main__":
    main()
