"use client";

import { useEffect, useRef } from "react";

/**
 * Aurora-alive brain — autonomous creature behind everything.
 * Hand-built SVG neural network (no Three.js, no WebGL, no extra deps).
 *
 * It runs in two moods:
 *   IDLE      — calm baseline firing, the brain quietly ticking over.
 *   THINKING  — wired to real chat activity via window CustomEvents:
 *               "silas:thinking" {detail:{active}} toggles the mood,
 *               "silas:token"    pulses a cascade in time with his typing.
 *               In this mood cascades fire faster/deeper/brighter and bright
 *               "thoughts" visibly travel node-to-node across the network.
 */

// ===========================================================================
// TUNABLES — change these to push density / shape / intensity.
// ===========================================================================

// --- Density & shape ---
const FRONT_NODES = 320; // foreground neuron count (was 180). Raise = denser.
const BACK_NODES = 240; // parallax background neuron count (was 140).
const NEIGHBORS = 4; // each node links to its N nearest neighbors (was 3).
const RIM_FRAC = 0.3; // fraction of nodes pinned to the cortical outline (silhouette).
const FISSURE_HALF = 10; // half-width (px) of the empty central fissure between hemispheres.

// --- Firing cadence ---
const IDLE_FIRE_MS = 700; // gap between cascades while idle.
const THINK_FIRE_MS = 180; // gap between cascades while thinking (much busier).
const CASCADE_DEPTH_IDLE = 2; // how many hops a cascade spreads when idle.
const CASCADE_DEPTH_THINK = 4; // how many hops when thinking (deeper, wider).

// --- Traveling thoughts (the bright point that walks across the brain) ---
const TRAVEL_THOUGHT_MS = 900; // gap between traveling thoughts while thinking.
const IDLE_TRAVEL_MS = 4200; // gap between (occasional) traveling thoughts while idle.
const TRAVEL_HOP_MS = 70; // how long the bright point dwells on each node it hops to.

// --- Glow / persistence ---
const GLOW = 1; // master glow multiplier; also drives the CSS `--ab-glow` var.
const BRIGHT_MS = 520; // how long a fired node stays lit (sets the comet-trail length).
const FIRE_MS = 700; // how long a fired connection stays lit.

export function AuroraBrain() {
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const backRef = useRef<SVGGElement>(null);
  const frontRef = useRef<SVGGElement>(null);
  const overlaysRef = useRef<SVGGElement>(null);
  const tendrilsRef = useRef<SVGGElement>(null);
  const particlesBackRef = useRef<HTMLDivElement>(null);
  const particlesFrontRef = useRef<HTMLDivElement>(null);
  const eyeRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (
      !stageRef.current ||
      !svgRef.current ||
      !backRef.current ||
      !frontRef.current ||
      !overlaysRef.current ||
      !tendrilsRef.current ||
      !particlesBackRef.current ||
      !particlesFrontRef.current ||
      !eyeRef.current
    )
      return;
    // After the guard above, every .current is non-null. Use ! so TS trusts us inside nested closures.
    const stage: HTMLDivElement = stageRef.current!;
    const svg: SVGSVGElement = svgRef.current!;
    const back: SVGGElement = backRef.current!;
    const front: SVGGElement = frontRef.current!;
    const overlays: SVGGElement = overlaysRef.current!;
    const tendrilsG: SVGGElement = tendrilsRef.current!;
    const pb: HTMLDivElement = particlesBackRef.current!;
    const pf: HTMLDivElement = particlesFrontRef.current!;
    const eye: SVGCircleElement = eyeRef.current!;

    const ns = "http://www.w3.org/2000/svg";
    const CX = 300;
    const CY = 240;

    // Expose the glow tunable to CSS so .bright / .fire scale from one place.
    stage.style.setProperty("--ab-glow", String(GLOW));

    // Respect reduced-motion: halve density + traveling-thought frequency, slow the loops.
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frontCount = reduce ? Math.round(FRONT_NODES / 2) : FRONT_NODES;
    const backCount = reduce ? Math.round(BACK_NODES / 2) : BACK_NODES;
    const slow = reduce ? 1.8 : 1; // multiplies firing intervals
    const travelMul = reduce ? 2 : 1; // multiplies traveling-thought intervals

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // ----- Tracked timers, so cleanup can clear everything we scheduled. -----
    const timers = new Set<number>();
    function later(fn: () => void, ms: number): number {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    }

    // -----------------------------------------------------------------------
    // Node layout — read as a BRAIN: two hemispheres, a central fissure with
    // no nodes near x≈CX, and a denser rim along the cortical outline.
    // Keeps the original lobed polar math as a base, then enforces those rules.
    // -----------------------------------------------------------------------
    function buildNodes(
      count: number,
      rBase: number,
      rRange: number,
      lobeOff: number,
      jitter: number
    ): Array<{ x: number; y: number }> {
      const arr: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const rim = Math.random() < RIM_FRAC;
        // Rim nodes hug the outer shell to make the silhouette recognizable.
        const r = rim
          ? rBase + rRange * (0.86 + Math.random() * 0.16)
          : rBase + Math.random() * rRange;
        const side = Math.cos(a) >= 0 ? 1 : -1; // hemisphere, by natural position
        let x = CX + Math.cos(a) * r + side * lobeOff + (Math.random() - 0.5) * jitter;
        const y = CY + Math.sin(a) * r * 0.82 + (Math.random() - 0.5) * jitter;
        // Enforce the central fissure: push anything inside the gap outward.
        if (Math.abs(x - CX) < FISSURE_HALF) {
          x = CX + side * (FISSURE_HALF + Math.random() * 7);
        }
        arr.push({ x, y });
      }
      return arr;
    }

    // Background nodes (smaller, dimmer, parallax depth)
    const backNodes = buildNodes(backCount, 90, 120, 26, 38);
    backNodes.forEach((n) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(n.x));
      c.setAttribute("cy", String(n.y));
      c.setAttribute("r", String(1 + Math.random() * 0.9));
      c.setAttribute("class", "ab-node-back");
      back.appendChild(c);
    });

    // Foreground nodes
    const nodes = buildNodes(frontCount, 75, 110, 22, 34);

    // Connections (each node → NEIGHBORS nearest). O(N^2) — done ONCE on mount.
    const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const conns: Array<{ a: number; b: number }> = [];
    const adj: Record<number, number[]> = {};
    const connIndex = new Map<string, number>(); // "a-b" (sorted) → conns index
    nodes.forEach((n, i) => {
      const near = nodes
        .map((m, j) => ({ j, d: Math.hypot(n.x - m.x, n.y - m.y) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, NEIGHBORS);
      adj[i] = near.map((o) => o.j);
      near.forEach((o) => {
        const key = pairKey(i, o.j);
        if (!connIndex.has(key)) {
          connIndex.set(key, conns.length);
          conns.push({ a: i, b: o.j });
        }
      });
    });

    // Cache element refs at creation time — indexed lookups, no querySelector in the hot path.
    const connEls: SVGLineElement[] = new Array(conns.length);
    conns.forEach((c, i) => {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", String(nodes[c.a].x));
      l.setAttribute("y1", String(nodes[c.a].y));
      l.setAttribute("x2", String(nodes[c.b].x));
      l.setAttribute("y2", String(nodes[c.b].y));
      l.setAttribute("class", "ab-conn");
      connEls[i] = l;
      front.appendChild(l);
    });
    const nodeEls: SVGCircleElement[] = new Array(nodes.length);
    nodes.forEach((n, i) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(n.x));
      c.setAttribute("cy", String(n.y));
      c.setAttribute("r", String(1.7 + Math.random() * 1.4));
      c.setAttribute("class", "ab-node");
      nodeEls[i] = c;
      front.appendChild(c);
    });

    // Per-element fade timers so rapid re-fires don't clear an element early.
    const nodeTimers: number[] = new Array(nodes.length).fill(0);
    const connTimers: number[] = new Array(conns.length).fill(0);

    function fireNode(idx: number, dur = BRIGHT_MS) {
      const el = nodeEls[idx];
      if (!el) return;
      el.classList.add("bright");
      if (nodeTimers[idx]) clearTimeout(nodeTimers[idx]);
      nodeTimers[idx] = window.setTimeout(() => {
        el.classList.remove("bright");
        nodeTimers[idx] = 0;
      }, dur);
    }
    function fireConn(idx: number, warm: boolean, dur = FIRE_MS) {
      const el = connEls[idx];
      if (!el) return;
      el.classList.remove("fire", "fire-warm");
      el.classList.add(warm ? "fire-warm" : "fire");
      if (connTimers[idx]) clearTimeout(connTimers[idx]);
      connTimers[idx] = window.setTimeout(() => {
        el.classList.remove("fire", "fire-warm");
        connTimers[idx] = 0;
      }, dur);
    }

    const randNode = () => Math.floor(Math.random() * nodes.length);

    function cascade(start: number, depth: number, warm: boolean) {
      if (depth <= 0) return;
      fireNode(start);
      const nb = adj[start] || [];
      const targets = [...nb].sort(() => Math.random() - 0.5).slice(0, Math.min(2, nb.length));
      targets.forEach((tg) => {
        const ci = connIndex.get(pairKey(start, tg));
        later(() => {
          if (ci != null) fireConn(ci, warm);
          later(() => cascade(tg, depth - 1, warm), 160);
        }, 90 + Math.random() * 90);
      });
    }

    // -----------------------------------------------------------------------
    // TRAVELING THOUGHT — pick a start node + a FAR target, then walk the
    // adjacency graph greedily toward the target, lighting each node and the
    // connecting line in sequence so a bright point visibly crosses the brain.
    // -----------------------------------------------------------------------
    function travelingThought(warm: boolean) {
      const start = randNode();
      // Pick the farthest of a few random candidates as the destination.
      let target = start;
      let best = -1;
      for (let t = 0; t < 8; t++) {
        const cand = randNode();
        const d = Math.hypot(
          nodes[cand].x - nodes[start].x,
          nodes[cand].y - nodes[start].y
        );
        if (d > best) {
          best = d;
          target = cand;
        }
      }
      const visited = new Set<number>([start]);
      let cur = start;
      let step = 0;
      const hop = () => {
        fireNode(cur, BRIGHT_MS);
        if (cur === target || step > 40) return;
        const nb = adj[cur] || [];
        // Greedy: the unvisited neighbor closest to the target.
        let next = -1;
        let nd = Infinity;
        for (const m of nb) {
          if (visited.has(m)) continue;
          const d = Math.hypot(nodes[m].x - nodes[target].x, nodes[m].y - nodes[target].y);
          if (d < nd) {
            nd = d;
            next = m;
          }
        }
        if (next < 0) return; // dead end — stop the thought here
        const ci = connIndex.get(pairKey(cur, next));
        if (ci != null) fireConn(ci, warm, FIRE_MS);
        visited.add(next);
        cur = next;
        step++;
        later(hop, TRAVEL_HOP_MS);
      };
      hop();
    }

    // -----------------------------------------------------------------------
    // Mood: `thinking` is the raw flag, `intensity` is its eased 0→1 value.
    // intensity drives cadence/depth/glow and ramps down smoothly (~1.5s).
    // -----------------------------------------------------------------------
    let thinking = false;
    let intensity = 0;

    // Tendrils (autonomous, undulate)
    const tendrils: Array<{
      el: SVGPathElement;
      angle: number;
      phase: number;
      phaseSpeed: number;
    }> = [];
    const TN = 6;
    for (let i = 0; i < TN; i++) {
      const t = document.createElementNS(ns, "path");
      t.setAttribute("class", "ab-tendril");
      tendrilsG.appendChild(t);
      tendrils.push({
        el: t,
        angle: (i / TN) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.0006 + Math.random() * 0.0005,
      });
    }

    let rafId = 0;
    function tick(t: number) {
      // Ease the mood. ~0.05/frame settles in roughly 1.5s — the smooth ramp-down.
      intensity += ((thinking ? 1 : 0) - intensity) * 0.05;

      tendrils.forEach((td) => {
        const ang = td.angle + Math.sin(t * td.phaseSpeed + td.phase) * 0.15;
        const baseR = 130 + Math.sin(t * 0.0008 + td.phase) * 8;
        const endR = baseR + 30 + Math.sin(t * 0.0012 + td.phase) * 15;
        const sx = CX + Math.cos(ang) * baseR;
        const sy = CY + Math.sin(ang) * baseR * 0.85;
        const ex = CX + Math.cos(ang) * endR;
        const ey = CY + Math.sin(ang) * endR * 0.85;
        const perp = ang + Math.PI / 2;
        const wave = Math.sin(t * 0.0015 + td.phase) * 15;
        const cx1 = (sx + ex) / 2 + Math.cos(perp) * wave;
        const cy1 = (sy + ey) / 2 + Math.sin(perp) * wave;
        td.el.setAttribute(
          "d",
          `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx1.toFixed(1)} ${cy1.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
        );
      });
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    // ----- Baseline firing loop (cadence/depth scale with intensity) -----
    function constantFire() {
      const depth = Math.round(lerp(CASCADE_DEPTH_IDLE, CASCADE_DEPTH_THINK, intensity));
      const warm = Math.random() < lerp(0.15, 0.55, intensity);
      cascade(randNode(), depth, warm);
      // Deep into thinking, fire a couple of cascades at once.
      if (intensity > 0.6 && Math.random() < 0.5) cascade(randNode(), depth, Math.random() < 0.5);
      const ms =
        lerp(IDLE_FIRE_MS, THINK_FIRE_MS, intensity) * slow * (0.7 + Math.random() * 0.6);
      later(constantFire, ms);
    }
    later(constantFire, 500);

    // ----- Traveling-thought loop (often when thinking, rarely when idle) -----
    function travelLoop() {
      if (intensity > 0.35) {
        travelingThought(Math.random() < 0.7);
        // Multiple thoughts crossing at once when he's really going.
        if (intensity > 0.7 && Math.random() < 0.6)
          later(() => travelingThought(Math.random() < 0.6), 150);
      } else if (Math.random() < 0.5) {
        travelingThought(Math.random() < 0.25); // occasional idle thought
      }
      const ms = lerp(IDLE_TRAVEL_MS, TRAVEL_THOUGHT_MS, intensity) * travelMul;
      later(travelLoop, ms);
    }
    later(travelLoop, 1200);

    // ----- React to real chat activity -----
    let lastToken = 0;
    function onToken() {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastToken < 90) return; // throttle bursty deltas
      lastToken = now;
      const depth = Math.round(lerp(CASCADE_DEPTH_IDLE, CASCADE_DEPTH_THINK, Math.max(intensity, 0.7)));
      cascade(randNode(), depth, Math.random() < 0.5);
      if (Math.random() < 0.35) travelingThought(Math.random() < 0.6);
    }
    const onThinking = (e: Event) => {
      const ce = e as CustomEvent<{ active?: boolean }>;
      thinking = !!ce.detail?.active;
    };
    window.addEventListener("silas:thinking", onThinking as EventListener);
    window.addEventListener("silas:token", onToken as EventListener);

    // Periodic thought storm
    const stormInterval = window.setInterval(() => {
      const burst = 10 + Math.floor(Math.random() * 6);
      for (let k = 0; k < burst; k++) {
        later(() => cascade(randNode(), 3, Math.random() < 0.2), k * 120);
      }
    }, 9000 + Math.random() * 4000);

    // Pulse waves
    const pulseInterval = window.setInterval(() => {
      const p = document.createElementNS(ns, "circle");
      p.setAttribute("cx", String(CX));
      p.setAttribute("cy", String(CY));
      p.setAttribute("r", "10");
      p.setAttribute("class", "ab-pulse-wave");
      overlays.appendChild(p);
      setTimeout(() => p.remove(), 9100);
    }, 10000);

    // Voice-like waveform pulses
    function waveform() {
      const w = document.createElementNS(ns, "path");
      const segments = 24;
      let d = "M ";
      for (let i = 0; i <= segments; i++) {
        const x = 160 + (i / segments) * 280;
        const phase = i * 0.5;
        const y =
          CY +
          Math.sin(phase) *
            (8 + Math.random() * 12) *
            Math.exp(-Math.pow((i - segments / 2) / (segments / 3), 2));
        d += `${x.toFixed(1)} ${y.toFixed(1)}${i < segments ? " L " : ""}`;
      }
      w.setAttribute("d", d);
      w.setAttribute("class", "ab-waveform");
      overlays.appendChild(w);
      setTimeout(() => w.remove(), 4100);
      later(waveform, 6500 + Math.random() * 5000);
    }
    later(waveform, 3000);

    // Particles
    function spawnParticle(layer: HTMLDivElement, frontLayer: boolean) {
      const p = document.createElement("div");
      p.className = "ab-p " + (frontLayer ? "ab-p-front" : "ab-p-back");
      p.style.left = Math.random() * 100 + "%";
      p.style.top = Math.random() * 100 + "%";
      p.style.setProperty("--dx", (Math.random() - 0.5) * (frontLayer ? 180 : 130) + "px");
      p.style.setProperty("--dy", (Math.random() - 0.5) * (frontLayer ? 180 : 130) + "px");
      p.style.setProperty("--op", frontLayer ? "0.85" : "0.4");
      p.style.animationDuration =
        (frontLayer ? 14 + Math.random() * 8 : 22 + Math.random() * 12) + "s";
      layer.appendChild(p);
      setTimeout(() => p.remove(), frontLayer ? 22000 : 34000);
    }
    for (let i = 0; i < 14; i++) spawnParticle(pb, false);
    for (let i = 0; i < 10; i++) spawnParticle(pf, true);
    const particleInterval = window.setInterval(() => {
      spawnParticle(pb, false);
      spawnParticle(pf, true);
    }, 2500);

    // Autonomous saccading eye — saccades faster + wider when thinking.
    let saccadeX = CX,
      saccadeY = CY,
      targetX = CX,
      targetY = CY;
    function saccade() {
      const range = 1 + intensity * 0.8;
      targetX = CX + (Math.random() - 0.5) * 50 * range;
      targetY = CY + (Math.random() - 0.5) * 38 * range;
      const ms = lerp(700, 240, intensity) * (0.6 + Math.random() * 1.2) * slow;
      later(saccade, ms);
    }
    saccade();
    let eyeRaf = 0;
    function eyeTick() {
      const ease = 0.15 + intensity * 0.1;
      saccadeX += (targetX - saccadeX) * ease;
      saccadeY += (targetY - saccadeY) * ease;
      const j = (Math.random() - 0.5) * (0.3 + intensity * 0.6);
      eye.setAttribute("cx", String(saccadeX + j));
      eye.setAttribute("cy", String(saccadeY + j));
      eyeRaf = requestAnimationFrame(eyeTick);
    }
    eyeRaf = requestAnimationFrame(eyeTick);

    // Cursor — very subtle (autonomous-first design)
    function onMove(e: MouseEvent) {
      const r = svg!.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 600;
      const my = ((e.clientY - r.top) / r.height) * 480;
      nodeEls.forEach((node, i) => {
        const d = Math.hypot(nodes[i].x - mx, nodes[i].y - my);
        if (d < 40) node.classList.add("bright");
        else if (!nodeTimers[i]) node.classList.remove("bright");
      });
    }
    stage.addEventListener("mousemove", onMove);

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(eyeRaf);
      timers.forEach((t) => clearTimeout(t));
      nodeTimers.forEach((t) => t && clearTimeout(t));
      connTimers.forEach((t) => t && clearTimeout(t));
      clearInterval(stormInterval);
      clearInterval(pulseInterval);
      clearInterval(particleInterval);
      stage.removeEventListener("mousemove", onMove);
      window.removeEventListener("silas:thinking", onThinking as EventListener);
      window.removeEventListener("silas:token", onToken as EventListener);
    };
  }, []);

  return (
    <div ref={stageRef} className="aurora-stage" aria-hidden="true">
      <div className="aurora-haze" />
      <div className="aurora-halo" />
      <div className="aurora-grain" />
      <div ref={particlesBackRef} className="aurora-particles" />
      <div ref={particlesFrontRef} className="aurora-particles" />
      <svg
        ref={svgRef}
        className="aurora-brain"
        viewBox="0 0 600 480"
        width="660"
        height="528"
      >
        <g ref={tendrilsRef} />
        <g ref={backRef} className="aurora-twitch" />
        <g ref={frontRef} className="aurora-twitch">
          <circle ref={eyeRef} cx="300" cy="240" r="4.8" className="aurora-eye-core" />
        </g>
        <g ref={overlaysRef} />
      </svg>
    </div>
  );
}
