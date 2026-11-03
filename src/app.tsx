import { useEffect, useRef, useState } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import { Route, Switch, Link, useLocation } from 'wouter-preact';
import { user, uiRole, isAdmin, preview, signOut, theme, applyTheme, initials, loadProfile, shortcuts } from './state/session';
import { live, liveConns, sync, inflight, toasts, dismissToast, runUndo, loaded } from './state/data';
import { search, type Hit } from './lib/search';
import { STATUS } from './lib/status';
import { UNDO_MS } from './lib/undo';
import { Icon, Button } from './components/ui';
import { ModulesView } from './routes/Modules';
import { SignIn, Access } from './routes/Auth';

const ModulePage = lazy(() => import('./routes/ModulePage'));
const ConnectionsView = lazy(() => import('./routes/Connections'));
const Monitor = lazy(() => import('./routes/Monitor'));
const Manage = lazy(() => import('./routes/Manage'));
const Help = lazy(() => import('./routes/Help'));

export const helpOpen = { set: (_: boolean) => {} };

export function App() {
  const u = user.value;
  const [loc, nav] = useLocation();
  useEffect(() => {
    if (u && uiRole.value !== 'none') loadProfile();
  }, [u]);
  if (u === undefined)
    return (
      <div class="gm-boot" role="status">
        Loading Greenmech
      </div>
    );
  if (!u) return loc === '/signin' ? <SignIn /> : <Redirect to="/signin" nav={nav} />;
  if (uiRole.value === 'none' && !isAdmin.value) return <Access />;
  return <Shell />;
}

function Redirect({ to, nav }: { to: string; nav: (to: string, o?: { replace?: boolean }) => void }) {
  useEffect(() => nav(to, { replace: true }), [to]);
  return null;
}

function Shell() {
  const [loc, nav] = useLocation();
  const [help, setHelp] = useState(false);
  helpOpen.set = setHelp;
  const role = uiRole.value;
  useEffect(() => {
    if (loc === '/signin' || loc === '/access') nav(role === 'coach' ? '/monitor' : '/', { replace: true });
  }, [loc]);
  useGlobalKeys(setHelp);
  return (
    <>
      <a class="gm-skip" href="#main">
        Skip to content
      </a>
      {preview.value && (
        <div class="gm-preview" role="status">
          Previewing as {preview.value}. Your real permissions are unchanged.
          <Button variant="quiet" onClick={() => (preview.value = null)}>
            Stop preview
          </Button>
        </div>
      )}
      <header class="gm-header">
        <Link href={role === 'coach' ? '/monitor' : '/'} class="gm-brand">
          Greenmech
        </Link>
        <nav aria-label="Main" class="gm-nav">
          {role !== 'coach' && <NavLink href="/">Modules</NavLink>}
          <NavLink href="/connections">Connections</NavLink>
          <NavLink href="/monitor">Monitor</NavLink>
          {isAdmin.value && !preview.value && <NavLink href="/manage">Manage</NavLink>}
        </nav>
        <JumpSearch />
        <SyncIndicator />
        <AccountMenu onHelp={() => setHelp(true)} />
      </header>
      <main id="main" tabIndex={-1}>
        {!loaded.value ? (
          <p class="gm-boot" role="status">
            Loading modules
          </p>
        ) : (
          <Suspense
            fallback={
              <p class="gm-boot" role="status">
                Loading
              </p>
            }
          >
            <Switch>
              <Route path="/">{role === 'coach' ? <Monitor /> : <ModulesView />}</Route>
              <Route path="/m/:slug">{(p) => <ModulePage slug={p.slug} />}</Route>
              <Route path="/connections">
                <ConnectionsView />
              </Route>
              <Route path="/c/:slug">{(p) => <ConnectionsView slug={p.slug} />}</Route>
              <Route path="/monitor">
                <Monitor />
              </Route>
              <Route path="/manage">{isAdmin.value ? <Manage /> : <NotFound what="page" />}</Route>
              <Route path="/help">
                <Help />
              </Route>
              <Route>
                <NotFound what="page" />
              </Route>
            </Switch>
          </Suspense>
        )}
      </main>
      {help && <HelpPanel onClose={() => setHelp(false)} />}
      <Toasts />
    </>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  const [loc] = useLocation();
  const on = href === '/' ? loc === '/' || loc.startsWith('/m/') : loc.startsWith(href) || (href === '/connections' && loc.startsWith('/c/'));
  return (
    <Link href={href} class={`gm-navlink ${on ? 'gm-navlink-on' : ''}`} aria-current={on ? 'page' : undefined}>
      {children}
    </Link>
  );
}

export function NotFound({ what }: { what: string }) {
  useTitle('Not found');
  return (
    <div class="gm-page gm-narrow">
      <h1>That {what} does not exist</h1>
      <p>
        It may have been renamed or removed. Search for it by name with the box at the top, or press <kbd>/</kbd>.
      </p>
      <p>
        <Link href="/">Go to modules</Link>
      </p>
    </div>
  );
}

export function useTitle(t: string) {
  useEffect(() => {
    document.title = `${t} · Greenmech`;
  }, [t]);
}

// ---------- search ----------
function JumpSearch() {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [, nav] = useLocation();
  const input = useRef<HTMLInputElement>(null);
  const hits: Hit[] = search(q, live.value, liveConns.value);
  const byId = new Map(live.value.map((m) => [m.id, m]));
  const open = (h: Hit) => {
    nav(h.kind === 'module' ? `/m/${h.slug}` : `/c/${h.slug}`);
    setQ('');
    input.current?.blur();
  };
  useEffect(() => setI(0), [q]);
  return (
    <div class="gm-search" role="search">
      <label class="gm-sr" for="gm-search">
        Jump to a module or connection
      </label>
      <Icon name="search" />
      <input
        id="gm-search"
        ref={input}
        class="gm-input gm-search-input"
        type="text"
        placeholder="Search, like lift-arm"
        enterKeyHint="go"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="gm-search-list"
        aria-activedescendant={hits[i] ? `gm-hit-${i}` : undefined}
        onInput={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setI((x) => Math.min(x + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setI((x) => Math.max(x - 1, 0));
          } else if (e.key === 'Enter' && hits[i]) {
            e.preventDefault();
            open(hits[i]);
          } else if (e.key === 'Escape' && q) {
            e.preventDefault();
            e.stopPropagation();
            setQ('');
          }
        }}
      />
      {q.trim() && (
        <ul id="gm-search-list" class="gm-search-list" role="listbox" aria-label="Results">
          {hits.length === 0 && (
            <li class="gm-search-none" role="option" aria-selected="false">
              Nothing matches "{q}".
            </li>
          )}
          {hits.map((h, n) => {
            const m = h.kind === 'module' ? byId.get(h.id) : undefined;
            const c = h.kind === 'connection' ? liveConns.value.find((x) => x.id === h.id) : undefined;
            return (
              <li
                key={h.id}
                id={`gm-hit-${n}`}
                role="option"
                aria-selected={n === i}
                class={n === i ? 'gm-hit-on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  open(h);
                }}
              >
                <span class="gm-slug">{h.slug}</span>
                <span class="gm-quiet">
                  {m ? `${STATUS[m.status].word} · ${m.leaderInitials ?? 'no leader'}` : `Connection · ${byId.get(c!.aId)?.slug} to ${byId.get(c!.bId)?.slug}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SyncIndicator() {
  const s = sync.value;
  const text =
    s === 'offline'
      ? inflight.value
        ? `Offline, ${inflight.value} change${inflight.value > 1 ? 's' : ''} waiting`
        : 'Offline'
      : s === 'saving'
        ? 'Saving'
        : 'Saved';
  return (
    <span class="gm-sync" role="status" aria-live="polite">
      <Icon name={s === 'offline' ? 'cloud-off' : 'cloud-check'} />
      {text}
    </span>
  );
}

function AccountMenu({ onHelp }: { onHelp: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const t = theme.value;
  const first = (user.value?.displayName ?? '').split(' ')[0];
  return (
    <div
      class="gm-account"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button type="button" class="gm-btn gm-account-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <span class="gm-initials">{initials.value || 'You'}</span>
        <span class="gm-sr">Account and settings</span>
      </button>
      {open && (
        <div class="gm-menu">
          <p class="gm-menu-who">
            {first || 'Signed in'} <span class="gm-quiet">· {uiRole.value}</span>
          </p>
          <fieldset class="gm-seg">
            <legend>Theme</legend>
            {(['system', 'light', 'dark'] as const).map((v) => (
              <label key={v} class={`gm-seg-opt ${t === v ? 'gm-seg-on' : ''}`}>
                <input type="radio" name="gm-theme" checked={t === v} onChange={() => applyTheme(v)} />
                <Icon name={v === 'system' ? 'device-desktop' : v === 'light' ? 'sun' : 'moon'} />
                {v[0].toUpperCase() + v.slice(1)}
              </label>
            ))}
          </fieldset>
          {isAdmin.value && (
            <fieldset class="gm-seg">
              <legend>Preview as</legend>
              {([null, 'member', 'coach'] as const).map((v) => (
                <label key={String(v)} class={`gm-seg-opt ${preview.value === v ? 'gm-seg-on' : ''}`}>
                  <input type="radio" name="gm-preview" checked={preview.value === v} onChange={() => (preview.value = v)} />
                  {v ? v[0].toUpperCase() + v.slice(1) : 'Admin'}
                </label>
              ))}
            </fieldset>
          )}
          <Button
            variant="quiet"
            icon="help"
            onClick={() => {
              setOpen(false);
              onHelp();
            }}
          >
            Help and shortcuts
          </Button>
          <Button variant="quiet" icon="logout" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const list = toasts.value;
  return (
    <div class="gm-toasts" aria-live="polite" role="region" aria-label="Notifications">
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
function ToastItem({ t }: { t: (typeof toasts.value)[number] }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(UNDO_MS);
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const h = setTimeout(() => dismissToast(t.id), left.current);
    return () => {
      clearTimeout(h);
      left.current -= Date.now() - start;
    };
  }, [paused]);
  return (
    <div
      class={`gm-toast ${t.tone === 'error' ? 'gm-toast-error' : ''}`}
      data-toast
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusIn={() => setPaused(true)}
      onFocusOut={() => setPaused(false)}
    >
      <span>{t.text}</span>
      {t.undo && (
        <Button icon={t.undo.label === 'Reload' ? 'refresh' : 'arrow-back-up'} onClick={() => runUndo(t)}>
          {t.undo.label === 'Reload' ? 'Reload' : 'Undo'}
        </Button>
      )}
      <Button variant="quiet" icon="x" class="gm-iconbtn" aria-label="Dismiss" onClick={() => dismissToast(t.id)} />
    </div>
  );
}

// ---------- keyboard ----------
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
};
function useGlobalKeys(setHelp: (b: boolean) => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        const sheet = document.querySelector('[data-sheet-close]') as HTMLElement | null;
        if (document.querySelector('.gm-helppanel')) return setHelp(false);
        if (sheet) return sheet.click();
        if (document.querySelector('[data-toast]')) return (toasts.value = []);
        if (typing(e)) return;
        if (location.pathname !== '/' && history.length > 1) history.back();
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || !shortcuts.value) return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('gm-search')?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
      } else window.dispatchEvent(new CustomEvent('gm-key', { detail: e.key }));
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const HelpBody = Help;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector('h2')?.focus();
    return () => opener?.focus?.();
  }, []);
  return (
    <div class="gm-helppanel" role="dialog" aria-modal="false" aria-label="Help" ref={ref}>
      <div class="gm-sheet-head">
        <h2 tabIndex={-1}>Help</h2>
        <Button variant="quiet" icon="x" class="gm-iconbtn" aria-label="Close help" onClick={onClose} />
      </div>
      <Suspense fallback={<p>Loading</p>}>
        <HelpBody panel />
      </Suspense>
    </div>
  );
}
