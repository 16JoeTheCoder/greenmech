import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Connection, Module } from '../lib/types';
import { STATUS } from '../lib/status';
import { effective, type Eff } from '../lib/connections';
import { Icon } from './ui';

export interface BayProps {
  modules: Module[];
  flags: Map<string, number>;
  onPick: (m: Module) => void;
  selectedId?: string | null;
  isMatch?: (m: Module) => boolean;
  mode?: 'modules' | 'connections';
  conns?: Connection[];
  byId?: Map<string, Module>;
  selectedConn?: string | null;
  onPickConn?: (c: Connection) => void;
  pickHint?: (m: Module) => string | null;
}

export function tiersOf(modules: Module[]) {
  const placed = new Map<number, Module[]>();
  const unplaced: Module[] = [];
  for (const m of modules) {
    if (m.tier < 0) unplaced.push(m);
    else (placed.get(m.tier) ?? placed.set(m.tier, []).get(m.tier)!).push(m);
  }
  const sort = (a: Module, b: Module) => a.order - b.order || a.slug.localeCompare(b.slug);
  const tiers = [...placed.entries()].sort((a, b) => b[0] - a[0]).map(([t, ms]) => ({ tier: t, ms: ms.sort(sort) }));
  return { tiers, unplaced: unplaced.sort(sort) };
}

function Bay({
  m,
  flags,
  onPick,
  selected,
  dim,
  mode,
  hint,
}: {
  m: Module;
  flags: number;
  onPick: () => void;
  selected: boolean;
  dim: boolean;
  mode: 'modules' | 'connections';
  hint: string | null;
}) {
  const s = STATUS[m.status];
  const name = `${m.leaderInitials ? `, led by ${m.leaderInitials}` : ', no leader'}${flags ? `, ${flags} open flag${flags > 1 ? 's' : ''}` : ''}${hint ? `. ${hint}` : ''}`;
  return (
    <button
      type="button"
      class={`gm-bay gm-bay-${s.key} ${selected ? 'gm-bay-selected' : ''} ${dim ? 'gm-bay-dim' : ''} ${mode === 'connections' ? 'gm-bay-conn' : ''}`}
      data-bay={m.id}
      aria-pressed={selected}
      onClick={onPick}
    >
      {m.status === 2 && !dim && (
        <svg class="gm-hatch" aria-hidden="true">
          <rect width="100%" height="100%" fill="url(#gm-hatch)" />
        </svg>
      )}
      <span class="gm-bay-top">
        <Icon name="box" />
        {m.leaderInitials && <span class="gm-initials">{m.leaderInitials}</span>}
      </span>
      <span class="gm-bay-slug">{m.slug}</span>
      {name && <span class="gm-sr">{name}</span>}
      <span class="gm-bay-foot">
        <span class={`gm-badge gm-badge-${s.key}`}>
          <Icon name={s.icon} />
          {s.word}
        </span>
        {flags > 0 && (
          <span class="gm-flagdots" aria-hidden="true">
            {Array.from({ length: Math.min(flags, 3) }, (_, i) => (
              <span key={i} class="gm-dot" />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

export function Elevation(p: BayProps) {
  const { tiers, unplaced } = tiersOf(p.modules);
  const mode = p.mode ?? 'modules';
  const wrap = useRef<HTMLDivElement>(null);
  const bayRow = (ms: Module[]) =>
    ms.map((m) => (
      <Bay
        key={m.id}
        m={m}
        flags={p.flags.get(m.id) ?? 0}
        onPick={() => p.onPick(m)}
        selected={p.selectedId === m.id}
        dim={!!p.isMatch && !p.isMatch(m)}
        mode={mode}
        hint={p.pickHint?.(m) ?? null}
      />
    ));
  return (
    <div class={`gm-elev ${mode === 'connections' ? 'gm-elev-conn' : ''}`} ref={wrap}>
      <svg width="0" height="0" class="gm-defs" aria-hidden="true">
        <defs>
          <pattern id="gm-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--control-edge)" stroke-width="1.5" />
          </pattern>
          <marker id="gm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
      </svg>
      <div class="gm-tower">
        {tiers.map(({ tier, ms }) => (
          <section key={tier} class="gm-tier" aria-label={`Tier ${tier + 1}`}>
            <span class="gm-tier-label">Tier {tier + 1}</span>
            <div class="gm-tier-row">{bayRow(ms)}</div>
          </section>
        ))}
        <div class="gm-ground" aria-hidden="true" />
      </div>
      {unplaced.length > 0 && (
        <section class="gm-unplaced" aria-label="Unplaced modules">
          <h2 class="gm-h3">Unplaced</h2>
          <p class="gm-quiet">New modules wait here until the admin gives them a tier.</p>
          <div class="gm-tier-row gm-tier-row-left">{bayRow(unplaced)}</div>
        </section>
      )}
      {mode === 'connections' && p.conns && p.byId && (
        <Lines wrap={wrap} conns={p.conns} byId={p.byId} selected={p.selectedConn ?? null} onPick={p.onPickConn!} />
      )}
    </div>
  );
}

interface Seg {
  c: Connection;
  d: string;
  eff: Eff;
  lx: number;
  ly: number;
}
/** Orthogonal lines between bays, measured from the DOM. No routing library. */
function Lines({
  wrap,
  conns,
  byId,
  selected,
  onPick,
}: {
  wrap: { current: HTMLDivElement | null };
  conns: Connection[];
  byId: Map<string, Module>;
  selected: string | null;
  onPick: (c: Connection) => void;
}) {
  const [segs, setSegs] = useState<Seg[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const rect = (id: string) => {
        const b = el.querySelector(`[data-bay="${id}"]`)?.getBoundingClientRect();
        return b
          ? {
              l: b.left - base.left,
              r: b.right - base.left,
              t: b.top - base.top,
              b: b.bottom - base.top,
              cx: b.left - base.left + b.width / 2,
              cy: b.top - base.top + b.height / 2,
            }
          : null;
      };
      const out: Seg[] = [];
      const lanes = new Map<string, number>();
      for (const c of conns) {
        const a = rect(c.aId),
          b = rect(c.bId);
        if (!a || !b) continue;
        const eff = effective(c, byId.get(c.aId), byId.get(c.bId));
        let d: string, lx: number, ly: number;
        if (Math.abs(a.cy - b.cy) < 4) {
          // same tier: short elbow beneath the row
          const key = `row${Math.round(a.b)}`;
          const lane = (lanes.get(key) ?? 0) + 1;
          lanes.set(key, lane);
          const y = a.b + 6 + lane * 5;
          const x1 = a.cx + (b.cx > a.cx ? 10 : -10),
            x2 = b.cx + (b.cx > a.cx ? -10 : 10);
          d = `M${x1} ${a.b} V${y} H${x2} V${b.b + 1}`;
          lx = (x1 + x2) / 2;
          ly = y;
        } else {
          // different tiers: leave from the side, elbow through the gutter between tiers
          const up = b.cy < a.cy;
          const sx = b.cx >= a.cx ? a.r : a.l;
          const ex = b.cx;
          const key = `gut${Math.round(up ? a.t : a.b)}`;
          const lane = (lanes.get(key) ?? 0) + 1;
          lanes.set(key, lane);
          const gy = up ? Math.min(a.t, b.b + 4) + 0 : Math.max(a.b, b.t - 4);
          const ey = up ? b.b + 1 : b.t - 1;
          const midY = up ? (b.b + a.t) / 2 + (lane - 1) * 4 : (a.b + b.t) / 2 + (lane - 1) * 4;
          void gy;
          d = `M${sx} ${a.cy} H${sx + (b.cx >= a.cx ? 8 : -8)} V${midY} H${ex} V${ey}`;
          lx = (sx + ex) / 2;
          ly = midY;
        }
        out.push({ c, d, eff, lx, ly });
      }
      setSegs(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [conns, byId]);
  const shown = segs.find((s) => s.c.id === (hover ?? selected));
  return (
    <svg class="gm-lines" width={size.w} height={size.h} aria-hidden="true">
      {segs.map((s) => (
        <g
          key={s.c.id}
          class={`gm-line gm-line-${s.eff.state} ${s.c.id === selected ? 'gm-line-on' : ''}`}
          onMouseEnter={() => setHover(s.c.id)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPick(s.c)}
          data-line={s.c.id}
        >
          <path d={s.d} class="gm-line-hit" />
          <path d={s.d} class="gm-line-path" marker-end="url(#gm-arrow)" pathLength={1} />
        </g>
      ))}
      {shown && (
        <g class="gm-line-label" data-label={shown.c.id}>
          <rect x={shown.lx - shown.c.slug.length * 4.6 - 8} y={shown.ly + 4} width={shown.c.slug.length * 9.2 + 16} height="24" rx="4" />
          <text x={shown.lx} y={shown.ly + 21} text-anchor="middle">
            {shown.c.slug}
          </text>
        </g>
      )}
    </svg>
  );
}
