/**
 * Offscreen 3D thumbnail factory for the cabinet catalog.
 *
 * Renders each catalog cabinet once — with the default wood finish — in a
 * small hidden WebGL canvas, captures it as a WebP data-URL and caches it
 * (memory + localStorage). The catalog then shows real product previews that
 * match exactly what will appear in the scene, instead of flat line drawings.
 */
import { Component, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import AdekoBaseCabinet from "@/components/kitchen-designer-v2/adeko-cabinet";
import type { CabinetDef } from "@/components/kitchen-designer-v2/cabinets";

const LS_KEY = "kitchen-designer-v2-thumbs";
const THUMB_SIZE = 224;

/* ── cache + subscription ────────────────────────────────── */
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
let lsLoaded = false;

function loadLs() {
  if (lsLoaded) return;
  lsLoaded = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) cache.set(k, v);
  } catch {
    /* corrupted cache — regenerate */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(cache)));
    } catch {
      /* quota exceeded — memory cache still works */
    }
  }, 800);
}

function putThumb(id: string, dataUrl: string) {
  cache.set(id, dataUrl);
  scheduleSave();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

let version = 0;
const bump = () => version++;
listeners.add(bump);

/** Reactive cache version — components re-render whenever a thumb lands. */
function useCacheVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Live 3D thumbnail for a catalog def (null while still rendering). */
export function useCabinetThumb(def: CabinetDef | undefined): string | null {
  loadLs();
  return useSyncExternalStore(
    subscribe,
    () => (def ? cache.get(thumbCacheId(def)) ?? null : null)
  );
}

/* ── capture pipeline ────────────────────────────────────── */
function CaptureRig({
  def,
  onDone,
}: {
  def: CabinetDef;
  onDone: (dataUrl: string) => void;
}) {
  const { gl, camera } = useThree();
  const [frames, setFrames] = useState(0);

  useEffect(() => {
    // Three-quarter product angle looking at the cabinet's center.
    const cx = 0;
    const cy = def.height / 2;
    const dist = Math.max(def.width, def.height, def.depth) * 1.85 + 0.35;
    camera.position.set(-dist * 0.72, cy + dist * 0.42, dist * 0.85);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();
  }, [def, camera]);

  useFrame(() => {
    // Suspense guarantees textures are loaded before this mounts; a few
    // extra frames let anisotropy/mipmaps settle before we capture.
    setFrames((f) => f + 1);
    if (frames === 4) {
      try {
        onDone(gl.domElement.toDataURL("image/webp", 0.82));
      } catch {
        onDone(gl.domElement.toDataURL("image/png"));
      }
    }
  });
  return null;
}

/** Silent boundary: a failed thumbnail render must never crash the studio. */
class SilentBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? null : this.props.children;
  }
}

/**
 * Hidden factory — mount once on the studio page with the full catalog.
 * Works through the queue one cabinet at a time.
 */
export function CabinetThumbFactory({
  defs,
  paused = false,
}: {
  defs: CabinetDef[];
  /** Pause rendering (e.g. presentation mode) to avoid extra WebGL contexts. */
  paused?: boolean;
}) {
  loadLs();
  const cacheVersion = useCacheVersion();
  const pending = useMemo(
    () => defs.filter((d) => !cache.has(thumbCacheId(d))),
    [defs, cacheVersion]
  );
  const [idx, setIdx] = useState(0);
  const current = pending[0];

  useEffect(() => {
    setIdx((i) => i + 1); // force remount of Canvas contents per def
  }, [current?.id]);

  if (!current || paused) return null;

  return (
    <SilentBoundary>
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        pointerEvents: "none",
      }}
    >
      <Canvas
        key={current.id + idx}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={1}
        camera={{ fov: 30, near: 0.05, far: 30 }}
      >
        <color attach="background" args={["#f6f4f0"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
        <directionalLight position={[-3, 2, -1.5]} intensity={0.5} />
        <Suspense fallback={null}>
          <AdekoBaseCabinet def={current} />
          <CaptureRig
            def={current}
            onDone={(url) => putThumb(current.id + "@" + thumbKeySuffix(current), url)}
          />
        </Suspense>
      </Canvas>
    </div>
    </SilentBoundary>
  );
}

/** Cache key suffix — bump when the render style changes. */
function thumbKeySuffix(def: CabinetDef) {
  return `${Math.round(def.width * 100)}x${Math.round(def.height * 100)}-r1`;
}

/** Convenience: id used by the cache for a def. */
export function thumbCacheId(def: CabinetDef) {
  return def.id + "@" + thumbKeySuffix(def);
}
