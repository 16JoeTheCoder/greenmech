import { useEffect, useMemo, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../state/firebase';
import {
  live, liveConns, bySlug, byId, setStatus, rename, slugTaken, updateModule, addIdea, addFlag, resolveFlag, removeDoc, addRef, saveBody, toast,
} from '../state/data';
import { user, canPost, isAdmin, uiRole } from '../state/session';
import { tiersOf } from '../components/Elevation';
import { STATUS } from '../lib/status';
import { effective } from '../lib/connections';
import { slugError, SLUG_MAX } from '../lib/slug';
import { parseMarkdown, safeHref } from '../lib/markdown';
import { validateGmm, validateSafeSvg } from '../lib/svg-gmm';
import { drawingPrompt } from '../lib/prompt';
import { ago } from '../lib/time';
import { PORTS, type Activity, type Flag, type Idea, type Module, type Port, type Ref, type Status } from '../lib/types';
import { AddLine, Button, ConnBadge, Empty, Icon, Markdown, Slug, StatusBadge, Stepper, VectorView } from '../components/ui';
import { LeaderControl } from './Modules';
import { NotFound, useTitle } from '../app';

export default function ModulePage({ slug }: { slug: string }) {
  const [, nav] = useLocation();
  const m = bySlug.value.get(slug);
  const [redirecting, setRedirecting] = useState(!m);
  useEffect(() => {
    if (m) { setRedirecting(false); return; }
    // old slug: the registry entry still points at the module, show its current slug
    setRedirecting(true);
    getDoc(doc(db, 'slugs', slug)).then((s) => {
      const target = s.exists() ? byId.value.get(s.data().refId) : undefined;
      if (target && !target.deletedAt) nav(`/m/${target.slug}`, { replace: true });
      else setRedirecting(false);
    }).catch(() => setRedirecting(false));
  }, [slug, !!m]);
  if (!m || m.deletedAt) return redirecting ? <p class="gm-boot" role="status">Looking up {slug}</p> : <NotFound what="module" />;
  return <Page m={m} />;
}

function Page({ m }: { m: Module }) {
  useTitle(m.slug);
  const [, nav] = useLocation();
  const uid = user.value!.uid;
  const leads = m.leaderUid === uid && canPost.value;
  const canShape = leads || (isAdmin.value && uiRole.value === 'admin');
  const order = useMemo(() => { const t = tiersOf(live.value); return [...t.tiers.flatMap((x) => x.ms), ...t.unplaced]; }, [live.value]);
  const idx = order.findIndex((x) => x.id === m.id);
  const prev = order[(idx - 1 + order.length) % order.length], next = order[(idx + 1) % order.length];

  // follow renames (including an undo) without leaving the page
  useEffect(() => { if (location.pathname !== `/m/${m.slug}`) history.replaceState(null, '', `/m/${m.slug}${location.hash}`); }, [m.slug]);
  useEffect(() => {
    const h = (e: Event) => {
      const k = (e as CustomEvent<string>).detail;
      if (canShape && ['1', '2', '3', '4'].includes(k)) setStatus(m.id, (Number(k) - 1) as Status);
      if (k === '[' && prev) nav(`/m/${prev.slug}`);
      if (k === ']' && next) nav(`/m/${next.slug}`);
    };
    addEventListener('gm-key', h);
    return () => removeEventListener('gm-key', h);
  }, [m.id, canShape, prev?.slug, next?.slug]);

  return (
    <article class="gm-page gm-narrow gm-module">
      <nav class="gm-pager" aria-label="Modules">
        <Link href={`/m/${prev.slug}`} class="gm-btn gm-btn-quiet" aria-label={`Previous module, ${prev.slug}`}><Icon name="arrow-left" /><span class="gm-slug">{prev.slug}</span></Link>
        <Button variant="quiet" icon="copy" onClick={() => copy(location.href, 'Link copied.')}>Copy link</Button>
        <Link href={`/m/${next.slug}`} class="gm-btn gm-btn-quiet" aria-label={`Next module, ${next.slug}`}><span class="gm-slug">{next.slug}</span><Icon name="arrow-right" /></Link>
      </nav>
      <nav class="gm-anchors" aria-label="On this page">
        <a href="#overview">Overview</a><a href="#plan">Plan</a><a href="#discussion">Discussion</a><a href="#connections">Connections</a>
      </nav>
      <Overview m={m} leads={leads} canShape={canShape} />
      <Body m={m} canShape={canShape} />
      <Discussion m={m} leads={leads} />
      <ModuleConns m={m} />
      <History m={m} />
    </article>
  );
}

export function copy(text: string, ok: string) {
  navigator.clipboard?.writeText(text).then(() => toast(ok), () => toast('Copy did not work in this browser. Select the text and copy it by hand.', undefined, 'error'));
}

export function SlugEditor({ kind, id, slug, label }: { kind: 'module' | 'connection'; id: string; slug: string; label: string }) {
  const [v, setV] = useState(slug);
  const [editing, setEditing] = useState(false);
  useEffect(() => setV(slug), [slug]);
  const err = v === slug ? null : slugError(v, slugTaken);
  if (!editing)
    return (
      <div class="gm-titlerow">
        <h1><Slug>{slug}</Slug></h1>
        <Button variant="quiet" icon="pencil" onClick={() => setEditing(true)} aria-label={`Rename ${label}`}>Rename</Button>
      </div>
    );
  return (
    <form class="gm-rename" onSubmit={(e) => { e.preventDefault(); if (!err && v !== slug) rename(kind, id, v); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setV(slug); setEditing(false); } }}>
      <h1 class="gm-sr">{slug}</h1>
      <label class="gm-label">
        New name
        <input class="gm-input gm-mono gm-input-lg" autoFocus value={v} maxLength={SLUG_MAX} aria-invalid={!!err} aria-describedby="gm-rn-msg"
          onInput={(e) => setV(e.currentTarget.value.toLowerCase().replace(/\s+/g, '-'))} />
      </label>
      <span class="gm-counter">{v.length} of {SLUG_MAX}</span>
      <p id="gm-rn-msg" class={err ? 'gm-error' : 'gm-quiet'} role={err ? 'alert' : undefined}>
        {err ?? <>New address: <span class="gm-slug">/{kind === 'module' ? 'm' : 'c'}/{v}</span>. Old links keep working.</>}
      </p>
      <Button type="submit" variant="primary" disabled={!!err || v === slug}>Save name</Button>
      <Button variant="quiet" onClick={() => { setV(slug); setEditing(false); }}>Cancel</Button>
    </form>
  );
}

function Overview({ m, leads, canShape }: { m: Module; leads: boolean; canShape: boolean }) {
  const [purpose, setPurpose] = useState(m.purpose);
  useEffect(() => setPurpose(m.purpose), [m.purpose]);
  const setPort = (side: 'in' | 'out', p: Port) => updateModule(m.id, { ports: { ...m.ports, [side]: p } }, `set ${m.slug} ${side === 'in' ? 'input' : 'output'} to ${p}`);
  return (
    <section id="overview" aria-labelledby="ov-h" class="gm-section">
      {canShape ? <SlugEditor kind="module" id={m.id} slug={m.slug} label="module" /> : <h1><Slug>{m.slug}</Slug></h1>}
      <h2 id="ov-h" class="gm-sr">Overview</h2>
      {canShape ? (
        <form class="gm-addline" onSubmit={(e) => { e.preventDefault(); if (purpose.trim() !== m.purpose) updateModule(m.id, { purpose: purpose.trim() }, `updated the purpose of ${m.slug}`); }}>
          <label class="gm-label gm-grow">Purpose, one sentence
            <input class="gm-input" value={purpose} maxLength={200} placeholder="Catches the ball and lifts it to the next tier" onInput={(e) => setPurpose(e.currentTarget.value)} />
          </label>
          <Button type="submit" disabled={purpose.trim() === m.purpose}>Save</Button>
        </form>
      ) : <p class="gm-lede">{m.purpose || <span class="gm-quiet">No purpose written yet.</span>}</p>}
      <dl class="gm-facts">
        <div><dt>Status</dt><dd>
          {canShape ? <><Stepper value={m.status} onChange={(s) => setStatus(m.id, s)} /><span class="gm-quiet">Keys 1 to 4 set status.</span></> : <StatusBadge status={m.status} />}
        </dd></div>
        <div><dt>Leader</dt><dd><LeaderControl m={m} /></dd></div>
        <div><dt>Takes in</dt><dd>{canShape ? <PortSelect value={m.ports.in} onChange={(p) => setPort('in', p)} label="Takes in" /> : <span class="gm-mono">{m.ports.in}</span>}</dd></div>
        <div><dt>Sends out</dt><dd>{canShape ? <PortSelect value={m.ports.out} onChange={(p) => setPort('out', p)} label="Sends out" /> : <span class="gm-mono">{m.ports.out}</span>}</dd></div>
        <div><dt>Updated</dt><dd>{ago(m.updatedAt)}</dd></div>
      </dl>
    </section>
  );
}

function PortSelect({ value, onChange, label }: { value: Port; onChange: (p: Port) => void; label: string }) {
  return (
    <select class="gm-input gm-mono gm-select" aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value as Port)}>
      {PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

async function readFile(accept: string): Promise<string | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files?.[0]; if (!f) return res(null); f.text().then(res, () => res(null)); };
    i.click();
  });
}

function Body({ m, canShape }: { m: Module; canShape: boolean }) {
  const [body, setBody] = useState<{ plan: string; model: { svg: string; updatedAt?: unknown } | null } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [modelErr, setModelErr] = useState('');
  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'modules', m.id, 'body', 'main'), (s) => setBody(s.exists() ? (s.data() as typeof body) : { plan: '', model: null }), () => setBody({ plan: '', model: null }));
    const u2 = onSnapshot(query(collection(db, 'refs'), where('moduleId', '==', m.id), orderBy('createdAt', 'desc'), limit(24)), (s) => setRefs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Ref)), () => {});
    return () => { u1(); u2(); };
  }, [m.id]);
  const plan = body?.plan ?? '';
  const uploadModel = async () => {
    const t = await readFile('.svg,image/svg+xml');
    if (t === null) return;
    const r = validateGmm(t);
    if (!r.ok) return setModelErr(r.error);
    setModelErr('');
    saveBody(m.id, { plan, model: { svg: t } }, `replaced the model of ${m.slug}`, true);
  };
  return (
    <section id="plan" aria-labelledby="plan-h" class="gm-section">
      <h2 id="plan-h">Plan</h2>
      <div class="gm-model">
        {body?.model ? <VectorView svg={body.model.svg} label={`Model of ${m.slug}`} class="gm-model-view" />
          : <Empty><p>No model yet. Draw one to the GMM v1 standard, or ask an AI with the prompt below.</p></Empty>}
        <div class="gm-actions">
          {canShape && <Button icon="upload" onClick={uploadModel}>Replace model (.svg)</Button>}
          <Button variant="quiet" icon="copy" onClick={() => copy(drawingPrompt(m), 'Drawing prompt copied. Paste it into your AI assistant.')}>Copy AI drawing prompt</Button>
          <Link href="/help#gmm" class="gm-textlink">What is GMM v1?</Link>
        </div>
        {modelErr && <p class="gm-error" role="alert">Model not saved. {modelErr}</p>}
      </div>
      {draft !== null ? (
        <form class="gm-plan-edit" onSubmit={(e) => { e.preventDefault(); saveBody(m.id, { plan: draft, model: body?.model ? { svg: body.model.svg } : null }, `updated the plan of ${m.slug}`); setDraft(null); }}>
          <label class="gm-label">Plan (paragraphs, **bold**, *italic*, lists, # headings, https links)
            <textarea class="gm-input gm-textarea" value={draft} maxLength={20000} rows={14} onInput={(e) => setDraft(e.currentTarget.value)} />
          </label>
          <span class="gm-counter">{draft.length} of 20000</span>
          <div class="gm-actions"><Button type="submit" variant="primary">Save plan</Button><Button variant="quiet" onClick={() => setDraft(null)}>Cancel</Button></div>
        </form>
      ) : (
        <>
          {plan ? <Markdown blocks={parseMarkdown(plan)} /> : <p class="gm-quiet">{canShape ? 'No plan yet. Explain how this module works, what it needs, and what is still unknown.' : 'No plan written yet.'}</p>}
          {canShape && <Button icon="pencil" onClick={() => setDraft(plan)}>{plan ? 'Edit plan' : 'Write the plan'}</Button>}
        </>
      )}
      <References m={m} refs={refs} />
    </section>
  );
}

function References({ m, refs }: { m: Module; refs: Ref[] }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const full = refs.length >= 12;
  const addLink = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Give the link a title.');
    if (!safeHref(url.trim())) return setErr('Links must start with https://');
    setErr(''); addRef(m.id, { kind: 'link', title: title.trim(), url: safeHref(url.trim()), data: null }); setTitle(''); setUrl('');
  };
  const addVector = async () => {
    const t = await readFile('.svg,image/svg+xml');
    if (t === null) return;
    const r = validateSafeSvg(t);
    if (!r.ok) return setErr(`Vector not added. ${r.error}`);
    setErr(''); addRef(m.id, { kind: 'vector', title: title.trim() || 'Vector sketch', url: null, data: t }); setTitle('');
  };
  return (
    <div class="gm-refs">
      <h3>References</h3>
      {refs.length === 0 && <p class="gm-quiet">No references yet.</p>}
      <ul class="gm-reflist">
        {refs.map((r) => (
          <li key={r.id}>
            {r.kind === 'vector' && r.data ? <VectorView svg={r.data} label="" class="gm-thumb" /> : <span class="gm-thumb gm-thumb-link"><Icon name="link" /></span>}
            <span class="gm-ref-main">
              {r.kind === 'link' && r.url ? <a href={r.url} rel="noopener noreferrer" target="_blank">{r.title}</a> : <span>{r.title}</span>}
              <span class="gm-quiet">{r.kind === 'link' ? new URL(r.url!).hostname : 'vector'} · {ago(r.createdAt)}</span>
            </span>
            {(r.authorUid === user.value!.uid || isAdmin.value) && canPost.value && (
              <Button variant="quiet" icon="trash" class="gm-iconbtn" aria-label={`Delete reference ${r.title}`} onClick={() => { const { id, ...data } = r; removeDoc('refs', id, data, 'a reference'); }} />
            )}
          </li>
        ))}
      </ul>
      {canPost.value && (full ? <p class="gm-quiet">This module has 12 references, the most it can hold. Delete one to add another.</p> : (
        <form class="gm-addref" onSubmit={addLink}>
          <label class="gm-label">Title<input class="gm-input" value={title} maxLength={120} placeholder="Rube Goldberg lever guide" onInput={(e) => setTitle(e.currentTarget.value)} /></label>
          <label class="gm-label gm-grow">Link<input class="gm-input" type="url" value={url} placeholder="https://example.org/levers" onInput={(e) => setUrl(e.currentTarget.value)} /></label>
          <Button type="submit" icon="link">Add link</Button>
          <Button icon="upload" onClick={addVector}>Add vector (.svg)</Button>
        </form>
      ))}
      {err && <p class="gm-error" role="alert">{err}</p>}
    </div>
  );
}

function Discussion({ m, leads }: { m: Module; leads: boolean }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, 'ideas'), where('moduleId', '==', m.id), orderBy('createdAt', 'desc'), limit(50)), (s) => setIdeas(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Idea)), () => {});
    const u2 = onSnapshot(query(collection(db, 'flags'), where('moduleId', '==', m.id), orderBy('createdAt', 'desc'), limit(50)), (s) => setFlags(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Flag)), () => {});
    return () => { u1(); u2(); };
  }, [m.id]);
  const uid = user.value!.uid;
  const open = flags.filter((f) => !f.resolved), done = flags.filter((f) => f.resolved);
  const mayResolve = (f: Flag) => canPost.value && (f.authorUid === uid || leads || isAdmin.value);
  const mayDelete = (a: string) => canPost.value && (a === uid || isAdmin.value);
  return (
    <section id="discussion" aria-labelledby="disc-h" class="gm-section">
      <h2 id="disc-h">Discussion</h2>
      <div class="gm-two">
        <div>
          <h3>Flags</h3>
          <p class="gm-quiet">Doubts and improvements, not errors.</p>
          {canPost.value && <AddLine label="Add a flag" placeholder="The ramp angle looks too steep" max={500} onAdd={(t) => addFlag(m.id, t)} />}
          {open.length === 0 && <p class="gm-quiet">No open flags.</p>}
          <ul class="gm-entries">
            {open.map((f) => (
              <li key={f.id}>
                <span class="gm-dot" aria-hidden="true" />
                <span class="gm-entry-text">{f.text}<span class="gm-quiet"> · {f.authorInitials}, {ago(f.createdAt)}</span></span>
                {mayResolve(f) && <Button icon="check" onClick={() => resolveFlag(f, true)}>Resolve</Button>}
                {mayDelete(f.authorUid) && <Button variant="quiet" icon="trash" class="gm-iconbtn" aria-label="Delete flag" onClick={() => { const { id, ...d } = f; removeDoc('flags', id, d, 'a flag'); }} />}
              </li>
            ))}
          </ul>
          {done.length > 0 && (
            <>
              <Button variant="quiet" icon={showResolved ? 'chevron-up' : 'chevron-down'} aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>{done.length} resolved</Button>
              {showResolved && (
                <ul class="gm-entries">
                  {done.map((f) => (
                    <li key={f.id}>
                      <Icon name="check" />
                      <span class="gm-entry-text">{f.text}<span class="gm-quiet"> · {f.authorInitials}</span></span>
                      {mayResolve(f) && <Button variant="quiet" icon="refresh" onClick={() => resolveFlag(f, false)}>Reopen</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div>
          <h3>Ideas</h3>
          <p class="gm-quiet">Anyone on the team can add one.</p>
          {canPost.value && <AddLine label="Add an idea" placeholder="Use a cam instead of a crank" max={1000} onAdd={(t) => addIdea(m.id, t)} />}
          {ideas.length === 0 && <p class="gm-quiet">No ideas yet. Be the first to add one.</p>}
          <ul class="gm-entries">
            {ideas.map((i) => (
              <li key={i.id}>
                <Icon name="bulb" />
                <span class="gm-entry-text">{i.text}<span class="gm-quiet"> · {i.authorInitials}, {ago(i.createdAt)}</span></span>
                {mayDelete(i.authorUid) && <Button variant="quiet" icon="trash" class="gm-iconbtn" aria-label="Delete idea" onClick={() => { const { id, ...d } = i; removeDoc('ideas', id, d, 'an idea'); }} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ModuleConns({ m }: { m: Module }) {
  const cs = liveConns.value.filter((c) => c.aId === m.id || c.bId === m.id);
  return (
    <section id="connections" aria-labelledby="mc-h" class="gm-section">
      <h2 id="mc-h">Connections</h2>
      {cs.length === 0 ? <p class="gm-quiet">Not linked to any module yet. <Link href="/connections">Link modules</Link></p> : (
        <ul class="gm-chips">
          {cs.map((c) => {
            const a = byId.value.get(c.aId)!, b = byId.value.get(c.bId)!;
            return (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} class="gm-chiplink">
                  <span class="gm-slug">{c.slug}</span>
                  <span class="gm-quiet">{c.aId === m.id ? `feeds ${b.slug}` : `fed by ${a.slug}`}</span>
                  <ConnBadge eff={effective(c, a, b)} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function History({ m }: { m: Module }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, 'activity'), where('targetId', '==', m.id), orderBy('at', 'desc'), limit(20)))
      .then((s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity)), () => setItems([]));
  }, [m.id, m.updatedAt?.toMillis?.()]);
  if (!items?.length) return null;
  return (
    <section aria-labelledby="hist-h" class="gm-section">
      <h2 id="hist-h">Recent changes</h2>
      <ul class="gm-activity">{items.map((a) => <li key={a.id}><span class="gm-initials">{a.actorInitials}</span> {a.summary} <span class="gm-quiet">· {ago(a.at)}</span></li>)}</ul>
    </section>
  );
}
void STATUS;
