# Kitchen Designer V2 — Photoreal calibration assets

All assets are CC0 (public domain equivalent) and safe for commercial use.
All files are served locally — the scene makes no external runtime requests.

| Local file | Asset | Source | License |
|---|---|---|---|
| `tiles139_color.webp`, `tiles139_normal.webp`, `tiles139_rough.webp` | Tiles 139 (1K JPG set, converted to WebP) | ambientCG — https://ambientcg.com/a/Tiles139 | CC0 1.0 |
| `plaster017_color.webp`, `plaster017_normal.webp`, `plaster017_rough.webp` | Painted Plaster 017 (1K JPG set, converted to WebP) | ambientCG — https://ambientcg.com/a/PaintedPlaster017 | CC0 1.0 |
| `lebombo_1k.hdr` | Lebombo (1K HDR) | Poly Haven — https://polyhaven.com/a/lebombo | CC0 1.0 |

Notes:
- Tiles139 texture spans a 6×6 tile grid; in the scene it is scaled so each
  tile is exactly 600 × 600 mm (physical span 3600 mm).
- Normal maps are OpenGL (GL) convention. Base Color is sRGB; Normal and
  Roughness are non-color data.
- 1K resolution (1024px) is used for all maps; total ≈ 480 KB textures
  + 1.44 MB HDR.
