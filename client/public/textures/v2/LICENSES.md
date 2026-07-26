# Kitchen Designer V2 — Photoreal calibration assets

All assets are CC0 (public domain equivalent) and safe for commercial use.
All files are served locally — the scene makes no external runtime requests.

| Local file | Asset | Source | License |
|---|---|---|---|
| `sand1000_color.webp`, `sand1000_normal.webp`, `sand1000_rough.webp` | Derived from Travertine 009 (heavily softened/tinted warm sand, single 1000 mm tile with hairline grout) | ambientCG — https://ambientcg.com/a/Travertine009 | CC0 1.0 |
| `porcelain600_*.webp` (LEGACY — unused since reference-match task) | Derived from Travertine 009 (2×2 600 mm grid) | ambientCG — https://ambientcg.com/a/Travertine009 | CC0 1.0 |
| `oak051_color.webp`, `oak051_normal.webp`, `oak051_rough.webp` | Wood Floor 051 (1K JPG set, converted to WebP) | ambientCG — https://ambientcg.com/a/WoodFloor051 | CC0 1.0 |
| `lebombo_1k.hdr` | Lebombo (1K HDR) | Poly Haven — https://polyhaven.com/a/lebombo | CC0 1.0 |
| `tiles139_*.webp` (LEGACY — unused since V2-001E) | Tiles 139 | ambientCG — https://ambientcg.com/a/Tiles139 | CC0 1.0 |
| `plaster017_*.webp` (LEGACY — unused since V2-001E) | Painted Plaster 017 | ambientCG — https://ambientcg.com/a/PaintedPlaster017 | CC0 1.0 |

Notes:
- Tiles139 texture spans a 6×6 tile grid; in the scene it is scaled so each
  tile is exactly 600 × 600 mm (physical span 3600 mm).
- Normal maps are OpenGL (GL) convention. Base Color is sRGB; Normal and
  Roughness are non-color data.
- 1K resolution (1024px) is used for all maps; total ≈ 480 KB textures
  + 1.44 MB HDR.
