import type { ComponentChildren, ButtonHTMLAttributes } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ICONS } from '../icons/icons';
import { STATUS } from '../lib/status';
import { CONN_META, type Eff } from '../lib/connections';
import type { Block, Inline } from '../lib/markdown';
import type { Status } from '../lib/types';

export function Icon({ name, label }: { name: string; label?: string }) {
  const parts = ICONS[name] ?? [];
  return (
    <svg class="gm-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      {parts.map((p, i) => {
        const Tag = p.tag as 'path';
        return <Tag key={i} {...(p.a as Record<string, string>)} />;
      })}
    </svg>
  );
}

export const Slug = ({ children }: { children: ComponentChildren }) => <span class="gm-slug">{children}</span>;

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span class={`gm-badge gm-badge-${s.key}`}>
      <Icon name={s.icon} />
      {s.word}
    </span>
  );
}

export function ConnBadge({ eff }: { eff: Eff }) {
  const m = CONN_META[eff.state];
  const was = eff.state === 'locked' && eff.wasStored > 1 ? (eff.wasStored === 3 ? ' (was connected)' : ' (was in progress)') : '';
  return (
    <span class="gm-conn-badges">
      <span class={`gm-badge gm-cstate-${eff.state}`}>
        <Icon name={m.icon} />
        {m.word}
        {was}
      </span>
      {eff.adapter && (
        <span class="gm-badge gm-adapter">
          <Icon name="alert-triangle" />
          Adapter needed
        </span>
      )}
    </span>
  );
}

export function Button(p: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; variant?: 'primary' | 'quiet' | 'danger' }) {
  const { icon, variant, children, class: cls, ...rest } = p;
  return (
    <button type="button" class={`gm-btn ${variant ? `gm-btn-${variant}` : ''} ${cls ?? ''}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, disabled }: { value: Status; onChange: (s: Status) => void; disabled?: boolean }) {
  return (
    <div class="gm-stepper" role="radiogroup" aria-label="Status">
      {STATUS.map((s, i) => (
        <button key={s.key} type="button" role="radio" aria-checked={value === i} disabled={disabled}
          class={`gm-step ${value === i ? 'gm-step-on' : ''}`} onClick={() => onChange(i as Status)}>
          <Icon name={s.icon} />
          {s.word}
        </button>
      ))}
    </div>
  );
}

/** Text input that adds on Enter. */
export function AddLine({ label, placeholder, max, onAdd }: { label: string; placeholder: string; max: number; onAdd: (t: string) => void }) {
  const [v, setV] = useState('');
  const submit = (e: Event) => {
    e.preventDefault();
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV('');
  };
  return (
    <form class="gm-addline" onSubmit={submit}>
      <label class="gm-label">
        {label}
        <input class="gm-input" value={v} maxLength={max} placeholder={placeholder} onInput={(e) => setV(e.currentTarget.value)} />
      </label>
      <Button type="submit" icon="plus">Add</Button>
      {v.length > max * 0.8 && <span class="gm-counter">{v.length} of {max}</span>}
    </form>
  );
}

function renderInline(c: Inline[]): ComponentChildren {
  return c.map((n, i) =>
    n.t === 'text' ? n.v
      : n.t === 'b' ? <strong key={i}>{renderInline(n.c)}</strong>
        : n.t === 'i' ? <em key={i}>{renderInline(n.c)}</em>
          : <a key={i} href={n.href} rel="noopener noreferrer" target="_blank">{renderInline(n.c)}</a>,
  );
}
export function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <div class="gm-prose">
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i}>{renderInline(b.c)}</p>;
        if (b.t === 'h') { const H = `h${b.level + 1}` as 'h3'; return <H key={i}>{renderInline(b.c)}</H>; }
        const L = b.t;
        return <L key={i}>{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</L>;
      })}
    </div>
  );
}

/** Shows user SVG without injecting it: a mask over currentColor, so line art follows the theme. */
export function VectorView({ svg, label, class: cls }: { svg: string; label: string; class?: string }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);
  return <div class={`gm-vector ${cls ?? ''}`} role="img" aria-label={label} style={url ? { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` } : undefined} />;
}

export function Sheet({ title, onClose, children }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('h2')?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <aside class="gm-sheet" ref={ref} aria-label="Module details" data-sheet>
      <div class="gm-sheet-head">
        <h2 tabIndex={-1}>{title}</h2>
        <Button variant="quiet" icon="x" aria-label="Close details" onClick={onClose} class="gm-iconbtn" data-sheet-close />
      </div>
      {children}
    </aside>
  );
}

export const Empty = ({ children }: { children: ComponentChildren }) => <div class="gm-empty">{children}</div>;
