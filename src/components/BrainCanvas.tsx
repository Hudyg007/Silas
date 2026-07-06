"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getBrainIntensity, onSettingsChange, BRAIN_INTENSITY_KEY } from "@/lib/settings";

/**
 * BrainCanvas — a three.js "thought-orb" brain that lives behind the chat.
 *
 * 700 dots form a two-hemisphere brain silhouette, joined by thin ice-blue
 * links. A bright white THOUGHT ORB walks dot-to-dot along real links, leaving
 * a glowing #9FF0FF trail on every dot and link it crosses. Its energy is wired
 * to Silas's real thinking via window CustomEvents dispatched by ChatInterface:
 *
 *   "silas:thinking" {detail:{active}}  — toggles IDLE ⇄ THINKING mood
 *   "silas:token"                        — one delta streamed: flash current dot
 *
 *   IDLE      calm dot-to-dot drift, rare faint secondary pulses.
 *   THINKING  orb ~3x faster, 2–3 secondary pulse-paths crossing other routes,
 *             brighter trail, slightly faster rotation, a flash per token.
 *   The mood eases (~1.5s) so THINKING → IDLE never snaps.
 *
 * The port is buffer-based (one Points, one LineSegments) rather than 700 live
 * meshes, so lighting individual dots/links is a cheap color-buffer write and
 * nothing is allocated per frame.
 */

// ===========================================================================
// TUNABLES — the knobs worth turning.
// ===========================================================================
const DOT_COUNT = 700; // dots forming the silhouette (halved for reduced-motion)
const LINK_DISTANCE = 0.25; // link two dots closer than this (world units)
const MAX_LINKS_PER_DOT = 4; // cap forward links per dot (matches Stitch)

const ORB_SPEED_IDLE = 0.01; // orb progress-per-frame while idle
const ORB_SPEED_THINK = 0.03; // ~3x faster while thinking
const TRAIL_FADE_MS = 1500; // how long a lit dot/link takes to fade to base
const GLOW = 1; // master glow multiplier for lit peaks

const ROT_IDLE = 0.002; // group rotation.y per frame, idle
const ROT_THINK = 0.0034; // slightly faster while thinking
const SECONDARY_PULSES = 3; // extra pulse-paths spawned while thinking

const CAMERA_FOV = 55; // vertical FOV; distance is fit so nothing crops
const FIT_MARGIN = 1.32; // padding so the whole brain sits clear of chrome

// Palette (Design System): icy hue for dots, ice-blue links, cyan-white trail.
const ICE_HUE = 0.55;
const GLOW_COLOR = new THREE.Color(0x9ff0ff); // trail / lit color
const LINK_BASE = new THREE.Color(0x4de3ff); // ice-blue links
const BASE_DOT_SCALE = 0.55; // dims the resting dot color (lit ones pop)
const LINK_BASE_SCALE = 0.12; // faint resting links (~0.1 opacity look)

export function BrainCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Respect reduced-motion: half the dots, half the orb speed, calmer spin.
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dotCount = reduce ? Math.round(DOT_COUNT / 2) : DOT_COUNT;
    const speedMul = reduce ? 0.5 : 1;
    const rotMul = reduce ? 0.5 : 1;

    // ---- Brain-intensity preference (settings → "Brain intensity") --------
    // "lively" is the baseline; "subtle" dims the glow and calms the motion.
    // liveMul scales orb speed, rotation, and lit-peak brightness; read live so
    // toggling the setting takes effect immediately.
    let liveMul = 1;
    const readIntensity = () => {
      liveMul = getBrainIntensity() === "subtle" ? 0.6 : 1;
    };
    readIntensity();
    const offSettings = onSettingsChange((key) => {
      if (key === BRAIN_INTENSITY_KEY) readIntensity();
    });

    // ---- Scene / camera / renderer (alpha, sits behind the chat) ----------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // ---- Dots: positions + per-vertex color buffers -----------------------
    const positions = new Float32Array(dotCount * 3);
    const colors = new Float32Array(dotCount * 3); // current (mutated)
    const dimColor = new Float32Array(dotCount * 3); // resting base per dot
    const brightness = new Float32Array(dotCount); // 0..1 glow amount

    const hsl = new THREE.Color();
    for (let i = 0; i < dotCount; i++) {
      // Even sphere: uniform direction, cortex-biased radius (denser toward the
      // outer shell than dead center → volume), plus ~7% radial noise so the
      // outline reads as a living cloud rather than a perfect ball.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const noise = 1 + (Math.random() * 2 - 1) * 0.07; // ±7% radial jitter
      const r = Math.pow(Math.random(), 0.5) * 0.85 * noise;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      hsl.setHSL(ICE_HUE, 0.8, 0.6 + Math.random() * 0.3);
      dimColor[i * 3] = hsl.r * BASE_DOT_SCALE;
      dimColor[i * 3 + 1] = hsl.g * BASE_DOT_SCALE;
      dimColor[i * 3 + 2] = hsl.b * BASE_DOT_SCALE;
      colors[i * 3] = dimColor[i * 3];
      colors[i * 3 + 1] = dimColor[i * 3 + 1];
      colors[i * 3 + 2] = dimColor[i * 3 + 2];
    }

    const dotGeom = new THREE.BufferGeometry();
    dotGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dotColorAttr = new THREE.BufferAttribute(colors, 3);
    dotGeom.setAttribute("color", dotColorAttr);

    const sprite = makeDotSprite(); // soft round glow texture
    const dotMat = new THREE.PointsMaterial({
      size: 0.05,
      map: sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(dotGeom, dotMat);
    brainGroup.add(points);

    // ---- Links: build segments + adjacency for the orb to walk ------------
    const neighbors: number[][] = Array.from({ length: dotCount }, () => []);
    const linkA: number[] = [];
    const linkB: number[] = [];
    const linkIndex = new Map<number, number>(); // a*dotCount+b (a<b) -> seg idx
    const dist = (i: number, j: number) => {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    for (let i = 0; i < dotCount; i++) {
      let n = 0;
      for (let j = i + 1; j < dotCount && n < MAX_LINKS_PER_DOT; j++) {
        if (dist(i, j) < LINK_DISTANCE) {
          linkIndex.set(i * dotCount + j, linkA.length);
          linkA.push(i);
          linkB.push(j);
          neighbors[i].push(j);
          neighbors[j].push(i);
          n++;
        }
      }
    }

    const segCount = linkA.length;
    const linkPos = new Float32Array(segCount * 6);
    const linkCol = new Float32Array(segCount * 6);
    const linkBright = new Float32Array(segCount);
    const linkDim = new THREE.Color(
      LINK_BASE.r * LINK_BASE_SCALE,
      LINK_BASE.g * LINK_BASE_SCALE,
      LINK_BASE.b * LINK_BASE_SCALE
    );
    for (let s = 0; s < segCount; s++) {
      const a = linkA[s];
      const b = linkB[s];
      linkPos[s * 6] = positions[a * 3];
      linkPos[s * 6 + 1] = positions[a * 3 + 1];
      linkPos[s * 6 + 2] = positions[a * 3 + 2];
      linkPos[s * 6 + 3] = positions[b * 3];
      linkPos[s * 6 + 4] = positions[b * 3 + 1];
      linkPos[s * 6 + 5] = positions[b * 3 + 2];
      for (let k = 0; k < 6; k += 3) {
        linkCol[s * 6 + k] = linkDim.r;
        linkCol[s * 6 + k + 1] = linkDim.g;
        linkCol[s * 6 + k + 2] = linkDim.b;
      }
    }
    const linkGeom = new THREE.BufferGeometry();
    linkGeom.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
    const linkColorAttr = new THREE.BufferAttribute(linkCol, 3);
    linkGeom.setAttribute("color", linkColorAttr);
    const linkMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(linkGeom, linkMat);
    brainGroup.add(lines);

    // ---- The orb (white sphere + additive halo), rides inside the group ---
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), orbMat);
    const haloMat = new THREE.SpriteMaterial({
      map: sprite,
      color: GLOW_COLOR,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(0.18, 0.18, 0.18);
    orb.add(halo);
    brainGroup.add(orb);

    // ---- Lighting helpers (write into color buffers, track active sets) ---
    const activeDots = new Set<number>();
    const activeLinks = new Set<number>();
    const lightDot = (i: number, peak: number) => {
      if (i < 0 || i >= dotCount) return;
      if (peak > brightness[i]) brightness[i] = peak;
      activeDots.add(i);
    };
    const lightLink = (a: number, b: number, peak: number) => {
      const key = a < b ? a * dotCount + b : b * dotCount + a;
      const s = linkIndex.get(key);
      if (s === undefined) return;
      if (peak > linkBright[s]) linkBright[s] = peak;
      activeLinks.add(s);
    };

    // ---- Walkers: the orb + a pool of secondary pulse-paths ---------------
    type Walker = { cur: number; next: number; prev: number; progress: number };
    const findNextDot = (index: number, prev: number) => {
      const nb = neighbors[index];
      if (nb.length) {
        let pick = nb[(Math.random() * nb.length) | 0];
        if (pick === prev && nb.length > 1) {
          pick = nb[(Math.random() * nb.length) | 0];
        }
        return pick;
      }
      // No links: fall back to the nearest dot so the walk never teleports.
      let best = -1;
      let min = Infinity;
      for (let i = 0; i < dotCount; i++) {
        if (i === index) continue;
        const d = dist(index, i);
        if (d < min) {
          min = d;
          best = i;
        }
      }
      return best;
    };
    const newWalker = (): Walker => {
      const cur = (Math.random() * dotCount) | 0;
      const next = findNextDot(cur, -1);
      return { cur, next, prev: cur, progress: 0 };
    };
    const orbWalker = newWalker();
    lightDot(orbWalker.cur, 1);
    lightLink(orbWalker.cur, orbWalker.next, 1);

    const pulses: Walker[] = [];

    // Advance a walker; light each dot on arrival and the link it starts to
    // cross. Returns the peak used so the orb can share the same intensity.
    const stepWalker = (w: Walker, speed: number, peak: number) => {
      w.progress += speed;
      while (w.progress >= 1) {
        w.progress -= 1;
        w.prev = w.cur;
        w.cur = w.next;
        lightDot(w.cur, peak);
        w.next = findNextDot(w.cur, w.prev);
        lightLink(w.cur, w.next, peak);
      }
    };

    // ---- Camera fit: whole brain between header and input, no cropping ----
    let radiusXZ = 0.0001;
    let radiusY = 0.0001;
    for (let i = 0; i < dotCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      radiusXZ = Math.max(radiusXZ, Math.sqrt(x * x + z * z));
      radiusY = Math.max(radiusY, Math.abs(y));
    }
    // pad for orb radius + halo so the moving orb never clips at the edge.
    radiusXZ += 0.12;
    radiusY += 0.12;
    const fitCamera = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      const aspect = w / h;
      const tanHalf = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2);
      const dV = radiusY / tanHalf; // vertical constraint
      const dH = radiusXZ / (tanHalf * aspect); // horizontal constraint
      camera.aspect = aspect;
      camera.position.set(0, 0, Math.max(dV, dH) * FIT_MARGIN);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    fitCamera();

    // ---- Mood: `thinking` flag, `intensity` its eased 0→1 value -----------
    let thinking = false;
    let intensity = 0;
    // brighter when busy, dimmed when the "subtle" intensity is selected
    const peakFor = () => GLOW * (0.5 + 0.5 * intensity) * (0.65 + 0.35 * liveMul);

    // ---- Real-thinking event wiring ---------------------------------------
    const onThinking = (e: Event) => {
      thinking = !!(e as CustomEvent<{ active?: boolean }>).detail?.active;
    };
    let lastToken = 0;
    const onToken = () => {
      const now = performance.now();
      if (now - lastToken < 40) return; // throttle bursty deltas
      lastToken = now;
      lightDot(orbWalker.cur, 1); // a crisp flash at the orb's dot
    };
    window.addEventListener("silas:thinking", onThinking as EventListener);
    window.addEventListener("silas:token", onToken as EventListener);

    // ---- Animation loop (Clock delta; nothing allocated per frame) --------
    const clock = new THREE.Clock();
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    let raf = 0;
    let idlePulseCooldown = 2 + Math.random() * 3;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05); // clamp after tab-away
      const frames = dt * 60; // normalize the 60fps-tuned constants

      // Ease the mood (~1.5s settle), then derive live speeds.
      intensity += ((thinking ? 1 : 0) - intensity) * Math.min(1, 0.05 * frames);
      const orbSpeed =
        (ORB_SPEED_IDLE + (ORB_SPEED_THINK - ORB_SPEED_IDLE) * intensity) *
        speedMul *
        liveMul *
        frames;
      brainGroup.rotation.y +=
        (ROT_IDLE + (ROT_THINK - ROT_IDLE) * intensity) * rotMul * liveMul * frames;

      const peak = peakFor();

      // Main orb.
      stepWalker(orbWalker, orbSpeed, peak);
      tmpA.set(
        positions[orbWalker.cur * 3],
        positions[orbWalker.cur * 3 + 1],
        positions[orbWalker.cur * 3 + 2]
      );
      tmpB.set(
        positions[orbWalker.next * 3],
        positions[orbWalker.next * 3 + 1],
        positions[orbWalker.next * 3 + 2]
      );
      orb.position.lerpVectors(tmpA, tmpB, orbWalker.progress);
      const orbGlow = 0.16 + intensity * 0.12;
      halo.scale.setScalar(orbGlow);

      // Secondary pulse-paths: 2–3 while thinking, a rare faint one when idle.
      const want = intensity > 0.35 ? SECONDARY_PULSES : 0;
      while (pulses.length < want) pulses.push(newWalker());
      if (want === 0 && pulses.length) {
        idlePulseCooldown -= dt;
        if (idlePulseCooldown <= 0) {
          pulses.length = 0; // let idle pulses expire once mood has cooled
          idlePulseCooldown = 2 + Math.random() * 3;
        }
      }
      if (want === 0 && !pulses.length) {
        idlePulseCooldown -= dt;
        if (idlePulseCooldown <= 0) {
          pulses.push(newWalker()); // occasional faint idle pulse
          idlePulseCooldown = 4 + Math.random() * 4;
        }
      }
      const pulsePeak = want === 0 ? 0.35 : peak * 0.85;
      for (let p = 0; p < pulses.length; p++) {
        stepWalker(pulses[p], orbSpeed * 0.9, pulsePeak);
      }

      // Decay + repaint only the dots/links currently lit.
      if (activeDots.size) {
        const fade = dt / (TRAIL_FADE_MS / 1000);
        for (const i of activeDots) {
          const b = (brightness[i] -= fade);
          if (b <= 0) {
            brightness[i] = 0;
            colors[i * 3] = dimColor[i * 3];
            colors[i * 3 + 1] = dimColor[i * 3 + 1];
            colors[i * 3 + 2] = dimColor[i * 3 + 2];
            activeDots.delete(i);
          } else {
            colors[i * 3] = dimColor[i * 3] + (GLOW_COLOR.r - dimColor[i * 3]) * b;
            colors[i * 3 + 1] =
              dimColor[i * 3 + 1] + (GLOW_COLOR.g - dimColor[i * 3 + 1]) * b;
            colors[i * 3 + 2] =
              dimColor[i * 3 + 2] + (GLOW_COLOR.b - dimColor[i * 3 + 2]) * b;
          }
        }
        dotColorAttr.needsUpdate = true;
      }
      if (activeLinks.size) {
        const fade = dt / (TRAIL_FADE_MS / 1000);
        for (const s of activeLinks) {
          const b = (linkBright[s] -= fade);
          const o = s * 6;
          if (b <= 0) {
            linkBright[s] = 0;
            for (let k = 0; k < 6; k += 3) {
              linkCol[o + k] = linkDim.r;
              linkCol[o + k + 1] = linkDim.g;
              linkCol[o + k + 2] = linkDim.b;
            }
            activeLinks.delete(s);
          } else {
            const r = linkDim.r + (GLOW_COLOR.r - linkDim.r) * b;
            const g = linkDim.g + (GLOW_COLOR.g - linkDim.g) * b;
            const bl = linkDim.b + (GLOW_COLOR.b - linkDim.b) * b;
            for (let k = 0; k < 6; k += 3) {
              linkCol[o + k] = r;
              linkCol[o + k + 1] = g;
              linkCol[o + k + 2] = bl;
            }
          }
        }
        linkColorAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize -----------------------------------------------------------
    const onResize = () => fitCamera();
    window.addEventListener("resize", onResize);

    // ---- Cleanup: dispose every three.js resource + listener --------------
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("silas:thinking", onThinking as EventListener);
      window.removeEventListener("silas:token", onToken as EventListener);
      offSettings();
      dotGeom.dispose();
      dotMat.dispose();
      linkGeom.dispose();
      linkMat.dispose();
      orb.geometry.dispose();
      orbMat.dispose();
      haloMat.dispose();
      sprite.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="brain-canvas" aria-hidden="true" />;
}

// A soft radial-gradient sprite so points/halo read as round glows, not squares.
function makeDotSprite(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
