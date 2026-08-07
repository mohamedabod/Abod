#!/usr/bin/env python3
"""Generates the launcher icons with no third-party dependencies.

The v3 build script needed Pillow plus a DejaVu font that only exists on some
machines. This writes the PNGs directly (zlib + the PNG chunk format) and
supersamples 4x for smooth edges, so the build works on a bare CI runner.
"""

import math
import os
import struct
import sys
import zlib

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

BG = (15, 15, 26)        # --bg
RING = (233, 69, 96)     # --primary
MARK = (245, 166, 35)    # --gold
SS = 4                   # supersampling factor


def shade(x, y, size):
    """Colour + coverage of one sample point, in unit coordinates."""
    cx = cy = size / 2.0
    dx, dy = x - cx, y - cy
    dist = math.hypot(dx, dy)

    r_outer = size * 0.5
    if dist > r_outer:
        return None

    # Progress ring: an arc from the top, clockwise, covering ~72% of the circle.
    r_ring_out = size * 0.44
    r_ring_in = size * 0.34
    if r_ring_in <= dist <= r_ring_out:
        ang = (math.degrees(math.atan2(dx, -dy)) + 360.0) % 360.0
        if ang <= 260.0:
            return RING

    # Gold dot marking the current position on the ring.
    mx = cx + math.sin(math.radians(260.0)) * (r_ring_in + r_ring_out) / 2.0
    my = cy - math.cos(math.radians(260.0)) * (r_ring_in + r_ring_out) / 2.0
    if math.hypot(x - mx, y - my) <= size * 0.075:
        return MARK

    return BG


def render(size):
    big = size * SS
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * SS + sx + 0.5) / SS
                    y = (py * SS + sy + 0.5) / SS
                    c = shade(x, y, size)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        a += 255
            n = SS * SS
            if a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                hits = a // 255
                row += bytes((r // hits, g // hits, b // hits, a // n))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "res"
    for folder, size in SIZES.items():
        out_dir = os.path.join(base, folder)
        os.makedirs(out_dir, exist_ok=True)
        write_png(os.path.join(out_dir, "ic_launcher.png"), size, render(size))
        print("wrote", os.path.join(out_dir, "ic_launcher.png"))


if __name__ == "__main__":
    main()
