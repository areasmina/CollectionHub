# Spinning pixel card (black-and-white, Game Boy greys), built with Blender (bpy 5.2).
# Moved from card-hunt's brand/build.py; the back now reads DECK MAGE. The app uses only the anim step:
#   pip install bpy; python build.py -- anim  -> out/frames/####.png (160 px), then crop to the card and save
#   as public/card-spin.webp (48 frames, 67 ms each) + public/card-spin.png (frame 1). Renders on CPU (Cycles).
#   blender -b -P build.py -- logo     -> out/logo-*.png
#   blender -b -P build.py -- icon     -> out/icon-*.png, out/apple-touch-icon.png
#   blender -b -P build.py -- anim     -> out/raw/####.png (3D render) + out/frames/####.png (pixelated)
#   blender -b -P build.py -- encode   -> out/card-spin.webm (alpha), out/card-spin.mp4
# Each scene is also saved as a .blend in out/ so it can be opened and tweaked.
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
WHICH = ARGS[0] if ARGS else 'all'


def srgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(h):
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in srgb(h)) + (1.0,)


# print palette
PAPER, INK, RED = '#efe6d2', '#1b1a17', '#c8402a'
NORMAL = {'ink': INK, 'paper': PAPER, 'accent': RED}
INVERSE = {'ink': PAPER, 'paper': RED, 'accent': INK}      # cream ink on red paper
MONO = {'ink': INK, 'paper': PAPER, 'accent': INK}
# Game Boy style greys (dark -> light), slightly warm to sit next to the paper
GB = np.array([srgb(c) for c in ('#141410', '#5a5850', '#aaa69a', '#f2eee4')], np.float32)

FONT_BOLD = [os.path.join(ROOT, 'archivo-black.ttf')]  # Archivo Black (SIL OFL 1.1), from @fontsource/archivo-black
_fonts = {}


def font(paths=FONT_BOLD):
    key = paths[0]
    if key not in _fonts:
        _fonts[key] = None
        for f in paths:
            if os.path.exists(f):
                _fonts[key] = bpy.data.fonts.load(f)
                break
    return _fonts[key]


# ---------------------------------------------------------------- basics
def reset(res=(1024, 1024), samples=32, transparent=True):
    _fonts.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    try:
        sc.eevee.taa_render_samples = samples
    except AttributeError:
        pass
    sc.render.engine = 'CYCLES'          # headless container: no GPU/EGL for EEVEE
    sc.cycles.device = 'CPU'
    sc.cycles.samples = max(16, samples * 4)
    sc.cycles.use_denoising = False
    w = bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.8, 0.8, 0.8, 1)
    bg.inputs[1].default_value = 0.5
    return sc


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def empty(name, parent=None, loc=(0, 0, 0), rot=0.0, scale=1.0):
    e = link(bpy.data.objects.new(name, None))
    e.parent = parent
    e.location = loc
    e.rotation_euler.z = math.radians(rot)
    e.scale = (scale, scale, scale)
    return e


def mesh_obj(name, verts, faces, m, parent=None, loc=(0, 0, 0), rot=0.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x, y, 0) for x, y in verts], [], faces)
    me.materials.append(m)
    ob = link(bpy.data.objects.new(name, me))
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler.z = math.radians(rot)
    return ob


def rr_pts(w, h, r, seg=12):
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def poly(name, pts, m, parent=None, loc=(0, 0, 0), rot=0.0):
    return mesh_obj(name, pts, [list(range(len(pts)))], m, parent, loc, rot)


def rr(name, w, h, r, m, parent=None, loc=(0, 0, 0), rot=0.0):
    return poly(name, rr_pts(w, h, r), m, parent, loc, rot)


def disc(name, r, m, parent=None, loc=(0, 0, 0), seg=96):
    pts = [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return poly(name, pts, m, parent, loc)


def ring(name, r_out, r_in, m, parent=None, loc=(0, 0, 0), seg=160):
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        verts += [(r_out * math.cos(a), r_out * math.sin(a)), (r_in * math.cos(a), r_in * math.sin(a))]
    for i in range(seg):
        j = (i + 1) % seg
        faces.append([2 * i, 2 * j, 2 * j + 1, 2 * i + 1])
    return mesh_obj(name, verts, faces, m, parent, loc)


def star(name, r_out, r_in, m, parent=None, loc=(0, 0, 0), points=8, rot=0.0):
    pts = []
    for i in range(points * 2):
        a = math.pi / 2 + math.pi * i / points
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return poly(name, pts, m, parent, loc, rot)


def text(body, size, m, parent=None, loc=(0, 0, 0), align='CENTER', valign='CENTER', rot=0.0,
         extrude=0.0, bevel=0.0, spacing=1.0, fnt=None):
    cu = bpy.data.curves.new('Text', 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.align_x = align
    cu.align_y = valign
    cu.space_character = spacing
    f = fnt or font()
    if f:
        cu.font = f
    ob = link(bpy.data.objects.new('Text', cu))
    ob.data.materials.append(m)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler.z = math.radians(rot)
    return ob


def arc_text(body, size, m, parent, radius, center_deg, bottom=False, tracking=0.06):
    """Letters around a circle. Top arcs read clockwise; bottom arcs read left to right, tops inward."""
    chars = []
    for ch in body:
        ob = text(ch if ch != ' ' else 'I', size, m, parent, valign='BOTTOM_BASELINE')
        chars.append((ch, ob))
    bpy.context.view_layer.update()
    widths = [(size * 0.32 if ch == ' ' else ob.dimensions.x) for ch, ob in chars]
    total = sum(widths) + tracking * size * (len(widths) - 1)
    span = total / radius
    pos = -total / 2
    for (ch, ob), wdt in zip(chars, widths):
        mid = pos + wdt / 2
        pos += wdt + tracking * size
        if ch == ' ':
            bpy.data.objects.remove(ob)
            continue
        if bottom:
            a = math.radians(center_deg) + mid / radius
            ob.rotation_euler.z = a + math.pi / 2
        else:
            a = math.radians(center_deg) - mid / radius
            ob.rotation_euler.z = a - math.pi / 2
        ob.location = (radius * math.cos(a), radius * math.sin(a), ob.location.z)
    return span


def camera(loc, target=(0, 0, 0), lens=50, ortho=None):
    c = bpy.data.cameras.new('Camera')
    c.lens = lens
    if ortho:
        c.type = 'ORTHO'
        c.ortho_scale = ortho
    o = link(bpy.data.objects.new('Camera', c))
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = o
    return o


def area(name, loc, energy, size, target=(0, 0, 0)):
    l = bpy.data.lights.new(name, 'AREA')
    l.energy = energy
    l.size = size
    o = link(bpy.data.objects.new(name, l))
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('wrote', path)


def save_blend(name):
    try:
        bpy.ops.file.pack_all()
    except RuntimeError:
        pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, name), compress=True)


# ---------------------------------------------------------------- print materials
def _nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return nt, nt.nodes.new('ShaderNodeOutputMaterial')


def ink(name, hexcol, wear=0.0):
    """Flat ink. wear > 0 knocks small speckles out of it, like a worn rubber stamp."""
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lin(hexcol)
    if not wear:
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        return m
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 140
    fine.inputs['Detail'].default_value = 6
    coarse = nt.nodes.new('ShaderNodeTexNoise')
    coarse.inputs['Scale'].default_value = 7
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    add.inputs[1].default_value = 0.6
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 1.0 - wear * 0.25
    nt.links.new(tc.outputs['Window'], fine.inputs['Vector'])
    nt.links.new(tc.outputs['Window'], coarse.inputs['Vector'])
    nt.links.new(coarse.outputs['Fac'], add.inputs[0])
    nt.links.new(fine.outputs['Fac'], add.inputs[2])
    nt.links.new(add.outputs[0], gt.inputs[0])
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(em.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def halftone(name, hexcol, scale=34, radius=0.3):
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = lin(hexcol)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, 0)
    fr = nt.nodes.new('ShaderNodeVectorMath'); fr.operation = 'FRACTION'
    sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = (0.5, 0.5, 0)
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = radius
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs[0], fr.inputs[0])
    nt.links.new(fr.outputs[0], sub.inputs[0])
    nt.links.new(sub.outputs[0], ln.inputs[0])
    nt.links.new(ln.outputs['Value'], lt.inputs[0])
    nt.links.new(lt.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def paper_sheet(pal, w=20, h=20, z=-1):
    """Background sheet with faint fibres."""
    m = bpy.data.materials.new('Paper')
    nt, out = _nodes(m)
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 90
    n.inputs['Detail'].default_value = 10
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    base = lin(pal['paper'])
    ramp.color_ramp.elements[0].color = tuple(c * 0.9 for c in base[:3]) + (1,)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].color = tuple(min(1, c * 1.04) for c in base[:3]) + (1,)
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(tc.outputs['Window'], n.inputs['Vector'])
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return rr('Paper', w, h, 0.001, m, loc=(0, 0, z))


# ---------------------------------------------------------------- emblem
def emblem(parent, pal, wear=0.18, z=0.0):
    """A card being looked over with a magnifier, plus a little star. ~2 units across."""
    k = ink('Ink', pal['ink'], wear)
    p = ink('Fill', pal['paper'])
    a = ink('Accent', pal['accent'], wear * 0.8)
    root = empty('Emblem', parent, (0, 0, z))
    card = empty('Card', root, (-0.12, 0.06, 0), rot=8)
    rr('CardBody', 1.05, 1.46, 0.1, k, card)
    win = empty('Window', card, (0, 0.26, 0.01))
    rr('Sky', 0.85, 0.66, 0.05, p, win)
    disc('Sun', 0.14, a, win, (0.16, 0.08, 0.01))
    poly('Mountains', [(-0.425, -0.2), (-0.425, -0.02), (-0.27, 0.13), (-0.1, -0.05), (0.06, 0.1),
                       (0.25, -0.08), (0.425, 0.04), (0.425, -0.2)], k, win, (0, 0, 0.02))
    rr('Ground', 0.85, 0.15, 0.05, halftone('Dots', pal['ink'], 38, 0.3), win, (0, -0.255, 0.02))
    rr('Line1', 0.66, 0.065, 0.032, p, card, (-0.06, -0.38, 0.01))
    rr('Line2', 0.46, 0.065, 0.032, p, card, (-0.16, -0.52, 0.01))
    c = Vector((0.45, -0.45, 0.05))
    ring('Knockout', 0.44, 0.2, p, root, c - Vector((0, 0, 0.01)))
    disc('Glass', 0.3, p, root, c - Vector((0, 0, 0.005)))
    disc('GlassDots', 0.3, halftone('GlassDots', pal['ink'], 30, 0.22), root, c - Vector((0, 0, 0.003)))
    ring('Lens', 0.36, 0.26, a, root, c)
    d = Vector((math.cos(math.radians(-45)), math.sin(math.radians(-45)), 0))
    rr('HandleKnock', 0.5, 0.22, 0.11, p, root, c + d * 0.57 - Vector((0, 0, 0.01)), rot=-45)
    rr('Handle', 0.42, 0.14, 0.07, a, root, c + d * 0.57, rot=-45)
    star('Star', 0.17, 0.065, k, root, (0.72, 0.66, 0.06))
    return root


def badge(parent, pal, wear=0.18, top='CARD HUNT', bottom='SINGLES  SEALED  DECKS'):
    k = ink('BadgeInk', pal['ink'], wear)
    root = empty('Badge', parent)
    ring('Outer', 2.0, 1.92, k, root)
    ring('Inner', 1.4, 1.34, k, root)
    arc_text(top, 0.5, k, root, 1.47, 90)
    arc_text(bottom, 0.21, k, root, 1.79, 270, bottom=True, tracking=0.12)
    star('StarL', 0.12, 0.045, k, root, (-1.66, 0.0, 0))
    star('StarR', 0.12, 0.045, k, root, (1.66, 0.0, 0))
    em = emblem(root, pal, wear, 0.1)
    em.scale = (1.12, 1.12, 1.12)
    em.location = (0.0, 0.02, 0.1)
    return root


# ---------------------------------------------------------------- logo
def build_logo():
    jobs = [
        # file, palette, paper sheet?, kind
        ('logo-badge.png', NORMAL, True, 'badge'),
        ('logo-badge-transparent.png', NORMAL, False, 'badge'),
        ('logo-badge-inverse.png', INVERSE, True, 'badge'),
        ('logo-wordmark.png', NORMAL, False, 'word'),
        ('logo-wordmark-paper.png', NORMAL, True, 'word'),
        ('logo-wordmark-inverse.png', INVERSE, True, 'word'),
    ]
    for name, pal, sheet, kind in jobs:
        if kind == 'badge':
            sc = reset(res=(1600, 1600), transparent=not sheet)
            camera((0, 0, 10), ortho=4.5)
            badge(None, pal)
        else:
            sc = reset(res=(2400, 900), transparent=not sheet)
            camera((0, 0, 10), ortho=8.3)
            root = empty('Wordmark', None, (-2.45, 0, 0))
            b = badge(root, pal, wear=0.12, top='SINGLES  SEALED', bottom='EST  2026')
            b.scale = (0.62, 0.62, 0.62)
            k = ink('WordInk', pal['ink'], 0.16)
            a = ink('WordAccent', pal['accent'], 0.12)
            t = text('CARD HUNT', 0.92, k, root, (1.55, 0.2, 0), align='LEFT', valign='CENTER', spacing=1.02)
            bpy.context.view_layer.update()
            tw = t.dimensions.x
            x0, x1 = 1.35, 1.55 + tw + 0.2
            # box like a printed label
            for nm, w, h, cy in (('Top', x1 - x0, 0.06, 0.95), ('Bot', x1 - x0, 0.06, -0.62),
                                 ('Mid', x1 - x0, 0.035, -0.25)):
                rr(nm, w, h, 0.001, k, root, ((x0 + x1) / 2, cy, 0))
            for nm, cx in (('L', x0), ('R', x1)):
                rr(nm, 0.06, 1.63, 0.001, k, root, (cx, 0.165, 0))
            text('FIVE SHOPS  -  ONE SEARCH', 0.26, a, root, ((x0 + x1) / 2, -0.44, 0), spacing=1.18)
        if sheet:
            paper_sheet(pal)
        render(os.path.join(OUT, name))
        save_blend(name.replace('.png', '.blend'))


# ---------------------------------------------------------------- icon
def build_icon():
    variants = [
        ('icon-1024.png', 1024, False, 0.74),
        ('icon-512.png', 512, False, 0.74),
        ('icon-192.png', 192, False, 0.74),
        ('icon-maskable-512.png', 512, True, 0.6),
        ('apple-touch-icon.png', 180, True, 0.68),
    ]
    for name, size, bleed, scale in variants:
        sc = reset(res=(size, size), transparent=not bleed)
        camera((0, 0, 10), ortho=2.0)
        k = ink('TileInk', INK, 0.1 if size > 200 else 0.0)
        if bleed:
            paper_sheet(NORMAL, 4, 4)
        else:
            tile = rr('Tile', 2.0, 2.0, 0.44, ink('TilePaper', PAPER))
            tile.location.z = -0.5
        t = 0.05 if size > 200 else 0.07
        inset = 1.72 if not bleed else 1.6
        rr('Border', inset, inset, 0.3, k, loc=(0, 0, -0.4))
        rr('BorderIn', inset - 2 * t, inset - 2 * t, 0.3 - t, ink('TilePaper2', PAPER), loc=(0, 0, -0.39))
        em = emblem(None, NORMAL, 0.12 if size > 200 else 0.0)
        em.scale = (scale, scale, scale)
        em.location = (0.0, 0.02, 0)
        render(os.path.join(OUT, name))
        if name == 'icon-1024.png':
            save_blend('icon.blend')


# ---------------------------------------------------------------- pixel card
def _rr_mask(H, W, x0, y0, x1, y1, r):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx = np.clip(xx, x0 + r, x1 - r)
    cy = np.clip(yy, y0 + r, y1 - r)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    inside = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    return np.clip(r - d + 0.5, 0, 1) * inside


def _paint(img, mask, v):
    img[..., :3] = img[..., :3] * (1 - mask[..., None]) + np.float32(v) * mask[..., None]


def card_front(W=500, H=700):
    """Greyscale card face, bold shapes so it survives being pixelated."""
    img = np.ones((H, W, 4), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    _paint(img, np.ones((H, W), np.float32), 0.08)
    _paint(img, _rr_mask(H, W, 26, H - 110, W - 26, H - 26, 20), 0.95)          # title bar
    _paint(img, _rr_mask(H, W, 50, H - 82, 300, H - 54, 12), 0.08)              # title "text"
    _paint(img, np.clip(20 - np.sqrt((xx - (W - 66)) ** 2 + (yy - (H - 68)) ** 2) + .5, 0, 1), 0.4)
    ax0, ay0, ax1, ay1 = 34, 290, W - 34, H - 130
    art = _rr_mask(H, W, ax0, ay0, ax1, ay1, 10)
    t = np.clip((yy - ay0) / (ay1 - ay0), 0, 1)
    _paint(img, art, 0.0)
    img[..., :3] += (art * (0.22 + 0.42 * t))[..., None]                         # sky gradient (dithers)
    sd = np.sqrt((xx - 320) ** 2 + (yy - 440) ** 2)
    _paint(img, np.clip(60 - sd + .5, 0, 1) * art, 0.0)
    _paint(img, np.clip(52 - sd + .5, 0, 1) * art, 1.0)
    x = np.arange(W, dtype=np.float32)
    for base, amp, per, ph, v in ((350, 90, 170, 20, 0.32), (300, 60, 120, 70, 0.1)):
        ridge = base + amp * (1 - np.abs(((x + ph) % per) / per * 2 - 1))
        _paint(img, (yy <= ridge[None, :]) * art, v)
    _paint(img, _rr_mask(H, W, 26, 232, W - 26, 274, 18), 0.95)                 # type line
    _paint(img, _rr_mask(H, W, 34, 40, W - 34, 218, 10), 0.97)                  # rules box
    for i, wdt in enumerate((360, 300, 380)):
        _paint(img, _rr_mask(H, W, 60, 170 - i * 40, 60 + wdt, 184 - i * 40, 6), 0.35)
    return img


def card_back(W=500, H=700):
    img = np.ones((H, W, 4), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    _paint(img, np.ones((H, W), np.float32), 0.0)
    img[..., :3] += (0.62 * np.clip(1 - d / 1.25, 0, 1))[..., None]
    e = np.sqrt(((xx - W / 2) / 180) ** 2 + ((yy - H / 2) / 270) ** 2)
    _paint(img, np.clip(1 - np.abs(e - 1.0) / 0.05, 0, 1), 0.95)
    _paint(img, np.clip(1 - np.abs(e - 1.18) / 0.02, 0, 1), 0.7)
    ang = np.arctan2(yy - H / 2, xx - W / 2)
    _paint(img, ((np.cos(ang * 12) > 0.9) * (e > 1.25) * (e < 1.7)).astype(np.float32), 0.45)
    _paint(img, 1 - _rr_mask(H, W, 18, 18, W - 18, H - 18, 20), 0.05)
    return img


def np_image(name, arr):
    H, W = arr.shape[:2]
    im = bpy.data.images.new(name, W, H, alpha=True)
    im.pixels.foreach_set(arr.ravel())
    im.pack()
    return im


def image_mat(name, img, flip_x=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = 0.45
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    tex.interpolation = 'Closest'
    if flip_x:
        uv = nt.nodes.new('ShaderNodeUVMap')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value[0] = 1.0
        mp.inputs['Scale'].default_value[0] = -1.0
        nt.links.new(uv.outputs[0], mp.inputs['Vector'])
        nt.links.new(mp.outputs[0], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    return m


def card_mesh(name, w, h, r, thick, mats, parent):
    pts = rr_pts(w, h, r, 8)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
    uv = bm.loops.layers.uv.new('UVMap')
    for l in f.loops:
        l[uv].uv = (l.vert.co.x / w + 0.5, l.vert.co.y / h + 0.5)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = link(bpy.data.objects.new(name, me))
    ob.parent = parent
    s = ob.modifiers.new('Solidify', 'SOLIDIFY')
    s.thickness, s.offset, s.material_offset, s.material_offset_rim = thick, 0, 1, 2
    return ob


PIX = 160          # render size of the pixel art
UPSCALE = 1        # 1 = app size (crop to the card afterwards); 5 = 800 px video


def build_anim():
    sc = reset(res=(PIX, PIX), samples=8)
    sc.render.fps = 15                     # choppy on purpose, like an old handheld
    sc.frame_start, sc.frame_end = 1, 48
    try:
        sc.render.filter_size = 0.5
    except AttributeError:
        pass
    W, H, T = 2.5, 3.5, 0.06
    spin = empty('Spin')
    tilt = empty('Tilt', spin)
    tilt.rotation_euler = (math.radians(90 - 6), 0, 0)
    front = image_mat('Front', np_image('card-front', card_front()))
    back = image_mat('Back', np_image('card-back', card_back()), flip_x=True)
    rim = bpy.data.materials.new('Rim')
    rim.use_nodes = True
    rim.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1)
    card_mesh('Card', W, H, 0.16, T, [front, back, rim], tilt)
    word = bpy.data.materials.new('Word')
    word.use_nodes = True
    word.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
    t = text('DECK\nMAGE', 0.5, word, tilt, (0, 0, -(T / 2 + 0.002)), extrude=0.0)
    t.rotation_euler = (0, math.pi, 0)
    spin.rotation_euler.z = 0
    spin.keyframe_insert('rotation_euler', index=2, frame=1)
    spin.rotation_euler.z = math.radians(360)
    spin.keyframe_insert('rotation_euler', index=2, frame=49)
    act = spin.animation_data.action
    curves = []
    if hasattr(act, 'fcurves') and len(getattr(act, 'fcurves', [])):
        curves = list(act.fcurves)
    else:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    camera((0, -15.5, 1.2), (0, 0, 0), lens=125)
    area('Key', (-5, -7, 6), 1000, 5)
    area('Fill', (6, -6, 0), 350, 7)
    area('Rim', (0, 7, 4), 1400, 6)
    raw = os.path.join(OUT, 'raw')
    os.makedirs(raw, exist_ok=True)
    save_blend('card-spin.blend')
    sc.render.filepath = os.path.join(raw, '####')
    bpy.ops.render.render(animation=True)
    pixelate(raw, os.path.join(OUT, 'frames'))


BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) + 0.5) / 16


def pixelate(src, dst):
    """4-grey ordered dither + 1px dark outline + nearest-neighbour upscale."""
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith('.png'):
            continue
        im = bpy.data.images.load(os.path.join(src, f))
        w, h = im.size
        a = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(a)
        bpy.data.images.remove(im)
        a = a.reshape(h, w, 4)
        lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
        alpha = a[..., 3] > 0.5
        th = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
        idx = np.clip(np.floor(lum * 3 + th), 0, 3).astype(int)
        pad = np.pad(alpha, 1)
        inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        idx[alpha & ~inner] = 0
        rgb = GB[idx]
        outp = np.zeros((h, w, 4), np.float32)
        outp[..., :3] = rgb
        outp[..., 3] = alpha
        outp = np.repeat(np.repeat(outp, UPSCALE, 0), UPSCALE, 1)
        oi = bpy.data.images.new('px', w * UPSCALE, h * UPSCALE, alpha=True)
        oi.pixels.foreach_set(outp.ravel())
        oi.filepath_raw = os.path.join(dst, f)
        oi.file_format = 'PNG'
        oi.save()
        bpy.data.images.remove(oi)
    print('pixelated', dst)


# ---------------------------------------------------------------- encode
def build_encode():
    frames = os.path.join(OUT, 'frames')
    files = sorted(f for f in os.listdir(frames) if f.endswith('.png'))
    size = PIX * UPSCALE
    for out_name, alpha in (('card-spin.webm', True), ('card-spin.mp4', False)):
        sc = reset(res=(size, size))
        sc.render.fps = 15
        sc.frame_start, sc.frame_end = 1, len(files)
        ed = sc.sequence_editor_create()
        coll = ed.strips if hasattr(ed, 'strips') else ed.sequences
        if not alpha:
            try:
                bgc = coll.new_effect(name='BG', type='COLOR', channel=1, frame_start=1, length=len(files))
            except TypeError:
                bgc = coll.new_effect(name='BG', type='COLOR', channel=1, frame_start=1,
                                      frame_end=len(files) + 1)
            bgc.color = tuple(GB[3])
        st = coll.new_image(name='Frames', filepath=os.path.join(frames, files[0]), channel=2, frame_start=1)
        for f in files[1:]:
            st.elements.append(f)
        st.blend_type = 'ALPHA_OVER'
        im = sc.render.image_settings
        if hasattr(im, 'media_type'):
            im.media_type = 'VIDEO'
        im.file_format = 'FFMPEG'
        ff = sc.render.ffmpeg
        if alpha:
            ff.format, ff.codec = 'WEBM', 'WEBM'
            im.color_mode = 'RGBA'
        else:
            ff.format, ff.codec = 'MPEG4', 'H264'
            im.color_mode = 'RGB'
        ff.constant_rate_factor = 'HIGH'
        sc.render.filepath = os.path.join(OUT, out_name)
        bpy.ops.render.render(animation=True)
        print('wrote', out_name)


if WHICH in ('logo', 'all'):
    build_logo()
if WHICH in ('icon', 'all'):
    build_icon()
if WHICH in ('anim', 'all'):
    build_anim()
if WHICH in ('encode', 'all'):
    build_encode()
