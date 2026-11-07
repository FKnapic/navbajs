#!/usr/bin/env python3
"""Jednostavne PNG ikone bez vanjskih biblioteka."""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, paint) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(paint(x, y, size))
    png = b"\x89PNG\r\n\x1a\n" + chunk(
        b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    ) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def blend(dst, src, alpha):
    a = alpha / 255
    return tuple(int(dst[i] * (1 - a) + src[i] * a) for i in range(3)) + (255,)


def icon(maskable: bool):
    def paint(x, y, size):
        cx = cy = (size - 1) / 2
        dx = x - cx
        dy = y - cy
        radius = size * (0.38 if maskable else 0.46)
        olive = (44, 64, 56, 255)
        bg = olive if dx * dx + dy * dy <= radius * radius else (0, 0, 0, 0)
        if maskable:
            bg = olive
        # two wheels
        color = bg
        for wx, wy, r in ((cx - size * 0.16, cy + size * 0.08, size * 0.09), (cx + size * 0.16, cy + size * 0.08, size * 0.09)):
            d = ((x - wx) ** 2 + (y - wy) ** 2) ** 0.5
            if abs(d - r) < size * 0.018:
                color = (255, 255, 255, 255)
        # frame lines approximated by distance to segments
        def dist_seg(ax, ay, bx, by):
            abx, aby = bx - ax, by - ay
            length = abx * abx + aby * aby
            t = 0 if length == 0 else max(0, min(1, ((x - ax) * abx + (y - ay) * aby) / length))
            px, py = ax + abx * t, ay + aby * t
            return ((x - px) ** 2 + (y - py) ** 2) ** 0.5

        segments = [
            (cx - size * 0.16, cy + size * 0.08, cx - size * 0.02, cy - size * 0.12),
            (cx - size * 0.02, cy - size * 0.12, cx + size * 0.12, cy - size * 0.12),
            (cx + size * 0.12, cy - size * 0.12, cx + size * 0.16, cy + size * 0.08),
            (cx - size * 0.02, cy - size * 0.12, cx - size * 0.16, cy + size * 0.08),
            (cx - size * 0.05, cy - size * 0.02, cx + size * 0.08, cy - size * 0.02),
        ]
        if any(dist_seg(*seg) < size * 0.016 for seg in segments):
            color = (255, 255, 255, 255)
        return color

    return paint


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    write_png(ROOT / "icon-192.png", 192, icon(False))
    write_png(ROOT / "icon-512.png", 512, icon(False))
    write_png(ROOT / "icon-maskable-512.png", 512, icon(True))
    write_png(ROOT / "apple-touch-icon.png", 180, icon(True))
    print("Ikone:", ROOT)


if __name__ == "__main__":
    main()
