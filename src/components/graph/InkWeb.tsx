import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { extractWikiLinks } from '../../lib/notes';
import { blotPath, hashOf } from '../../lib/ink-shapes';
import { PenRest } from '../../lib/ink';

type NodeKind = 'page' | 'daily' | 'ghost';

interface WebNode {
  id: string;
  label: string;
  words: number;
  kind: NodeKind;
  pinned: boolean;
  x: number; y: number; vx: number; vy: number;
}

interface WebEdge {
  a: number;
  b: number;
}

/** A vein: a ribbon that tapers as it runs from blot to blot. */
const veinPath = (ax: number, ay: number, bx: number, by: number, bowSign: number): string => {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let nx = -(by - ay);
  let ny = bx - ax;
  const len = Math.max(1, Math.hypot(nx, ny));
  nx /= len; ny /= len;
  const bow = bowSign * len * 0.07;
  const cx = mx + nx * bow;
  const cy = my + ny * bow;
  const w1 = 1.5, w2 = 0.55;
  return `M ${ax + nx * w1} ${ay + ny * w1} Q ${cx + nx * w1 * 0.7} ${cy + ny * w1 * 0.7} ${bx + nx * w2} ${by + ny * w2} L ${bx - nx * w2} ${by - ny * w2} Q ${cx - nx * w1 * 0.7} ${cy - ny * w1 * 0.7} ${ax - nx * w1} ${ay - ny * w1} Z`;
};

/** Small hand-rolled force layout — repulsion, springs on edges, pull to center. */
const settle = (nodes: WebNode[], edges: WebEdge[], iterations = 340) => {
  const radius = 160 + nodes.length * 14;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 + hashOf(n.id) * 0.9;
    n.x = Math.cos(angle) * radius * (0.55 + hashOf(n.id + 'x') * 0.45);
    n.y = Math.sin(angle) * radius * (0.55 + hashOf(n.id + 'y') * 0.45);
    n.vx = 0; n.vy = 0;
  });
  const rest = 150;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = hashOf(nodes[i].id + 'j') - 0.5; dy = hashOf(nodes[j].id + 'j') - 0.5; d2 = 0.5; }
        const d = Math.sqrt(d2);
        const f = Math.min(5, (70 * 70) / d2 * 2.4);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - rest) * 0.045;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += -n.x * 0.012;
      n.vy += -n.y * 0.012;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-8, Math.min(8, n.vx));
      n.y += Math.max(-8, Math.min(8, n.vy));
    }
  }
};

const blotRadius = (node: WebNode) =>
  node.kind === 'ghost' ? 4.5 : 6.5 + Math.min(9, Math.sqrt(Math.max(0, node.words)) * 0.85);

export const InkWeb: React.FC = () => {
  const { notes, setActiveNote, addNote } = useStore();
  const [hovered, setHovered] = useState<string | null>(null);
  const navigate = useNavigate();

  const { nodes, edges, viewBox } = useMemo(() => {
    const live = notes.filter(n => !n.trashedAt);
    const nodes: WebNode[] = live.map(n => ({
      id: n.id,
      label: n.title || 'Untitled',
      words: n.wordCount,
      kind: n.dailyKey ? 'daily' : 'page',
      pinned: n.isPinned,
      x: 0, y: 0, vx: 0, vy: 0,
    }));
    const byTitle = new Map<string, number>();
    nodes.forEach((n, i) => byTitle.set(n.label.trim().toLowerCase(), i));

    const edges: WebEdge[] = [];
    const seen = new Set<string>();
    const ghosts = new Map<string, number>();
    live.forEach((note, i) => {
      for (const target of extractWikiLinks(note.content)) {
        const titleKey = target.toLowerCase();
        let j = byTitle.get(titleKey);
        if (j === undefined) {
          if (!ghosts.has(titleKey)) {
            ghosts.set(titleKey, nodes.length);
            nodes.push({
              id: `ghost:${titleKey}`,
              label: target,
              words: 0,
              kind: 'ghost',
              pinned: false,
              x: 0, y: 0, vx: 0, vy: 0,
            });
          }
          j = ghosts.get(titleKey)!;
        }
        if (j === i) continue;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: i, b: j });
      }
    });

    if (nodes.length === 0) return { nodes, edges, viewBox: '0 0 0 0' };
    settle(nodes, edges);

    const pad = 90;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad - 14, maxY = Math.max(...ys) + pad + 20;
    return { nodes, edges, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` };
  }, [notes]);

  const neighbours = useMemo(() => {
    if (!hovered) return null;
    const idx = nodes.findIndex(n => n.id === hovered);
    const set = new Set<number>([idx]);
    edges.forEach(e => {
      if (e.a === idx) set.add(e.b);
      if (e.b === idx) set.add(e.a);
    });
    return set;
  }, [hovered, nodes, edges]);

  const openNode = (node: WebNode) => {
    if (node.kind === 'ghost') {
      addNote({ title: node.label });
    } else {
      setActiveNote(node.id);
    }
    navigate('/');
  };

  const linkCount = edges.length;
  const ghostCount = nodes.filter(n => n.kind === 'ghost').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-desk">
      <div className="px-6 md:px-10 pt-10 md:pt-14 pb-4 flex-shrink-0">
        <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">The ink web</h1>
        <p className="text-sm text-ink-faint mt-1.5 max-w-lg">
          Pages that name each other, drawn vein to blot. Blot size follows word count; dashed circles are pages referenced but not yet written — click one to begin it.
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 md:px-10 pb-6">
        {nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <PenRest className="w-28 h-14 mb-1 opacity-80" />
            <p className="font-serif text-lg text-ink-ghost">A clean sheet. Nothing woven yet.</p>
            <p className="font-mono text-2xs text-ink-ghost">link notes with [[their titles]] and veins appear</p>
          </div>
        ) : (
          <div className="relative h-full bg-paper border border-line rounded sheet paper-grain overflow-hidden">
            <svg viewBox={viewBox} className="w-full h-full" role="img" aria-label={`Ink web — ${nodes.length - ghostCount} pages, ${linkCount} links`}>
              {/* veins — ribbons of ink that taper as they run */}
              {edges.map((e, i) => {
                const a = nodes[e.a];
                const b = nodes[e.b];
                const lit = hovered && (nodes[e.a].id === hovered || nodes[e.b].id === hovered);
                return (
                  <path
                    key={i}
                    d={veinPath(a.x, a.y, b.x, b.y, i % 2 === 0 ? 1 : -1)}
                    fill={lit ? 'var(--color-pencil)' : 'var(--color-ink-ghost)'}
                    fillOpacity={hovered && !lit ? 0.12 : lit ? 0.85 : 0.4}
                    strokeDasharray={nodes[e.a].kind === 'ghost' || nodes[e.b].kind === 'ghost' ? '3 4' : undefined}
                    stroke={nodes[e.a].kind === 'ghost' || nodes[e.b].kind === 'ghost' ? 'none' : undefined}
                    style={{ transition: 'fill-opacity .15s, fill .15s' }}
                  />
                );
              })}
              {/* blots — every page is its own stain, seeded by id */}
              {nodes.map((node, i) => {
                const r = blotRadius(node);
                const dimmed = neighbours ? !neighbours.has(i) : false;
                const seed = hashOf(node.id);
                return (
                  <g
                    key={node.id}
                    onClick={() => openNode(node)}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(node); } }}
                    className="cursor-pointer outline-none"
                    opacity={dimmed ? 0.22 : 1}
                    style={{ transition: 'opacity .15s' }}
                    aria-label={`${node.label}${node.kind === 'ghost' ? ' — unwritten page' : ''}`}
                  >
                    <g transform={`translate(${node.x} ${node.y})`}>
                      {node.kind === 'ghost' ? (
                        <path
                          d={blotPath(node.id, r * 4)}
                          transform="scale(0.25)"
                          fill="none"
                          stroke="var(--color-ink-ghost)"
                          strokeWidth={4}
                          strokeDasharray="10 10"
                          vectorEffect="non-scaling-stroke"
                          strokeDashoffset={0}
                        />
                      ) : (
                        <path
                          d={blotPath(node.id, r * 4)}
                          transform="scale(0.25)"
                          fill={node.kind === 'daily' ? 'var(--color-fountain)' : 'var(--color-ink)'}
                          fillOpacity={node.kind === 'daily' ? 0.9 : 0.82}
                          stroke={node.pinned ? 'var(--color-pencil)' : 'none'}
                          strokeWidth={node.pinned ? 5 : 0}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {/* a fleck flung from the same nib */}
                      {node.kind !== 'ghost' && (
                        <circle
                          cx={r * 1.7 + seed * 5}
                          cy={-r * 1.15}
                          r={1.3 + seed * 1.4}
                          fill={node.kind === 'daily' ? 'var(--color-fountain)' : 'var(--color-ink)'}
                          fillOpacity={0.5}
                        />
                      )}
                    </g>
                    <text
                      x={node.x}
                      y={node.y + r + 13}
                      textAnchor="middle"
                      className="font-serif"
                      fontSize="11"
                      fontStyle={node.kind === 'ghost' ? 'italic' : 'normal'}
                      fill={hovered === node.id ? 'var(--color-ink)' : 'var(--color-ink-soft)'}
                      opacity={dimmed ? 0.3 : 0.9}
                    >
                      {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* legend */}
            <div className="absolute bottom-3 left-4 flex items-center gap-4 font-mono text-2xs text-ink-ghost select-none">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ink inline-block" /> page</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-fountain inline-block" /> journal</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border-2 border-pencil inline-block" /> pinned</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-dashed border-ink-ghost inline-block" /> unwritten</span>
            </div>
            <p className="absolute top-3 right-4 font-mono text-2xs text-ink-ghost tabular-nums">
              {nodes.length - ghostCount} pages · {linkCount} {linkCount === 1 ? 'vein' : 'veins'}{ghostCount > 0 ? ` · ${ghostCount} unwritten` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
