/**
 * Kitchen Designer V2 — progressive path-tracing layer (Stage 2).
 *
 * Sits ON TOP of the live real-time renderer; never replaces it:
 * - While the user interacts (orbit / zoom / any store change) the normal
 *   real-time pipeline renders at full framerate.
 * - After ~800 ms with no interaction, progressive path-traced accumulation
 *   starts on the current view (three-gpu-pathtracer), refining the image
 *   with full global illumination. Any interaction instantly resets it.
 * - "عرض نهائي" runs a longer accumulation and downloads a PNG.
 *
 * Device gating: requires WebGL2 and a non-mobile device, otherwise the
 * layer reports `capable: false` and does absolutely nothing (no BVH build,
 * no battery drain, page never freezes).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { useKitchenToolV2Store } from "./store";

export interface PathTracerStatus {
  /** Path-traced accumulation currently shown on screen. */
  tracing: boolean;
  /** Accumulated samples so far (quality grows with samples). */
  samples: number;
  /** A high-quality "final render" accumulation is in progress. */
  finalizing: boolean;
  /** Device passed the capability gate (WebGL2 + desktop). */
  capable: boolean;
}

const IDLE_DELAY_MS = 800;
/** Stop refining the ambient accumulation after this many samples. */
const IDLE_TARGET_SAMPLES = 220;
/** Samples for the exportable final render. */
const FINAL_TARGET_SAMPLES = 450;

function detectCapable(gl: THREE.WebGLRenderer): boolean {
  try {
    if (!gl.capabilities.isWebGL2) return false;
    const ua = navigator.userAgent;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    // iPadOS reports as Macintosh but has coarse pointer + touch points.
    const iPadDesktopUA = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return !mobileUA && !iPadDesktopUA && !coarse;
  } catch {
    return false;
  }
}

export function PathTracerLayer({
  enabled,
  composerActive,
  onStatus,
  finalRequestId,
  onFinalDone,
}: {
  /** Only true in live render mode + perspective camera. */
  enabled: boolean;
  /** The postprocessing EffectComposer is mounted and rendering. */
  composerActive: boolean;
  onStatus: (s: PathTracerStatus) => void;
  /** Increment to request a high-quality PNG export. */
  finalRequestId: number;
  onFinalDone: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    addEventListener?: (type: string, fn: () => void) => void;
    removeEventListener?: (type: string, fn: () => void) => void;
  } | null;

  const ptRef = useRef<WebGLPathTracer | null>(null);
  const capableRef = useRef(false);
  const tracingRef = useRef(false);
  const finalizingRef = useRef(false);
  const lastActiveRef = useRef(performance.now());
  const lastReportedRef = useRef(-1);
  const doneFinalIdRef = useRef(finalRequestId);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const finalDoneRef = useRef(onFinalDone);
  finalDoneRef.current = onFinalDone;

  const report = (samples: number) => {
    statusRef.current({
      tracing: tracingRef.current,
      samples,
      finalizing: finalizingRef.current,
      capable: capableRef.current,
    });
  };

  // Capability gate + lazy tracer construction.
  useEffect(() => {
    capableRef.current = detectCapable(gl);
    report(0);
    return () => {
      ptRef.current?.dispose();
      ptRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  const markActive = () => {
    lastActiveRef.current = performance.now();
    if (tracingRef.current) {
      tracingRef.current = false;
      finalizingRef.current = false;
      report(0);
    }
  };

  // Interaction sources: camera controls, pointer/wheel on the canvas,
  // and any store change (room dimensions, materials, camera mode…).
  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    const onAny = () => markActive();
    controls?.addEventListener?.("start", onAny);
    controls?.addEventListener?.("change", onAny);
    el.addEventListener("pointerdown", onAny);
    el.addEventListener("wheel", onAny, { passive: true });
    const unsub = useKitchenToolV2Store.subscribe(() => markActive());
    // Entering the mode counts as activity → real-time first, then refine.
    markActive();
    return () => {
      controls?.removeEventListener?.("start", onAny);
      controls?.removeEventListener?.("change", onAny);
      el.removeEventListener("pointerdown", onAny);
      el.removeEventListener("wheel", onAny);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, controls, gl]);

  // Resolution changes invalidate the accumulation.
  const size = useThree((s) => s.size);
  useEffect(() => {
    markActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Async scene mutations (e.g. the drei <Environment> HDR finishing its
  // Suspense load, or PBR textures resolving) don't fire any interaction
  // event — detect them per frame and invalidate the accumulation so the
  // tracer never refines a stale snapshot of the scene.
  const envRef = useRef<THREE.Texture | null | undefined>(undefined);
  useFrame(() => {
    if (!enabled || !capableRef.current) return;
    const now = performance.now();

    if (envRef.current !== scene.environment) {
      const first = envRef.current === undefined;
      envRef.current = scene.environment;
      if (!first) markActive();
      else if (!scene.environment) {
        // Cold load without environment yet: wait for it before the first
        // accumulation so the traced image matches the live frame.
        lastActiveRef.current = now;
      }
    }

    const wantsFinal = finalRequestId !== doneFinalIdRef.current;

    if (!tracingRef.current) {
      const idle = now - lastActiveRef.current >= IDLE_DELAY_MS;
      if (!idle && !wantsFinal) return;
      // Begin accumulation: (re)build the BVH for the current scene state.
      try {
        if (!ptRef.current) {
          const pt = new WebGLPathTracer(gl);
          pt.renderToCanvas = true;
          pt.tiles.set(2, 2); // keep the main thread responsive
          pt.bounces = 6;
          pt.filterGlossyFactor = 0.5;
          pt.textureSize.set(1024, 1024);
          ptRef.current = pt;
        }
        ptRef.current.setScene(scene, camera);
        tracingRef.current = true;
        finalizingRef.current = wantsFinal;
        report(0);
      } catch (e) {
        // Path tracing must never break the interactive preview.
        console.error("[v2-pathtracer] disabled after error:", e);
        capableRef.current = false;
        if (wantsFinal) {
          doneFinalIdRef.current = finalRequestId;
          finalDoneRef.current();
        }
        report(0);
      }
      return;
    }

    // Accumulating.
    const pt = ptRef.current!;
    if (wantsFinal && !finalizingRef.current) {
      // Upgrade the current idle accumulation into a final render.
      finalizingRef.current = true;
      report(pt.samples);
    }
    const target = finalizingRef.current ? FINAL_TARGET_SAMPLES : IDLE_TARGET_SAMPLES;
    if (pt.samples < target) {
      pt.renderSample();
      const s = Math.floor(pt.samples);
      if (s !== lastReportedRef.current && s % 5 === 0) {
        lastReportedRef.current = s;
        report(s);
      }
    } else if (finalizingRef.current && wantsFinal) {
      // Final accumulation reached target → export PNG right after the
      // last blit (same frame, so the drawing buffer is still intact).
      pt.renderSample();
      try {
        const url = gl.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `teak-kitchen-render-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      } catch (e) {
        console.error("[v2-pathtracer] PNG export failed:", e);
      }
      doneFinalIdRef.current = finalRequestId;
      finalizingRef.current = false;
      finalDoneRef.current();
      report(Math.floor(pt.samples));
    }
    // Idle target reached (non-final): keep showing the converged frame;
    // pt.renderToCanvas already blitted it, nothing more to do.
  }, 1);

  // Priority-1 useFrame disables R3F auto-render, so when we are NOT
  // tracing and the EffectComposer is NOT mounted (gap frames during mode
  // transitions) we must render the real-time frame ourselves.
  useFrame(({ gl: g, scene: sc, camera: cam }) => {
    if (composerActive) return; // composer owns the frame
    if (tracingRef.current && capableRef.current && enabled) return; // tracer owns it
    g.render(sc, cam);
  }, 2);

  return null;
}
