"""Build the solenoid current path: parametric helix (coil) + copper-ridge-
snapped wire segments. Conventional current: battery + -> switch -> down ->
bottom -> coil bottom -> UP through helix -> coil top -> top wire -> battery -.
Outputs SOLENOID_PATH (list of [x,y,under]) and an overlay on image0."""
from PIL import Image, ImageDraw
import numpy as np, math, json

im = np.asarray(Image.open('sol2-image0.png').convert('RGB')).astype(float)
H, W, _ = im.shape
cop = (im[:, :, 0] - im[:, :, 2]) + (im[:, :, 0] - im[:, :, 1])   # copperness

def snap(px, py, tx, ty, R=10, thr=60):
    """slide along the normal to the COPPER CENTROID (stable vs wood grain)."""
    n = math.hypot(tx, ty) or 1
    nx, ny = -ty / n, tx / n
    num = den = 0.0
    for s in np.linspace(-R, R, 2 * R + 1):
        x, y = int(round(px + nx * s)), int(round(py + ny * s))
        if 0 <= x < W and 0 <= y < H:
            wgt = max(0.0, cop[y, x] - thr)
            num += wgt * s; den += wgt
    s = num / den if den > 1e-6 else 0.0
    return (px + nx * s, py + ny * s)

def smooth(pts, k=3):
    if len(pts) < 2 * k + 1:
        return pts
    out = list(pts)
    for i in range(k, len(pts) - k):
        xs = [pts[j][0] for j in range(i - k, i + k + 1)]
        ys = [pts[j][1] for j in range(i - k, i + k + 1)]
        out[i] = (sum(xs) / len(xs), sum(ys) / len(ys))
    return out

def trace(waypts, snapR=10, step=8, do_snap=True):
    """densify polyline, snap to copper centroid, smooth."""
    pts = []
    for i in range(len(waypts) - 1):
        (x0, y0), (x1, y1) = waypts[i], waypts[i + 1]
        d = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(d / step))
        for k in range(n):
            t = k / n
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    pts.append(waypts[-1])
    if not do_snap:
        return smooth(pts)
    out = []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        out.append(snap(x, y, b[0] - a[0], b[1] - a[1], snapR))
    return smooth(smooth(out))

# ---- helix (coil), current flowing UP (bottom -> top) ----
CX, RX, RY = 698, 97, 20
Y_BOT, Y_TOP, TURNS = 1120, 348, 18
# phase pi/2 => both helix ends land at the FRONT-CENTRE (x=CX, low y),
# exactly where the top and bottom wires leave the coil (no ~100px seam)
PH = math.pi / 2
def helix():
    pts = []
    seg = 20
    total = TURNS * seg
    for i in range(total + 1):
        t = i / total                       # 0 bottom -> 1 top
        th = t * TURNS * 2 * math.pi + PH
        x = CX + RX * math.cos(th)
        y = (Y_BOT + (Y_TOP - Y_BOT) * t) + RY * math.sin(th)
        under = 1 if math.sin(th) < -0.15 else 0   # back half hidden
        pts.append([x, y, under])
    return pts

# ---- wire segments (waypoints read off the scene, then snapped) ----
# bottom-of-coil exit to bottom wire, along bottom, up the right, to switch R
# coil bottom -> bottom wire -> up the right -> switch R stud (1976,478)
bottom = trace([(700, 1138), (704, 1150), (760, 1150), (1200, 1147),
                (1700, 1148), (2040, 1150), (2110, 1138), (2128, 1080),
                (2130, 900), (2128, 700), (2100, 560), (2030, 505), (1990, 486)], snapR=12)
# switch: left stud (1762,452) -> right stud (1976,478); lever hides the middle
switch = [(1762, 452, 0), (1810, 456, 1), (1900, 468, 1), (1976, 478, 0)]
# battery + stud (1363,433) -> hump -> switch left stud (1762,452)
toBatt = trace([(1363, 431), (1405, 402), (1458, 393), (1525, 412),
                (1600, 452), (1670, 456), (1720, 453), (1762, 452)], snapR=13)
# battery internal - stud (1177) -> + stud (1363), hidden in the body
batt = [(1177, 431, 0), (1240, 430, 1), (1320, 431, 1), (1363, 433, 0)]
# coil top exit (709,300) -> wavy top wire -> battery - stud (1177,429)
topwire = trace([(700, 364), (712, 312), (810, 318), (935, 352),
                 (1045, 398), (1130, 424), (1177, 430)], snapR=13)

# Assemble in CURRENT-FLOW order: + post -> switch -> bottom -> coil bottom
# -> helix up -> coil top -> top wire -> - post
def as3(seq, u=0):
    return [[round(p[0]), round(p[1]), (p[2] if len(p) > 2 else u)] for p in seq]

def densify(seq, step=12):
    """subdivide a [x,y,u] polyline to ~step px, carrying the segment's u."""
    out = []
    for i in range(len(seq) - 1):
        x0, y0, u0 = seq[i]; x1, y1, _ = seq[i + 1]
        d = math.hypot(x1 - x0, y1 - y0); n = max(1, int(d / step))
        for k in range(n):
            t = k / n
            out.append([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, u0])
    out.append(list(seq[-1]))
    return out

# CURRENT-FLOW order (conventional: + -> external -> -):
#   + stud -> switch L -> switch R -> down/bottom -> coil bottom
#   -> helix UP -> coil top -> top wire -> - stud -> (internal) -> + stud
path = []
path += as3(toBatt)                 # + stud (1363) -> switch L (1762)
path += densify(switch)             # switch L -> switch R (1976)
path += as3(list(reversed(bottom))) # switch R -> ... -> coil bottom (700,1120)
path += as3(helix())                # coil bottom -> coil top
path += as3(topwire)                # coil top -> - stud (1177)
path += densify(batt)               # - stud -> + stud (internal, hidden)

# overlay
ov = Image.open('sol2-image0.png').convert('RGB'); d = ImageDraw.Draw(ov)
prev = None
for x, y, u in path:
    if prev:
        d.line([prev, (x, y)], fill=(0, 255, 255) if not u else (255, 0, 255), width=3)
    prev = (x, y)
ov.resize((1376, 768)).save('path-overlay.png')
ov.crop((520, 300, 900, 1160)).save('path-coil.png')
ov.crop((1100, 350, 2200, 700)).save('path-top.png')
json.dump(path, open('sol_path.json', 'w'))
# emit compact JS array
js = '[' + ','.join('[%d,%d,%d]' % (x, y, u) for x, y, u in path) + ']'
open('sol_path.js.txt', 'w').write(js)
print('points', len(path), 'js chars', len(js))
