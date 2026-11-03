import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../state/firebase';
import { live, liveConns, byId, connBySlug, connections, flagsByModule, createConnection, setConnState, softDelete, slugTaken } from '../state/data';
import { user, canPost, isAdmin, uiRole } from '../state/session';
import { effective, CONN_META, pairId, type Eff } from '../lib/connections';
import { STATUS } from '../lib/status';
import { slugError, suggestSlug, uniqueSlug, SLUG_MAX } from '../lib/slug';
import type { Connection, Module } from '../lib/types';
import { Elevation } from '../components/Elevation';
import { Button, ConnBadge, Empty, Slug } from '../components/ui';
import { SlugEditor } from './ModulePage';
import { useWide } from './Modules';
import { NotFound, useTitle } from '../app';

const effOf = (c: Connection) => effective(c, byId.value.get(c.aId), byId.value.get(c.bId));

export default function ConnectionsView({ slug }: { slug?: string }) {
  useTitle(slug ?? 'Connections');
  const [, nav] = useLocation();
  const wide = useWide();
  const [linking, setLinking] = useState<{ a: string | null } | null>(null);
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'missing'>('idle');
  const sel = slug ? connBySlug.value.get(slug) : undefined;
  useEffect(() => {
    if (!slug || sel) return setLookup('idle');
    getDoc(doc(db, 'slugs', slug))
      .then((s) => {
        const c = s.exists() ? connections.value.find((x) => x.id === s.data().refId) : undefined;
        if (c && !c.deletedAt) nav(`/c/${c.slug}`, { replace: true });
        else setLookup('missing');
      })
      .catch(() => setLookup('missing'));
  }, [slug, !!sel]);
  if (slug && !sel && lookup === 'missing') return <NotFound what="connection" />;

  const cs = liveConns.value;
  const sorted = [...cs].sort((x, y) => CONN_META[effOf(x).state].rank - CONN_META[effOf(y).state].rank || x.slug.localeCompare(y.slug));
  const pick = (m: Module) => {
    if (linking) {
      if (!linking.a) setLinking({ a: m.id });
      else if (linking.a !== m.id) {
        setPair({ a: linking.a, b: m.id });
        setLinking(null);
      }
      return;
    }
    nav(`/m/${m.slug}`);
  };
  const hint = linking ? (m: Module) => (!linking.a ? 'Pick as the start' : linking.a === m.id ? 'Start, picked' : 'Pick as the end') : undefined;
  return (
    <div class="gm-page">
      <div class="gm-titlerow">
        <h1>
          {sel ? (
            <>
              Connection <Slug>{sel.slug}</Slug>
            </>
          ) : (
            'Connections'
          )}
        </h1>
        {canPost.value && !linking && !pair && (
          <Button icon="link" onClick={() => setLinking({ a: null })}>
            Link modules
          </Button>
        )}
      </div>
      <p class="gm-quiet gm-measure">
        A connection is where one module feeds the next. It can be worked on once both modules are Done; until then it shows as Locked.
      </p>
      {linking && (
        <div class="gm-linkbar" role="status">
          <span>
            {!linking.a ? (
              'Pick the module that sends (A), on the drawing or below.'
            ) : (
              <>
                Now pick the module <Slug>{byId.value.get(linking.a)!.slug}</Slug> feeds (B).
              </>
            )}
          </span>
          <Button variant="quiet" onClick={() => setLinking(null)}>
            Cancel
          </Button>
        </div>
      )}
      {(linking || pair) && (
        <PairForm
          initial={pair}
          onCancel={() => {
            setPair(null);
            setLinking(null);
          }}
          onDone={(s) => {
            setPair(null);
            setLinking(null);
            nav(`/c/${s}`);
          }}
        />
      )}
      {live.value.length === 0 ? (
        <Empty>
          <p>No modules yet, so nothing to connect.</p>
        </Empty>
      ) : (
        <div class="gm-conn-layout">
          {wide && (
            <Elevation
              modules={live.value}
              flags={flagsByModule.value}
              onPick={pick}
              mode="connections"
              conns={cs}
              byId={byId.value}
              selectedConn={sel?.id ?? null}
              onPickConn={(c) => nav(`/c/${c.slug}`)}
              selectedId={linking?.a ?? null}
              pickHint={hint}
            />
          )}
          <aside class="gm-conn-side">
            {sel && <Detail c={sel} />}
            <h2 class="gm-h3">All connections</h2>
            {sorted.length === 0 ? (
              <p class="gm-quiet">No connections yet. Link two modules to plan how the ball travels.</p>
            ) : (
              <ul class="gm-connlist">
                {sorted.map((c) => {
                  const e = effOf(c);
                  return (
                    <li key={c.id} class={c.id === sel?.id ? 'gm-connlist-on' : ''}>
                      <Link href={`/c/${c.slug}`} class="gm-connrow" aria-current={c.id === sel?.id ? 'true' : undefined}>
                        <span class="gm-slug">{c.slug}</span>
                        <span class="gm-quiet">
                          <span class="gm-mono">{byId.value.get(c.aId)?.slug}</span> to <span class="gm-mono">{byId.value.get(c.bId)?.slug}</span>
                        </span>
                        <ConnBadge eff={e} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function WaitText({ e }: { e: Eff }) {
  if (e.state !== 'locked') return null;
  return (
    <p>
      Waiting for{' '}
      {e.waitingFor.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ' and '}
          <Link href={`/m/${m.slug}`} class="gm-slug">
            {m.slug}
          </Link>{' '}
          (now {STATUS[m.status].word}) to be Done
        </span>
      ))}
      .
    </p>
  );
}

function Detail({ c }: { c: Connection }) {
  const a = byId.value.get(c.aId)!,
    b = byId.value.get(c.bId)!;
  const e = effOf(c);
  const uid = user.value!.uid;
  const admin = isAdmin.value && uiRole.value === 'admin';
  const may = admin || (canPost.value && (a.leaderUid === uid || b.leaderUid === uid));
  return (
    <section class="gm-detail" aria-label={`Connection ${c.slug}`}>
      {may ? <SlugEditor kind="connection" id={c.id} slug={c.slug} label="connection" /> : null}
      <p class="gm-ends">
        <Link href={`/m/${a.slug}`} class="gm-chiplink">
          <span class="gm-slug">{a.slug}</span>
          <span class="gm-quiet">sends {a.ports.out}</span>
        </Link>
        <span aria-hidden="true">feeds</span>
        <span class="gm-sr">feeds</span>
        <Link href={`/m/${b.slug}`} class="gm-chiplink">
          <span class="gm-slug">{b.slug}</span>
          <span class="gm-quiet">takes {b.ports.in}</span>
        </Link>
      </p>
      <ConnBadge eff={e} />
      <WaitText e={e} />
      {e.adapter && (
        <p>
          {a.slug} sends {a.ports.out} but {b.slug} takes {b.ports.in}. Plan an adapter between them.
        </p>
      )}
      {may && e.state === 'ready' && (
        <Button variant="primary" icon="player-play" onClick={() => setConnState(c.id, 2)}>
          Start connecting
        </Button>
      )}
      {may && e.state === 'progress' && (
        <Button variant="primary" icon="check" onClick={() => setConnState(c.id, 3)}>
          Mark connected
        </Button>
      )}
      {may && (e.state === 'connected' || e.state === 'progress') && (
        <Button icon="refresh" onClick={() => setConnState(c.id, 1)}>
          Reopen
        </Button>
      )}
      {!may && canPost.value && (
        <p class="gm-quiet">
          The leaders of <span class="gm-slug">{a.slug}</span> and <span class="gm-slug">{b.slug}</span> move this connection along.
        </p>
      )}
      {admin && (
        <Button variant="danger" icon="trash" onClick={() => softDelete('connection', c.id)}>
          Remove connection
        </Button>
      )}
    </section>
  );
}

function PairForm({ initial, onCancel, onDone }: { initial: { a: string; b: string } | null; onCancel: () => void; onDone: (slug: string) => void }) {
  const ms = [...live.value].sort((x, y) => x.slug.localeCompare(y.slug));
  const [a, setA] = useState(initial?.a ?? '');
  const [b, setB] = useState(initial?.b ?? '');
  const autoSlug = (x: string, y: string) => {
    const ma = byId.value.get(x),
      mb = byId.value.get(y);
    return ma && mb ? uniqueSlug(`${suggestSlug(ma.slug, 1)}-${suggestSlug(mb.slug.split('-').pop()!, 1)}`, slugTaken) : '';
  };
  const [slug, setSlug] = useState(initial ? autoSlug(initial.a, initial.b) : '');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (initial) {
      setA(initial.a);
      setB(initial.b);
      if (!dirty) setSlug(autoSlug(initial.a, initial.b));
    }
  }, [initial?.a, initial?.b]);
  useEffect(() => {
    if (!dirty && a && b) setSlug(autoSlug(a, b));
  }, [a, b]);
  const exists = a && b && connections.value.some((c) => c.id === pairId(a, b));
  const err =
    !a || !b
      ? 'Pick both modules.'
      : a === b
        ? 'A module cannot feed itself.'
        : exists
          ? 'These two are already linked in this direction.'
          : slugError(slug, slugTaken);
  return (
    <form
      class="gm-pairform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!err) {
          createConnection(a, b, slug);
          onDone(slug);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <label class="gm-label">
        From (A)
        <select class="gm-input gm-mono gm-select" value={a} onChange={(e) => setA(e.currentTarget.value)}>
          <option value="">Choose</option>
          {ms.map((m) => (
            <option key={m.id} value={m.id}>
              {m.slug}
            </option>
          ))}
        </select>
      </label>
      <label class="gm-label">
        Feeds (B)
        <select class="gm-input gm-mono gm-select" value={b} onChange={(e) => setB(e.currentTarget.value)}>
          <option value="">Choose</option>
          {ms.map((m) => (
            <option key={m.id} value={m.id}>
              {m.slug}
            </option>
          ))}
        </select>
      </label>
      <label class="gm-label">
        Name
        <input
          class="gm-input gm-mono"
          value={slug}
          maxLength={SLUG_MAX}
          placeholder="ramp-feed"
          onInput={(e) => {
            setDirty(true);
            setSlug(e.currentTarget.value.toLowerCase().replace(/\s+/g, '-'));
          }}
        />
      </label>
      <span class="gm-counter">
        {slug.length} of {SLUG_MAX}
      </span>
      <Button type="submit" variant="primary" disabled={!!err}>
        Create connection
      </Button>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
      <p class="gm-quiet" role="status">
        {a && b ? (err ?? 'Ready to create.') : ''}
      </p>
    </form>
  );
}
