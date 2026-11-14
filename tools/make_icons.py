"""Generate the PWA icons: hero silhouette with gunstaff against a wasteland sunset."""
from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
os.makedirs(OUT, exist_ok=True)
S = 1024
img = Image.new('RGB', (S, S), '#120a05')
d = ImageDraw.Draw(img, 'RGBA')

# ---------------------------------------------------------------- sky
for y in range(S):
    t = y / S
    if t < 0.66:
        k = t / 0.66
        r = int(22 + 158 * k ** 2.1)
        g = int(10 + 72 * k ** 2.7)
        b = int(5 + 26 * k ** 3.2)
    else:
        k = (t - 0.66) / 0.34
        r = int(180 - 128 * k)
        g = int(82 - 60 * k)
        b = int(31 - 22 * k)
    d.line([(0, y), (S, y)], fill=(r, g, b))

# ---------------------------------------------------------------- sun
sun = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(sun)
cx, cy, rad = S * 0.70, S * 0.36, S * 0.175
for i in range(26, 0, -1):
    k = i / 26
    rr = rad * (1 + k * 1.8)
    sd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 170, 70, int(40 * (1 - k) ** 2)))
sd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(255, 216, 158, 255))
sd.ellipse([cx - rad * 0.74, cy - rad * 0.74, cx + rad * 0.74, cy + rad * 0.74], fill=(255, 242, 212, 255))
sun = sun.filter(ImageFilter.GaussianBlur(5))
img.paste(sun, (0, 0), sun)
d = ImageDraw.Draw(img, 'RGBA')

# ---------------------------------------------------------------- mesas
base = S * 0.77
d.polygon([(0, base), (S * 0.16, base - 96), (S * 0.24, base - 70), (S * 0.33, base - 126),
           (S * 0.45, base - 64), (S * 0.54, base - 100), (S * 0.68, base - 56),
           (S * 0.82, base - 88), (S, base - 44), (S, S), (0, S)], fill=(56, 27, 13, 255))
d.polygon([(0, base + 46), (S * 0.21, base - 6), (S * 0.39, base + 30), (S * 0.60, base - 20),
           (S * 0.78, base + 24), (S, base - 2), (S, S), (0, S)], fill=(28, 13, 6, 255))

# ---------------------------------------------------------------- hero
sil = (14, 7, 4, 255)
hx, hy = 0.415 * S, 0.545 * S     # head centre (hero faces RIGHT, toward the gun)
R = 0.076 * S

# legs (with a gap so the figure reads as a person)
d.polygon([(0.295 * S, 0.855 * S), (0.395 * S, 0.855 * S), (0.375 * S, S), (0.285 * S, S)], fill=sil)
d.polygon([(0.435 * S, 0.855 * S), (0.535 * S, 0.855 * S), (0.545 * S, S), (0.455 * S, S)], fill=sil)
# waist + torso
d.polygon([(0.285 * S, 0.845 * S), (0.545 * S, 0.845 * S), (0.585 * S, 0.735 * S),
           (0.560 * S, 0.690 * S), (0.275 * S, 0.690 * S), (0.245 * S, 0.745 * S)], fill=sil)
# shoulders
d.ellipse([0.255 * S, 0.655 * S, 0.385 * S, 0.745 * S], fill=sil)
d.ellipse([0.455 * S, 0.655 * S, 0.595 * S, 0.745 * S], fill=sil)
# neck
d.rectangle([hx - 0.030 * S, hy + R * 0.60, hx + 0.048 * S, 0.700 * S], fill=sil)

# head: rounded skull with a jaw jutting to the right (looking forward)
d.ellipse([hx - R, hy - R * 1.02, hx + R * 1.02, hy + R * 1.10], fill=sil)
d.polygon([(hx + R * 0.55, hy - R * 0.55), (hx + R * 1.28, hy + R * 0.10),
           (hx + R * 1.16, hy + R * 0.92), (hx + R * 0.30, hy + R * 1.22),
           (hx - R * 0.10, hy + R * 0.90)], fill=sil)

# long ear, swept back to the LEFT (behind the head)
d.polygon([(hx - R * 0.72, hy - R * 0.30), (hx - R * 2.45, hy - R * 1.15),
           (hx - R * 0.86, hy + R * 0.52)], fill=sil)

# hair: many soft back-swept spikes
spikes = [
    ((-0.90, -0.72), (-1.55, -1.72), (-0.50, -1.02)),
    ((-0.44, -0.98), (-0.72, -2.05), (0.04, -1.06)),
    ((0.02, -1.02), (0.06, -2.12), (0.50, -0.98)),
    ((0.44, -0.92), (0.72, -1.90), (0.90, -0.60)),
    ((-0.32, -0.92), (-0.05, -1.86), (0.30, -0.90)),
    ((-0.86, -0.20), (-1.62, -0.62), (-0.72, 0.36)),
    ((0.66, -0.78), (1.12, -1.36), (0.98, -0.36)),
]
for (a, b, c) in spikes:
    d.polygon([(hx + a[0] * R, hy + a[1] * R),
               (hx + b[0] * R, hy + b[1] * R),
               (hx + c[0] * R, hy + c[1] * R)], fill=sil)

# goggles: a strap across the forehead with two small dark lenses (not eyes)
d.rectangle([hx - R * 1.05, hy - R * 1.02, hx + R * 1.10, hy - R * 0.78], fill=sil)
d.rectangle([hx - R * 0.95, hy - R * 0.98, hx + R * 1.00, hy - R * 0.80], fill=(38, 26, 16, 255))
d.ellipse([hx + R * 0.10, hy - R * 1.30, hx + R * 0.62, hy - R * 0.72], fill=(30, 22, 16, 255))
d.ellipse([hx - R * 0.48, hy - R * 1.30, hx + R * 0.02, hy - R * 0.72], fill=(30, 22, 16, 255))
d.arc([hx + R * 0.10, hy - R * 1.30, hx + R * 0.62, hy - R * 0.72], 200, 340, fill=(58, 214, 202, 255), width=max(1, int(0.016 * S)))
d.arc([hx - R * 0.48, hy - R * 1.30, hx + R * 0.02, hy - R * 0.72], 200, 340, fill=(58, 214, 202, 255), width=max(1, int(0.016 * S)))

# left arm hanging at the side
d.polygon([(0.268 * S, 0.700 * S), (0.225 * S, 0.745 * S),
           (0.205 * S, 0.880 * S), (0.268 * S, 0.885 * S), (0.300 * S, 0.748 * S)], fill=sil)

# right arm: shoulder -> elbow -> grip, kept BELOW the weapon line
d.polygon([(0.520 * S, 0.690 * S), (0.585 * S, 0.712 * S), (0.660 * S, 0.640 * S),
           (0.632 * S, 0.588 * S), (0.560 * S, 0.660 * S), (0.505 * S, 0.652 * S)], fill=sil)
# hand gripping the staff
d.ellipse([0.598 * S, 0.545 * S, 0.672 * S, 0.615 * S], fill=sil)

# --- gunstaff: clearly a weapon, separate from the arm
gx0, gy0 = 0.615 * S, 0.585 * S      # grip
gx1, gy1 = 0.930 * S, 0.355 * S      # muzzle
wid = 0.017 * S
dx, dy = gx1 - gx0, gy1 - gy0
L = (dx * dx + dy * dy) ** 0.5
nx, ny = -dy / L * wid, dx / L * wid
# barrel
d.polygon([(gx0 + nx, gy0 + ny), (gx1 + nx, gy1 + ny),
           (gx1 - nx, gy1 - ny), (gx0 - nx, gy0 - ny)], fill=sil)
# chunky receiver near the grip
d.polygon([(gx0 - nx * 2.6, gy0 - ny * 2.6), (gx0 + dx * 0.22 + nx * 2.2, gy0 + dy * 0.22 + ny * 2.2),
           (gx0 + dx * 0.22 - nx * 2.2, gy0 + dy * 0.22 - ny * 2.2), (gx0 + nx * 2.6, gy0 + ny * 2.6)], fill=sil)
# stock behind the grip
d.polygon([(gx0, gy0), (gx0 - dx * 0.20 + nx * 3.0, gy0 - dy * 0.20 + ny * 3.0),
           (gx0 - dx * 0.24 - nx * 1.2, gy0 - dy * 0.24 - ny * 1.2), (gx0 - nx * 1.6, gy0 - ny * 1.6)], fill=sil)
# sight
d.rectangle([gx0 + dx * 0.34 - 0.008 * S, gy0 + dy * 0.34 - 0.030 * S,
             gx0 + dx * 0.34 + 0.008 * S, gy0 + dy * 0.34 - 0.006 * S], fill=sil)
# muzzle collar + crystal (orange, unmistakable)
d.polygon([(gx1 - nx * 2.4 - dx * 0.02, gy1 - ny * 2.4 - dy * 0.02),
           (gx1 + nx * 2.4, gy1 + ny * 2.4),
           (gx1 + nx * 2.4 - dx * 0.03, gy1 + ny * 2.4 - dy * 0.03),
           (gx1 - nx * 2.4 - dx * 0.03, gy1 - ny * 2.4 - dy * 0.03)], fill=sil)
d.polygon([(gx1 + dx * 0.008 - 0.030 * S, gy1 + dy * 0.008 - 0.046 * S),
           (gx1 + 0.062 * S, gy1 - 0.070 * S),
           (gx1 + 0.074 * S, gy1 + 0.010 * S),
           (gx1 - 0.008 * S, gy1 + 0.036 * S)], fill=(255, 158, 54, 255))
d.polygon([(gx1 + 0.006 * S, gy1 - 0.034 * S), (gx1 + 0.048 * S, gy1 - 0.052 * S),
           (gx1 + 0.052 * S, gy1 - 0.012 * S), (gx1 + 0.012 * S, gy1 + 0.008 * S)],
          fill=(255, 228, 172, 255))

# ---------------------------------------------------------------- eco glow under the feet
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([0.24 * S, 0.945 * S, 0.56 * S, 1.02 * S], fill=(40, 214, 194, 70))
glow = glow.filter(ImageFilter.GaussianBlur(30))
img.paste(glow, (0, 0), glow)

# ---------------------------------------------------------------- vignette
v = Image.new('L', (S, S), 0)
vd = ImageDraw.Draw(v)
for i in range(64):
    k = i / 64
    vd.ellipse([-S * 0.22 + k * S * 0.30, -S * 0.22 + k * S * 0.26,
                S * 1.22 - k * S * 0.30, S * 1.22 - k * S * 0.26], fill=int(105 * (1 - k) ** 2))
img = Image.composite(Image.new('RGB', (S, S), (7, 4, 2)), img, v)

for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'icon-180.png')]:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print('wrote', name, size)
