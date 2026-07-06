/**
 * Small static neural-cluster glyph used in place of an avatar photo on the
 * settings Identity card. Ice-blue nodes over the deep-indigo surface, echoing
 * the living brain without pulling in the full canvas.
 */
export function MiniBrain({ size = 48 }: { size?: number }) {
  // Deterministic layout (no randomness) so server/client render identically.
  const nodes: Array<[number, number, number]> = [
    [16, 20, 2.4],
    [24, 14, 2],
    [32, 20, 2.4],
    [14, 30, 1.8],
    [24, 26, 3],
    [34, 30, 1.8],
    [20, 36, 2],
    [28, 36, 2],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [0, 4], [2, 4], [3, 4], [5, 4], [4, 6], [4, 7], [6, 7], [3, 0], [5, 2],
  ];

  return (
    <div
      className="flex items-center justify-center rounded-full border border-primary-container/30 bg-surface-container-lowest"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
        <g stroke="#4de3ff" strokeOpacity="0.35" strokeWidth="0.8">
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a][0]}
              y1={nodes[a][1]}
              x2={nodes[b][0]}
              y2={nodes[b][1]}
            />
          ))}
        </g>
        <g>
          {nodes.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#4de3ff" fillOpacity={i === 4 ? 1 : 0.7} />
          ))}
          <circle cx={nodes[4][0]} cy={nodes[4][1]} r={5.5} fill="none" stroke="#4de3ff" strokeOpacity="0.25" />
        </g>
      </svg>
    </div>
  );
}
