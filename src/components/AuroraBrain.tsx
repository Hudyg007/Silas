"use client";

import { useEffect, useRef } from "react";

/**
 * Aurora-alive brain — autonomous creature behind everything.
 * Ported from the v4 widget mockup. SVG-based for now (works on phone, no WebGL needed).
 *
 * Future: replace with Three.js for true 7k-node scale + WebGL effects.
 */
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
    const stage = stageRef.current;
    const svg = svgRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    const overlays = overlaysRef.current;
    const tendrilsG = tendrilsRef.current;
    const pb = particlesBackRef.current;
    const pf = particlesFrontRef.current;
    const eye = eyeRef.current;
    if (!stage || !svg || !back || !front || !overlays || !tendrilsG || !pb || !pf || !eye) return;

    const ns = "http://www.w3.org/2000/svg";
    const CX = 300;
    const CY = 240;

    // Background nodes (smaller, dimmer, parallax depth)
    const backNodes: Array<{ x: number; y: number }> = [];
    const BN = 140;
    for (let i = 0; i < BN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 120;
      const lobe = (i % 2 === 0 ? -1 : 1) * 38;
      const x = CX + Math.cos(a) * r + lobe + (Math.random() - 0.5) * 38;
      const y = CY + Math.sin(a) * r * 0.82 + (Math.random() - 0.5) * 32;
      backNodes.push({ x, y });
    }
    backNodes.forEach((n) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(n.x));
      c.setAttribute("cy", String(n.y));
      c.setAttribute("r", String(1 + Math.random() * 0.9));
      c.setAttribute("class", "ab-node-back");
      back.appendChild(c);
    });

    // Foreground nodes
    const nodes: Array<{ x: number; y: number }> = [];
    const N = 180;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 75 + Math.random() * 110;
      const lobe = (i % 2 === 0 ? -1 : 1) * 40;
      const x = CX + Math.cos(a) * r + lobe + (Math.random() - 0.5) * 40;
      const y = CY + Math.sin(a) * r * 0.82 + (Math.random() - 0.5) * 32;
      nodes.push({ x, y });
    }

    // Connections (each node → 3 nearest neighbors)
    const conns: Array<{ a: number; b: number }> = [];
    const adj: Record<number, number[]> = {};
    nodes.forEach((n, i) => {
      const d = nodes
        .map((m, j) => ({ j, d: Math.hypot(n.x - m.x, n.y - m.y) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      adj[i] = d.map((o) => o.j);
      d.forEach((o) => {
        if (!conns.some((c) => (c.a === i && c.b === o.j) || (c.a === o.j && c.b === i)))
          conns.push({ a: i, b: o.j });
      });
    });

    conns.forEach((c, i) => {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", String(nodes[c.a].x));
      l.setAttribute("y1", String(nodes[c.a].y));
      l.setAttribute("x2", String(nodes[c.b].x));
      l.setAttribute("y2", String(nodes[c.b].y));
      l.setAttribute("class", "ab-conn");
      l.setAttribute("data-i", String(i));
      front.appendChild(l);
    });
    nodes.forEach((n, i) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(n.x));
      c.setAttribute("cy", String(n.y));
      c.setAttribute("r", String(1.7 + Math.random() * 1.4));
      c.setAttribute("class", "ab-node");
      c.setAttribute("data-i", String(i));
      front.appendChild(c);
    });

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

    // Firing logic
    function fireConn(idx: number, warm: boolean) {
      const l = svg!.querySelector(`.ab-conn[data-i="${idx}"]`);
      if (!l) return;
      l.classList.add(warm ? "fire-warm" : "fire");
      setTimeout(() => l.classList.remove(warm ? "fire-warm" : "fire"), 900);
    }
    function fireNode(idx: number) {
      const n = svg!.querySelector(`.ab-node[data-i="${idx}"]`);
      if (!n) return;
      n.classList.add("bright");
      setTimeout(() => n.classList.remove("bright"), 800);
    }
    function cascade(start: number, depth: number, warm: boolean) {
      if (depth <= 0) return;
      fireNode(start);
      const nb = adj[start] || [];
      const targets = [...nb].sort(() => Math.random() - 0.5).slice(0, Math.min(2, nb.length));
      targets.forEach((tg) => {
        const c = conns.findIndex(
          (c) => (c.a === start && c.b === tg) || (c.a === tg && c.b === start)
        );
        if (c >= 0)
          setTimeout(() => {
            fireConn(c, warm);
            setTimeout(() => cascade(tg, depth - 1, warm), 180);
          }, 100 + Math.random() * 100);
      });
    }

    const fireTimers: number[] = [];
    function constantFire() {
      const start = Math.floor(Math.random() * nodes.length);
      const warm = Math.random() < 0.18;
      cascade(start, 2 + Math.floor(Math.random() * 2), warm);
      fireTimers.push(window.setTimeout(constantFire, 400 + Math.random() * 500));
    }
    fireTimers.push(window.setTimeout(constantFire, 500));

    // Periodic thought storm
    const stormInterval = window.setInterval(() => {
      const burst = 10 + Math.floor(Math.random() * 6);
      for (let k = 0; k < burst; k++) {
        setTimeout(() => cascade(Math.floor(Math.random() * nodes.length), 3, Math.random() < 0.13), k * 120);
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
      window.setTimeout(waveform, 6500 + Math.random() * 5000);
    }
    window.setTimeout(waveform, 3000);

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

    // Autonomous saccading eye
    let saccadeX = CX,
      saccadeY = CY,
      targetX = CX,
      targetY = CY;
    function saccade() {
      targetX = CX + (Math.random() - 0.5) * 50;
      targetY = CY + (Math.random() - 0.5) * 38;
      window.setTimeout(saccade, 600 + Math.random() * 1400);
    }
    saccade();
    let eyeRaf = 0;
    function eyeTick() {
      saccadeX += (targetX - saccadeX) * 0.15;
      saccadeY += (targetY - saccadeY) * 0.15;
      const j = (Math.random() - 0.5) * 0.3;
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
      svg!.querySelectorAll<SVGCircleElement>(".ab-node").forEach((node, i) => {
        const d = Math.hypot(nodes[i].x - mx, nodes[i].y - my);
        if (d < 40) node.classList.add("bright");
        else node.classList.remove("bright");
      });
    }
    stage.addEventListener("mousemove", onMove);

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(eyeRaf);
      fireTimers.forEach((t) => clearTimeout(t));
      clearInterval(stormInterval);
      clearInterval(pulseInterval);
      clearInterval(particleInterval);
      stage.removeEventListener("mousemove", onMove);
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
