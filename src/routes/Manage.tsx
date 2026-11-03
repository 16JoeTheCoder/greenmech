import { useEffect, useState } from 'preact/hooks';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../state/firebase';
import { modules, connections, byId, config, assignLeader, softDelete, updateModule, toast, act, audit, me, rename } from '../state/data';
import { user } from '../state/session';
import sample from '../seed/sample.json';
import { ago, daysSince } from '../lib/time';
import { STATUS } from '../lib/status';
import { slugError, SLUG_MAX } from '../lib/slug';
import type { Activity, Module } from '../lib/types';
import { Button, Slug, StatusBadge } from '../components/ui';
import { useTitle } from '../app';

const TABS = ['Team', 'Structure', 'Activity', 'Data'] as const;
type Tab = (typeof TABS)[number];

export default function Manage() {
  useTitle('Manage');
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => `#${t.toLowerCase()}` === location.hash) ?? 'Team');
  const backupDays = config.value.lastBackupAt ? daysSince(config.value.lastBackupAt) : null;
  return (
    <div class="gm-page">
      <h1>Manage</h1>
      {(backupDays === null || backupDays > 30) && modules.value.length > 0 && (
        <p class="gm-banner" role="status">
          {backupDays === null ? 'No backup yet.' : `Last backup ${Math.floor(backupDays)} days ago.`} Export one in Data.
        </p>
      )}
      <div
        role="tablist"
        aria-label="Manage sections"
        class="gm-tabs"
        onKeyDown={(e) => {
          const i = TABS.indexOf(tab);
          const n = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : -1;
          if (n >= 0) {
            setTab(TABS[n]);
            (document.getElementById(`tab-${TABS[n]}`) as HTMLElement)?.focus();
          }
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            aria-controls={`panel-${t}`}
            class={`gm-tab ${tab === t ? 'gm-tab-on' : ''}`}
            onClick={() => {
              setTab(t);
              history.replaceState(null, '', `#${t.toLowerCase()}`);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} class="gm-tabpanel">
        {tab === 'Team' && <Team />}
        {tab === 'Structure' && <Structure />}
        {tab === 'Activity' && <ActivityLog />}
        {tab === 'Data' && <Data />}
      </div>
    </div>
  );
}

interface Entry {
  email: string;
  role: 'member' | 'coach';
  initials: string;
}
interface Req {
  uid: string;
  email: string;
  displayName: string;
}
function Team() {
  const [list, setList] = useState<Entry[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'coach'>('member');
  const [ini, setIni] = useState('');
  const [err, setErr] = useState('');
  const [reqIni, setReqIni] = useState<Record<string, string>>({});
  const load = () => {
    getDocs(collection(db, 'allowlist')).then((s) => setList(s.docs.map((d) => ({ email: d.id, ...d.data() }) as Entry)));
    getDocs(collection(db, 'accessRequests')).then((s) => setReqs(s.docs.map((d) => ({ uid: d.id, ...d.data() }) as Req)));
  };
  useEffect(load, []);
  const put = async (e: string, r: 'member' | 'coach', i: string) => {
    const b = writeBatch(db);
    b.set(doc(db, 'allowlist', e.toLowerCase()), { role: r, initials: i, addedBy: me(), addedAt: serverTimestamp() });
    act(b, 'team', 'team', 'allowlist', null, `added ${i} as ${r}`);
    await b.commit();
  };
  const add = async (ev: Event) => {
    ev.preventDefault();
    const e = email.trim().toLowerCase(),
      i = ini.trim().toUpperCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setErr('Enter a full email address, like ayu@gmail.com.');
    if (!/^[A-Z0-9]{1,3}$/.test(i)) return setErr('Initials are 1 to 3 letters or numbers, like P3.');
    if (list.some((x) => x.initials === i && x.email !== e)) return setErr(`${i} is already used. Initials must be unique.`);
    setErr('');
    try {
      await put(e, role, i);
      setEmail('');
      setIni('');
      load();
      toast(`Added ${i}.`);
    } catch (x) {
      setErr(`Not added: ${(x as Error).message}`);
    }
  };
  const approve = async (r: Req, as: 'member' | 'coach', i: string) => {
    if (!/^[A-Z0-9]{1,3}$/.test(i)) return toast('Give initials first: 1 to 3 letters or numbers, like P3.', undefined, 'error');
    if (list.some((x) => x.initials === i)) return toast(`${i} is already used. Initials must be unique.`, undefined, 'error');
    await put(r.email, as, i);
    await deleteDoc(doc(db, 'accessRequests', r.uid));
    load();
    toast(`Approved ${r.displayName} as ${as}.`);
  };
  return (
    <>
      <section class="gm-section" aria-labelledby="req-h">
        <h2 id="req-h">Access requests</h2>
        {reqs.length === 0 ? (
          <p class="gm-quiet">No pending requests.</p>
        ) : (
          <ul class="gm-entries">
            {reqs.map((r) => (
              <li key={r.uid}>
                <span class="gm-entry-text">
                  {r.displayName} <span class="gm-quiet gm-mono">{r.email}</span>
                </span>
                <label class="gm-label">
                  Initials
                  <input
                    class="gm-input gm-short"
                    maxLength={3}
                    placeholder="P4"
                    value={reqIni[r.uid] ?? ''}
                    onInput={(e) => setReqIni({ ...reqIni, [r.uid]: e.currentTarget.value.toUpperCase() })}
                  />
                </label>
                <Button onClick={() => approve(r, 'member', reqIni[r.uid] ?? '')}>Approve as member</Button>
                <Button onClick={() => approve(r, 'coach', reqIni[r.uid] ?? '')}>Approve as coach</Button>
                <Button
                  variant="quiet"
                  onClick={async () => {
                    await deleteDoc(doc(db, 'accessRequests', r.uid));
                    load();
                    toast('Request denied.');
                  }}
                >
                  Deny
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section class="gm-section" aria-labelledby="team-h">
        <h2 id="team-h">Team list</h2>
        {list.length === 0 && <p class="gm-quiet">Add your first teammate.</p>}
        <table class="gm-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Initials</th>
              <th scope="col">Role</th>
              <th scope="col">
                <span class="gm-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.email}>
                <td class="gm-mono">{x.email}</td>
                <td>{x.initials}</td>
                <td>
                  <select
                    class="gm-input gm-select"
                    aria-label={`Role for ${x.initials}`}
                    value={x.role}
                    onChange={async (e) => {
                      await put(x.email, e.currentTarget.value as 'member', x.initials);
                      load();
                    }}
                  >
                    <option value="member">member</option>
                    <option value="coach">coach</option>
                  </select>
                </td>
                <td>
                  <Button
                    variant="quiet"
                    icon="trash"
                    onClick={async () => {
                      await deleteDoc(doc(db, 'allowlist', x.email));
                      load();
                      toast(`Removed ${x.initials}.`);
                    }}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form class="gm-addline" onSubmit={add}>
          <label class="gm-label gm-grow">
            Email
            <input class="gm-input" type="email" value={email} placeholder="ayu@gmail.com" onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label class="gm-label">
            Initials
            <input class="gm-input gm-short" value={ini} maxLength={3} placeholder="P3" onInput={(e) => setIni(e.currentTarget.value)} />
          </label>
          <label class="gm-label">
            Role
            <select class="gm-input gm-select" value={role} onChange={(e) => setRole(e.currentTarget.value as 'member')}>
              <option value="member">member</option>
              <option value="coach">coach</option>
            </select>
          </label>
          <Button type="submit" variant="primary" icon="plus">
            Add to team
          </Button>
        </form>
        {err && (
          <p class="gm-error" role="alert">
            {err}
          </p>
        )}
        <p class="gm-quiet">Leaders can be any member. Admins who also want to lead or post need their own member entry here.</p>
      </section>
      <LeaderAssign list={list} />
    </>
  );
}

function LeaderAssign({ list }: { list: Entry[] }) {
  const [uids, setUids] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    // uid per initials is learned from activity: a member appears once they have acted at least once
    getDocs(query(collection(db, 'activity'), orderBy('at', 'desc'), limit(200))).then((s) => {
      const m = new Map<string, string>();
      s.docs.forEach((d) => {
        const a = d.data() as Activity;
        if (!m.has(a.actorInitials)) m.set(a.actorInitials, a.actorUid);
      });
      modules.value.forEach((x) => x.leaderInitials && x.leaderUid && m.set(x.leaderInitials, x.leaderUid));
      setUids(m);
    });
  }, []);
  const members = list.filter((x) => x.role === 'member');
  return (
    <section class="gm-section" aria-labelledby="lead-h">
      <h2 id="lead-h">Leaders</h2>
      <p class="gm-quiet gm-measure">
        Reassign a module to any member. A member shows here once they have signed in and done something in the app, because the app only learns their account
        id then.
      </p>
      <table class="gm-table">
        <thead>
          <tr>
            <th scope="col">Module</th>
            <th scope="col">Leader</th>
          </tr>
        </thead>
        <tbody>
          {modules.value
            .filter((m) => !m.deletedAt)
            .sort((a, b) => a.slug.localeCompare(b.slug))
            .map((m) => (
              <tr key={m.id}>
                <td>
                  <Slug>{m.slug}</Slug>
                </td>
                <td>
                  <select
                    class="gm-input gm-select"
                    aria-label={`Leader of ${m.slug}`}
                    value={m.leaderInitials ?? ''}
                    onChange={(e) => {
                      const i = e.currentTarget.value;
                      assignLeader(m.id, i ? uids.get(i)! : null, i || null);
                    }}
                  >
                    <option value="">No leader</option>
                    {members
                      .filter((x) => uids.has(x.initials) || x.initials === m.leaderInitials)
                      .map((x) => (
                        <option key={x.email} value={x.initials}>
                          {x.initials}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

function Structure() {
  const ms = modules.value.filter((m) => !m.deletedAt);
  const tiers = Math.max(3, ...ms.map((m) => m.tier + 2));
  const sorted = [...ms].sort((a, b) => b.tier - a.tier || a.order - b.order || a.slug.localeCompare(b.slug));
  const move = (m: Module, dir: -1 | 1) => {
    const peers = sorted.filter((x) => x.tier === m.tier).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    const i = peers.findIndex((x) => x.id === m.id),
      j = i + dir;
    if (j < 0 || j >= peers.length) return;
    peers.forEach((p, k) => {
      const want = k === i ? j : k === j ? i : k;
      if (p.order !== want) updateModule(p.id, { order: want }, `moved ${p.slug} in tier ${p.tier + 1}`, false);
    });
  };
  const deleted = [...modules.value.filter((m) => m.deletedAt), ...connections.value.filter((c) => c.deletedAt)];
  return (
    <>
      <section class="gm-section" aria-labelledby="mods-h">
        <h2 id="mods-h">Modules</h2>
        <table class="gm-table">
          <thead>
            <tr>
              <th scope="col">Module</th>
              <th scope="col">Status</th>
              <th scope="col">Tier</th>
              <th scope="col">Order</th>
              <th scope="col">
                <span class="gm-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.id}>
                <td>
                  <RenameCell kind="module" id={m.id} slug={m.slug} />
                </td>
                <td>
                  <StatusBadge status={m.status} />
                </td>
                <td>
                  <select
                    class="gm-input gm-select"
                    aria-label={`Tier for ${m.slug}`}
                    value={m.tier}
                    onChange={(e) =>
                      updateModule(m.id, { tier: Number(e.currentTarget.value), order: 99 }, `placed ${m.slug} in tier ${Number(e.currentTarget.value) + 1}`)
                    }
                  >
                    <option value={-1}>Unplaced</option>
                    {Array.from({ length: tiers }, (_, t) => (
                      <option key={t} value={t}>
                        Tier {t + 1}
                        {t === 0 ? ' (bottom)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td class="gm-nowrap">
                  <Button variant="quiet" icon="chevron-up" class="gm-iconbtn" aria-label={`Move ${m.slug} left`} onClick={() => move(m, -1)} />
                  <Button variant="quiet" icon="chevron-down" class="gm-iconbtn" aria-label={`Move ${m.slug} right`} onClick={() => move(m, 1)} />
                </td>
                <td>
                  <Button variant="quiet" icon="trash" onClick={() => softDelete('module', m.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section class="gm-section" aria-labelledby="cons-h">
        <h2 id="cons-h">Connections</h2>
        <table class="gm-table">
          <thead>
            <tr>
              <th scope="col">Connection</th>
              <th scope="col">From</th>
              <th scope="col">Feeds</th>
              <th scope="col">
                <span class="gm-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {connections.value
              .filter((c) => !c.deletedAt)
              .map((c) => (
                <tr key={c.id}>
                  <td>
                    <RenameCell kind="connection" id={c.id} slug={c.slug} />
                  </td>
                  <td class="gm-mono">{byId.value.get(c.aId)?.slug}</td>
                  <td class="gm-mono">{byId.value.get(c.bId)?.slug}</td>
                  <td>
                    <Button variant="quiet" icon="trash" onClick={() => softDelete('connection', c.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <section class="gm-section" aria-labelledby="del-h">
        <h2 id="del-h">Removed</h2>
        {deleted.length === 0 ? (
          <p class="gm-quiet">Nothing removed.</p>
        ) : (
          <ul class="gm-entries">
            {deleted.map((x) => (
              <li key={x.id}>
                <span class="gm-entry-text">
                  <Slug>{x.slug}</Slug>{' '}
                  <span class="gm-quiet">
                    {'aId' in x ? 'connection' : 'module'}, removed {ago(x.deletedAt)}
                  </span>
                </span>
                <Button icon="arrow-back-up" onClick={() => softDelete('aId' in x ? 'connection' : 'module', x.id, true)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function RenameCell({ kind, id, slug }: { kind: 'module' | 'connection'; id: string; slug: string }) {
  const [v, setV] = useState<string | null>(null);
  if (v === null)
    return (
      <button type="button" class="gm-btn gm-btn-quiet" aria-label={`Rename ${slug}`} onClick={() => setV(slug)}>
        <span class="gm-slug">{slug}</span>
      </button>
    );
  const err = v === slug ? null : slugError(v, (s) => modules.value.some((m) => m.slug === s) || connections.value.some((c) => c.slug === s));
  return (
    <form
      class="gm-inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (!err && v !== slug) rename(kind, id, v);
        setV(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setV(null);
        }
      }}
    >
      <input
        class="gm-input gm-mono"
        autoFocus
        aria-label={`New name for ${slug}`}
        value={v}
        maxLength={SLUG_MAX}
        aria-invalid={!!err}
        onInput={(e) => setV(e.currentTarget.value.toLowerCase())}
      />
      <span class="gm-counter">
        {v.length} of {SLUG_MAX}
      </span>
      <Button type="submit" disabled={!!err}>
        Save
      </Button>
      {err && (
        <span class="gm-error" role="alert">
          {err}
        </span>
      )}
    </form>
  );
}

function ActivityLog() {
  const [items, setItems] = useState<Activity[]>([]);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const load = () =>
    getDocs(query(collection(db, 'activity'), orderBy('at', 'desc'), limit(300))).then((s) =>
      setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity)),
    );
  useEffect(() => {
    load();
  }, []);
  const shown = items.filter((a) => (!kind || a.targetKind === kind) && (!q || `${a.actorInitials} ${a.summary}`.toLowerCase().includes(q.toLowerCase())));
  const purge = async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 180 * 86400000);
    const old = await getDocs(query(collection(db, 'activity'), where('at', '<', cutoff), limit(400)));
    const b = writeBatch(db);
    old.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    toast(`Purged ${old.size} entries older than 180 days.`);
    load();
  };
  return (
    <section class="gm-section" aria-label="Activity log">
      <div class="gm-addline">
        <label class="gm-label">
          Filter
          <input class="gm-input" type="search" value={q} placeholder="lift-arm or P2" onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
        <label class="gm-label">
          Kind
          <select class="gm-input gm-select" value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
            <option value="">All</option>
            <option value="module">Modules</option>
            <option value="connection">Connections</option>
            <option value="team">Team</option>
            <option value="data">Data</option>
          </select>
        </label>
        <Button onClick={purge}>Purge entries older than 180 days</Button>
      </div>
      <p class="gm-quiet">Entries are written by each browser and are for coordination, not proof of who did what.</p>
      <ul class="gm-activity">
        {shown.map((a) => (
          <li key={a.id}>
            <span class="gm-initials">{a.actorInitials}</span> {a.summary} <span class="gm-quiet">· {ago(a.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Data() {
  const [stale, setStale] = useState(config.value.staleDays);
  const [purgeSlug, setPurgeSlug] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const saveConfig = async (patch: Partial<typeof config.value>) => {
    const next = { ...config.value, ...patch };
    await setDoc(doc(db, 'config/app'), next);
    config.value = next;
  };
  const exportJson = async () => {
    const out: Record<string, unknown[]> = {};
    for (const c of ['modules', 'connections', 'slugs', 'ideas', 'flags', 'refs', 'allowlist', 'config']) {
      const s = await getDocs(collection(db, c));
      out[c] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    for (const m of out.modules as Module[]) {
      const b = await getDocs(collection(db, 'modules', m.id, 'body'));
      (m as unknown as { body: unknown }).body = b.docs.map((d) => d.data())[0] ?? null;
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...out }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `greenmech-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await saveConfig({ lastBackupAt: Timestamp.now() });
    toast('Backup downloaded.');
  };
  const importSample = async () => {
    const ids = new Map<string, string>();
    const b = writeBatch(db);
    const s = sample as unknown as {
      tiers: string[][];
      modules: Record<string, { status: number; in: string; out: string; purpose: string }>;
      connections: string[][];
    };
    s.tiers.forEach((row, tier) =>
      row.forEach((slug, order) => {
        const ref = doc(collection(db, 'modules'));
        ids.set(slug, ref.id);
        const d = s.modules[slug];
        b.set(ref, {
          slug,
          status: d.status,
          tier,
          order,
          purpose: d.purpose,
          hasModel: false,
          ports: { in: d.in, out: d.out },
          leaderUid: null,
          leaderInitials: null,
          createdAt: serverTimestamp(),
          createdBy: me(),
          ...audit(),
          deletedAt: null,
        });
        b.set(doc(db, 'slugs', slug), { kind: 'module', refId: ref.id });
      }),
    );
    for (const [slug, a, c] of s.connections) {
      const id = `${ids.get(a)}__${ids.get(c)}`;
      b.set(doc(db, 'connections', id), {
        slug,
        aId: ids.get(a),
        bId: ids.get(c),
        state: 1,
        createdAt: serverTimestamp(),
        createdBy: me(),
        ...audit(),
        deletedAt: null,
      });
      b.set(doc(db, 'slugs', slug), { kind: 'connection', refId: id });
    }
    act(b, 'import', 'data', 'sample', null, 'imported the sample structure');
    await b.commit().then(
      () => toast('Sample structure imported. It is labelled as sample in each purpose.'),
      (e) => toast(`Import failed: ${e.message}`, undefined, 'error'),
    );
  };
  const deleted = [...modules.value.filter((m) => m.deletedAt), ...connections.value.filter((c) => c.deletedAt)];
  const hardPurge = async (slug: string) => {
    const m = modules.value.find((x) => x.slug === slug && x.deletedAt);
    const c = connections.value.find((x) => x.slug === slug && x.deletedAt);
    const b = writeBatch(db);
    if (m) {
      b.delete(doc(db, 'modules', m.id));
      b.delete(doc(db, 'modules', m.id, 'body', 'main'));
      for (const coll of ['ideas', 'flags', 'refs'])
        (await getDocs(query(collection(db, coll), where('moduleId', '==', m.id)))).docs.forEach((d) => b.delete(d.ref));
      connections.value.filter((x) => x.aId === m.id || x.bId === m.id).forEach((x) => b.delete(doc(db, 'connections', x.id)));
    }
    if (c) b.delete(doc(db, 'connections', c.id));
    act(b, 'purge', 'data', (m ?? c)!.id, null, `permanently deleted ${slug}`);
    await b.commit().then(
      () => toast(`${slug} is permanently deleted.`),
      (e) => toast(`Not deleted: ${e.message}`, undefined, 'error'),
    );
    setPurgeSlug(null);
    setTyped('');
  };
  return (
    <>
      <section class="gm-section" aria-labelledby="bk-h">
        <h2 id="bk-h">Backup</h2>
        <p>{config.value.lastBackupAt ? `Last backup ${ago(config.value.lastBackupAt)}.` : 'No backup yet.'}</p>
        <Button variant="primary" icon="download" onClick={exportJson}>
          Export JSON backup
        </Button>
      </section>
      <section class="gm-section" aria-labelledby="smp-h">
        <h2 id="smp-h">Sample structure</h2>
        <p class="gm-measure">
          Ten sample modules and nine connections from the project brief, so the team can see how the app works. Only available while there are no modules.
        </p>
        <Button icon="download" disabled={modules.value.length > 0} onClick={importSample}>
          Import sample structure
        </Button>
        {modules.value.length > 0 && <p class="gm-quiet">Not available: modules already exist.</p>}
      </section>
      <section class="gm-section" aria-labelledby="st-h">
        <h2 id="st-h">Stale after</h2>
        <form
          class="gm-addline"
          onSubmit={(e) => {
            e.preventDefault();
            saveConfig({ staleDays: stale }).then(() => toast('Saved.'));
          }}
        >
          <label class="gm-label">
            Days without an update before Monitor calls a Planning or Building module stale
            <input class="gm-input gm-short" type="number" min={1} max={90} value={stale} onInput={(e) => setStale(Number(e.currentTarget.value))} />
          </label>
          <Button type="submit">Save</Button>
        </form>
      </section>
      <section class="gm-section" aria-labelledby="pg-h">
        <h2 id="pg-h">Permanently delete</h2>
        <p class="gm-measure">Removes a removed module or connection for good, with its ideas, flags, references and plan. This cannot be undone.</p>
        {deleted.length === 0 ? (
          <p class="gm-quiet">Nothing removed, so nothing to delete.</p>
        ) : (
          <ul class="gm-entries">
            {deleted.map((x) => (
              <li key={x.id}>
                <Slug>{x.slug}</Slug>
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={() => {
                    setPurgeSlug(x.slug);
                    setTyped('');
                  }}
                >
                  Delete permanently
                </Button>
              </li>
            ))}
          </ul>
        )}
        {purgeSlug && (
          <div class="gm-confirm" role="alertdialog" aria-labelledby="cf-h" aria-describedby="cf-d">
            <h3 id="cf-h">
              Delete <Slug>{purgeSlug}</Slug> permanently?
            </h3>
            <p id="cf-d">
              Type <span class="gm-slug">{purgeSlug}</span> to confirm.
            </p>
            <form
              class="gm-addline"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed === purgeSlug) hardPurge(purgeSlug);
              }}
            >
              <label class="gm-label">
                Name
                <input class="gm-input gm-mono" autoFocus value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
              </label>
              <Button type="submit" variant="danger" disabled={typed !== purgeSlug}>
                Delete permanently
              </Button>
              <Button variant="quiet" onClick={() => setPurgeSlug(null)}>
                Cancel
              </Button>
            </form>
          </div>
        )}
      </section>
    </>
  );
}
void STATUS;
void user;
