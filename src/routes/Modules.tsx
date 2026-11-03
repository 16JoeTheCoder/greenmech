import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { live, liveConns, flagsByModule, byId, setStatus, takeModule, stepDown, createModule, slugTaken } from '../state/data';
import { user, canEdit, canPost, uiRole } from '../state/session';
import { STATUS, joinNames } from '../lib/status';
import { effective } from '../lib/connections';
import { slugError, SLUG_MAX, suggestSlug } from '../lib/slug';
import type { Module, Status } from '../lib/types';
import { Elevation, tiersOf } from '../components/Elevation';
import { Button, Icon, Sheet, Slug, StatusBadge, Stepper, Empty } from '../components/ui';
import { useTitle } from '../app';

export const useWide = () => {
  const q = '(min-width: 768px)';
  const [w, setW] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const h = () => setW(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return w;
};

export function Headline() {
  const ms = live.value;
  const building = ms.filter((m) => m.status === 2 || m.status === 1);
  const done = ms.filter((m) => m.status === 3).length;
  const flags = [...flagsByModule.value.entries()].filter(([id]) => byId.value.get(id) && !byId.value.get(id)!.deletedAt).reduce((a, [, n]) => a + n, 0);
  const unled = ms.filter((m) => !m.leaderUid).length;
  const names = building.slice(0, 4).map((m) => <Slug key={m.id}>{m.slug}</Slug>);
  const parts: (string | preact.JSX.Element)[] = [];
  names.forEach((n, i) => {
    parts.push(n);
    if (i < names.length - 2) parts.push(', ');
    else if (i === names.length - 2) parts.push(' and ');
  });
  return (
    <div class="gm-headline">
      <h1>
        {building.length === 0 ? (
          ms.length ? (
            done === ms.length ? (
              'Every module is done.'
            ) : (
              'Nothing is in development right now.'
            )
          ) : (
            'No modules yet.'
          )
        ) : (
          <>
            {parts}
            {building.length > 4 ? ` and ${building.length - 4} more` : ''} {building.length === 1 ? 'is' : 'are'} in development.
          </>
        )}
      </h1>
      {ms.length > 0 && (
        <p class="gm-quiet gm-tally" role="status">
          <span class="gm-done-count" data-done={done}>
            {done} of {ms.length} done
          </span>
          , {flags} open flag{flags === 1 ? '' : 's'}, {unled} without a leader
        </p>
      )}
    </div>
  );
}
void joinNames;

export function ModulesView() {
  useTitle('Modules');
  const wide = useWide();
  const [drawing, setDrawing] = useState(false);
  const [filter, setFilter] = useState<Status | 'mine' | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const ms = live.value;
  const selM = sel ? byId.value.get(sel) : undefined;
  const uid = user.value!.uid;
  const isMatch = filter === null ? undefined : (m: Module) => (filter === 'mine' ? m.leaderUid === uid : m.status === filter);
  const showDrawing = wide || drawing;
  return (
    <div class="gm-page">
      <Headline />
      {ms.length === 0 ? (
        <Empty>
          <p>
            No modules yet.{' '}
            {uiRole.value === 'admin' ? (
              <>
                Import the sample structure in <Link href="/manage">Manage, Data</Link>, or add a module.
              </>
            ) : (
              'Add the first module, or ask the admin to import the sample structure.'
            )}
          </p>
          {canEdit.value && <AddModule onDone={() => setAdding(false)} />}
        </Empty>
      ) : (
        <>
          <div class="gm-toolbar">
            <Legend filter={filter} setFilter={setFilter} />
            <div class="gm-toolbar-end">
              {!wide && (
                <Button icon={drawing ? 'list' : 'layout-grid'} aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
                  {drawing ? 'List' : 'Drawing'}
                </Button>
              )}
              {canEdit.value && !adding && (
                <Button icon="plus" onClick={() => setAdding(true)}>
                  Add module
                </Button>
              )}
            </div>
          </div>
          {adding && <AddModule onDone={() => setAdding(false)} />}
          <div class={`gm-split ${selM ? 'gm-split-open' : ''}`}>
            {showDrawing ? (
              <div class={wide ? '' : 'gm-hscroll'}>
                {!wide && <p class="gm-quiet gm-hint">Scroll sideways to see all tiers</p>}
                <div class={wide ? '' : 'gm-hscroll-inner'}>
                  <Elevation modules={ms} flags={flagsByModule.value} onPick={(m) => setSel(m.id === sel ? null : m.id)} selectedId={sel} isMatch={isMatch} />
                </div>
              </div>
            ) : (
              <ModuleList ms={ms} isMatch={isMatch} onPick={(m) => setSel(m.id)} />
            )}
            {selM && <ModuleSheet m={selM} onClose={() => setSel(null)} />}
          </div>
          <AttentionBand />
        </>
      )}
    </div>
  );
}

function Legend({ filter, setFilter }: { filter: Status | 'mine' | null; setFilter: (f: Status | 'mine' | null) => void }) {
  return (
    <div class="gm-legend" role="group" aria-label="Filter by status">
      {STATUS.map((s, i) => (
        <button
          key={s.key}
          type="button"
          class={`gm-chip gm-legend-${s.key}`}
          aria-pressed={filter === i}
          onClick={() => setFilter(filter === i ? null : (i as Status))}
        >
          <span class={`gm-swatch gm-swatch-${s.key}`} aria-hidden="true" />
          <Icon name={s.icon} />
          {s.word}
        </button>
      ))}
      {canPost.value && (
        <button type="button" class="gm-chip" aria-pressed={filter === 'mine'} onClick={() => setFilter(filter === 'mine' ? null : 'mine')}>
          <Icon name="user" />
          Mine
        </button>
      )}
    </div>
  );
}

function ModuleList({ ms, isMatch, onPick }: { ms: Module[]; isMatch?: (m: Module) => boolean; onPick: (m: Module) => void }) {
  const { tiers, unplaced } = tiersOf(ms);
  const groups = [...tiers.map((t) => ({ name: `Tier ${t.tier + 1}`, ms: t.ms })), ...(unplaced.length ? [{ name: 'Unplaced', ms: unplaced }] : [])];
  const flags = flagsByModule.value;
  return (
    <div class="gm-list">
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h2 class="gm-h3">{g.name}</h2>
          <ul>
            {g.ms.map((m) => (
              <li key={m.id}>
                <button type="button" class={`gm-row ${isMatch && !isMatch(m) ? 'gm-row-dim' : ''}`} onClick={() => onPick(m)} data-row={m.id}>
                  <Slug>{m.slug}</Slug>
                  <StatusBadge status={m.status} />
                  {m.leaderInitials ? <span class="gm-initials">{m.leaderInitials}</span> : <span class="gm-sr">no leader</span>}
                  {(flags.get(m.id) ?? 0) > 0 && <span class="gm-dot" aria-label={`${flags.get(m.id)} open flags`} role="img" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function LeaderControl({ m }: { m: Module }) {
  const uid = user.value!.uid;
  if (m.leaderUid === uid && canPost.value)
    return (
      <Button icon="user-minus" onClick={() => stepDown(m.id)}>
        Step down
      </Button>
    );
  if (!m.leaderUid && canPost.value)
    return (
      <Button variant="primary" icon="user" onClick={() => takeModule(m.id)}>
        Take it
      </Button>
    );
  return (
    <span>
      {m.leaderInitials ? (
        <>
          Led by <span class="gm-initials">{m.leaderInitials}</span>
        </>
      ) : (
        'No leader yet'
      )}
    </span>
  );
}

function ModuleSheet({ m, onClose }: { m: Module; onClose: () => void }) {
  const [, nav] = useLocation();
  const leads = m.leaderUid === user.value!.uid && canPost.value;
  const nflags = flagsByModule.value.get(m.id) ?? 0;
  return (
    <Sheet title={<Slug>{m.slug}</Slug>} onClose={onClose}>
      <Button variant="primary" icon="arrow-right" onClick={() => nav(`/m/${m.slug}`)}>
        Open full page
      </Button>
      <div class="gm-field">
        <span class="gm-label-text">Status</span>
        {leads ? <Stepper value={m.status} onChange={(s) => setStatus(m.id, s)} /> : <StatusBadge status={m.status} />}
        {!leads && canPost.value && <span class="gm-quiet">Only the leader changes status.</span>}
      </div>
      <div class="gm-field">
        <span class="gm-label-text">Leader</span>
        <LeaderControl m={m} />
      </div>
      <div class="gm-field">
        <span class="gm-label-text">Purpose</span>
        <p>{m.purpose || <span class="gm-quiet">Not written yet.</span>}</p>
      </div>
      <div class="gm-field">
        <span class="gm-label-text">Flags</span>
        <p>{nflags ? `${nflags} open` : 'None open'}</p>
      </div>
    </Sheet>
  );
}

function AddModule({ onDone }: { onDone: () => void }) {
  const [slug, setSlug] = useState('');
  const [purpose, setPurpose] = useState('');
  const [touched, setTouched] = useState(false);
  const [, nav] = useLocation();
  const err = slugError(slug, slugTaken);
  const submit = (e: Event) => {
    e.preventDefault();
    setTouched(true);
    if (err) return;
    createModule(slug, purpose.trim());
    onDone();
    void nav;
  };
  return (
    <form
      class="gm-addmodule"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <label class="gm-label">
        Name
        <input
          class="gm-input gm-mono"
          autoFocus
          value={slug}
          maxLength={SLUG_MAX}
          placeholder="solar-updraft"
          aria-invalid={touched && !!err}
          aria-describedby="gm-add-err gm-add-count"
          onInput={(e) => setSlug(e.currentTarget.value.toLowerCase().replace(/\s+/g, '-'))}
        />
      </label>
      <span id="gm-add-count" class="gm-counter">
        {slug.length} of {SLUG_MAX}
      </span>
      <label class="gm-label gm-grow">
        Purpose, one sentence
        <input
          class="gm-input"
          value={purpose}
          maxLength={200}
          placeholder="Hot air turns a fan that pushes the ball on"
          onInput={(e) => {
            setPurpose(e.currentTarget.value);
            if (!slug) setSlug(suggestSlug(e.currentTarget.value));
          }}
        />
      </label>
      <Button type="submit" variant="primary" icon="plus">
        Add module
      </Button>
      <Button variant="quiet" onClick={onDone}>
        Cancel
      </Button>
      <p id="gm-add-err" class="gm-error" role="alert">
        {touched && err ? err : ''}
      </p>
    </form>
  );
}

function AttentionBand() {
  const [, nav] = useLocation();
  const ms = live.value;
  const rows: preact.JSX.Element[] = [];
  const unled = ms.find((m) => !m.leaderUid && m.tier >= 0) ?? ms.find((m) => !m.leaderUid);
  if (unled)
    rows.push(
      <li key="u">
        <span>
          <Slug>{unled.slug}</Slug> has no leader.
        </span>
        {canPost.value && (
          <Button onClick={() => takeModule(unled.id)} icon="user">
            Take it
          </Button>
        )}
      </li>,
    );
  const ready = liveConns.value.find((c) => effective(c, byId.value.get(c.aId), byId.value.get(c.bId)).state === 'ready');
  if (ready)
    rows.push(
      <li key="r">
        <span>
          <Slug>{ready.slug}</Slug> is ready to connect.
        </span>
        <Button icon="player-play" onClick={() => nav(`/c/${ready.slug}`)}>
          Open
        </Button>
      </li>,
    );
  const flagged = [...flagsByModule.value.entries()].map(([id, n]) => ({ m: byId.value.get(id), n })).find((x) => x.m && !x.m.deletedAt);
  if (flagged?.m)
    rows.push(
      <li key="f">
        <span>
          <Slug>{flagged.m.slug}</Slug> has {flagged.n} open flag{flagged.n > 1 ? 's' : ''}.
        </span>
        <Button icon="flag" onClick={() => nav(`/m/${flagged.m!.slug}#discussion`)}>
          Review
        </Button>
      </li>,
    );
  if (!rows.length) return null;
  return (
    <section class="gm-band" aria-label="Needs attention">
      <h2 class="gm-sr">Needs attention</h2>
      <ul>{rows}</ul>
    </section>
  );
}
