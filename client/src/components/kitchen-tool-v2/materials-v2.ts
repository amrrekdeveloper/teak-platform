/**
 * LEGACY (Task V2-001E): unreachable from the customer path — kept only for
 * geometry-test compatibility and future reference. The approved room preview
 * now uses locked photoreal materials defined in room-preview.tsx. Safe to
 * delete in a later cleanup task.
 *
 * Kitchen Designer V2 — test material registry (PBR proof only).
 *
 * Exactly 2 wall + 2 floor materials. Texture repeat is derived from the
 * PHYSICAL dimensions of the tile/plank so real-world scale is preserved.
 * Textures are lightweight procedural canvases (no downloads, no paid
 * services). The registry shape is extensible for future Base Color /
 * Normal / Roughness / AO maps.
 */
import * as THREE from "three";

export type SurfaceKindV2 = "wall" | "floor";
export type FinishTypeV2 = "matte_paint" | "porcelain" | "wood";

export interface MaterialDefV2 {
  id: string;
  kind: SurfaceKindV2;
  nameAr: string;
  nameEn: string;
  finish: FinishTypeV2;
  /** Physical size of one texture unit (tile/plank) in mm, or null for plain paint. */
  physical: { widthMm: number; heightMm: number } | null;
  baseColor: string;
  roughness: number;
  metalness: number;
  /** Future PBR map slots (URLs or generators). */
  maps?: {
    baseColor?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
  };
  /** Procedural placeholder base-color texture generator. */
  makeTexture?: () => THREE.Texture;
  /** Procedural placeholder normal-map generator (subtle surface relief). */
  makeNormalTexture?: () => THREE.Texture;
  /** Procedural placeholder AO-map generator (grout/seam darkening). */
  makeAoTexture?: () => THREE.Texture;
}

/* -------------------- procedural texture helpers -------------------- */

function makeCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One 600×600 beige porcelain tile with grout on the edges. */
function beigePorcelainTexture(): THREE.Texture {
  return makeCanvas(512, (ctx, s) => {
    ctx.fillStyle = "#d8cbb8";
    ctx.fillRect(0, 0, s, s);
    // subtle mottling
    for (let i = 0; i < 400; i++) {
      const a = 0.02 + Math.random() * 0.04;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(120,100,80,${a})`;
      const r = 4 + Math.random() * 22;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // grout lines at the tile borders
    ctx.strokeStyle = "#b3a894";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, s, s);
  });
}

/** One 180×1200 light-oak plank (canvas aspect matches plank aspect via repeat). */
function lightOakPlankTexture(): THREE.Texture {
  return makeCanvas(512, (ctx, s) => {
    ctx.fillStyle = "#c9a876";
    ctx.fillRect(0, 0, s, s);
    // wood grain running along X (plank length axis)
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * s;
      ctx.strokeStyle = `rgba(120,85,50,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) {
        ctx.lineTo(x, y + Math.sin(x / 50 + i) * 4 + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }
    // plank seams: short edge (right) and long edges (top/bottom)
    ctx.strokeStyle = "rgba(90,65,40,0.55)";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, s, s);
  });
}

function makeDataTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  // Normal/AO maps are linear data, not sRGB.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Normal map: flat surface with a soft grout groove at the tile borders. */
function tileGroutNormal(): THREE.Texture {
  return makeDataTexture(256, (ctx, s) => {
    ctx.fillStyle = "#8080ff"; // flat normal
    ctx.fillRect(0, 0, s, s);
    const g = 5;
    // groove edges: tilt normals inward around the border
    ctx.fillStyle = "#6a74f0";
    ctx.fillRect(0, 0, s, g);
    ctx.fillRect(0, 0, g, s);
    ctx.fillStyle = "#968cf0";
    ctx.fillRect(0, s - g, s, g);
    ctx.fillRect(s - g, 0, g, s);
  });
}

/** Normal map: gentle along-grain waviness + seam grooves for planks. */
function plankSeamNormal(): THREE.Texture {
  return makeDataTexture(256, (ctx, s) => {
    ctx.fillStyle = "#8080ff";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * s;
      ctx.strokeStyle = `rgba(${110 + Math.random() * 30},${120 + Math.random() * 20},255,0.25)`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (Math.random() - 0.5) * 6);
      ctx.stroke();
    }
    const g = 4;
    ctx.fillStyle = "#6a74f0";
    ctx.fillRect(0, 0, s, g);
    ctx.fillRect(0, 0, g, s);
    ctx.fillStyle = "#968cf0";
    ctx.fillRect(0, s - g, s, g);
    ctx.fillRect(s - g, 0, g, s);
  });
}

/** AO map: slight darkening at tile/plank borders. */
function borderAo(): THREE.Texture {
  return makeDataTexture(256, (ctx, s) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, s, s);
  });
}

/* --------------------------- registry ------------------------------ */

export const WALL_MATERIALS_V2: MaterialDefV2[] = [
  {
    id: "wall_matte_warm_white",
    kind: "wall",
    nameAr: "دهان أبيض دافئ مطفي",
    nameEn: "Matte Warm White Paint",
    finish: "matte_paint",
    physical: null,
    baseColor: "#f3ede2",
    roughness: 0.92,
    metalness: 0,
  },
  {
    id: "wall_light_gray",
    kind: "wall",
    nameAr: "دهان رمادي فاتح",
    nameEn: "Light Gray Paint",
    finish: "matte_paint",
    physical: null,
    baseColor: "#cfd2d4",
    roughness: 0.9,
    metalness: 0,
  },
];

export const FLOOR_MATERIALS_V2: MaterialDefV2[] = [
  {
    id: "floor_beige_porcelain_600",
    kind: "floor",
    nameAr: "بورسلان بيج 60×60 سم",
    nameEn: "Beige Porcelain Tile 600×600 mm",
    finish: "porcelain",
    physical: { widthMm: 600, heightMm: 600 },
    baseColor: "#ffffff",
    roughness: 0.35,
    metalness: 0,
    makeTexture: beigePorcelainTexture,
    makeNormalTexture: tileGroutNormal,
    makeAoTexture: borderAo,
  },
  {
    id: "floor_light_oak_plank",
    kind: "floor",
    nameAr: "باركيه بلوط فاتح 18×120 سم",
    nameEn: "Light Oak Plank 180×1200 mm",
    finish: "wood",
    physical: { widthMm: 1200, heightMm: 180 },
    baseColor: "#ffffff",
    roughness: 0.55,
    metalness: 0,
    makeTexture: lightOakPlankTexture,
    makeNormalTexture: plankSeamNormal,
    makeAoTexture: borderAo,
  },
];

export function findMaterialV2(id: string): MaterialDefV2 | undefined {
  return [...WALL_MATERIALS_V2, ...FLOOR_MATERIALS_V2].find((m) => m.id === id);
}

/**
 * Texture repeat count for a surface of the given physical size (mm), so one
 * texture unit equals one real tile/plank. Returns null for plain materials.
 */
export function repeatForSurface(
  def: MaterialDefV2,
  surfaceWidthMm: number,
  surfaceHeightMm: number
): { x: number; y: number } | null {
  if (!def.physical) return null;
  return {
    x: surfaceWidthMm / def.physical.widthMm,
    y: surfaceHeightMm / def.physical.heightMm,
  };
}
