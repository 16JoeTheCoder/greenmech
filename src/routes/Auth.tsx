import { useEffect, useState } from 'preact/hooks';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, USE_EMU } from '../state/firebase';
import { user, signIn, signOut, authError, signInFixture } from '../state/session';
import { Button } from '../components/ui';

export function SignIn() {
  useEffect(() => { document.title = 'Sign in · Greenmech'; }, []);
  const [email, setEmail] = useState('member1@test.example');
  return (
    <main id="main" class="gm-auth">
      <h1>Greenmech</h1>
      <p class="gm-lede">The team's plan for the chain-reaction machine: who builds which module, what is done, and which modules are ready to join.</p>
      <Button variant="primary" onClick={() => signIn()}>Sign in with Google</Button>
      {authError.value && <p class="gm-error" role="alert">{authError.value}</p>}
      <p class="gm-quiet">Only accounts on the team list can open the app. Sign in, and if you are not on the list yet you can ask to join.</p>
      {USE_EMU && (
        <form class="gm-addline" onSubmit={(e) => { e.preventDefault(); signInFixture(email); }}>
          <label class="gm-label">Emulator fixture email
            <input class="gm-input" name="fixture" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <Button type="submit">Sign in as fixture</Button>
        </form>
      )}
    </main>
  );
}

export function Access() {
  const u = user.value!;
  const [sent, setSent] = useState<'no' | 'yes' | 'sending'>('no');
  const [name, setName] = useState((u.displayName ?? '').split(' ')[0]);
  const [err, setErr] = useState('');
  useEffect(() => {
    document.title = 'Not on the team list · Greenmech';
    getDoc(doc(db, 'accessRequests', u.uid)).then((s) => s.exists() && setSent('yes')).catch(() => {});
  }, []);
  const send = async (e: Event) => {
    e.preventDefault();
    setSent('sending');
    try {
      await setDoc(doc(db, 'accessRequests', u.uid), { email: u.email, displayName: name.trim().slice(0, 60), requestedAt: serverTimestamp() });
      setSent('yes');
    } catch (x) {
      setSent('no');
      setErr(`The request did not go through (${(x as { code?: string }).code ?? 'error'}). Check the connection and try again.`);
    }
  };
  return (
    <main id="main" class="gm-auth">
      <h1>Not on the team list</h1>
      <p>You are signed in as:</p>
      <input class="gm-input gm-mono" readOnly value={u.email ?? ''} aria-label="Your signed-in email" onFocus={(e) => e.currentTarget.select()} />
      {sent === 'yes' ? (
        <p role="status">Request sent. The admin will add you; reload this page after they tell you.</p>
      ) : (
        <form onSubmit={send} class="gm-addline">
          <label class="gm-label">Your name, as the team knows you
            <input class="gm-input" required maxLength={60} value={name} placeholder="Ayu" onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <Button type="submit" variant="primary" disabled={sent === 'sending'}>Ask to join</Button>
        </form>
      )}
      {err && <p class="gm-error" role="alert">{err}</p>}
      <Button variant="quiet" icon="logout" onClick={() => signOut()}>Use another account</Button>
    </main>
  );
}
