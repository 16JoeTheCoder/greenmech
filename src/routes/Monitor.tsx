import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { collection, getDocs, limit, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../state/firebase';
import { live, liveConns, byId, flagsByModule, config } from '../state/data';
import { STATUS } from '../lib/status';
import { effective } from '../lib/connections';
import { ago, daysSince } from '../lib/time';
import type { Activity } from '../lib/types';
import { Button, Icon, Slug } from '../components/ui';
import { Headline } from './Modules';
import { useTitle } from '../app';

export default function Monitor() {
  useTitle('Monitor');
  const [acts, setActs] = useState<Activity[] | null>(null);
  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - 14 * 86400000);
    getDocs(query(collection(db, 'activity'), where('at', '>=', since), orderBy('at', 'desc'), limit(30))).then(
      (s) => setActs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity)),
      () => setActs([]),
    );
  }, []);
  const ms = live.value;
  const stale = config.value.staleDays;
  const attention: { key: string; node: preact.JSX.Element }[] = [];
  for (const m of ms) {
    if (!m.leaderUid)
      attention.push({
        key: `l${m.id}`,
        node: (
          <>
            <Link href={`/m/${m.slug}`} class="gm-slug">
              {m.slug}
            </Link>{' '}
            has no leader.
          </>
        ),
      });
    if ((m.status === 1 || m.status === 2) && daysSince(m.updatedAt) > stale)
      attention.push({
        key: `s${m.id}`,
        node: (
          <>
            <Link href={`/m/${m.slug}`} class="gm-slug">
              {m.slug}
            </Link>{' '}
            is {STATUS[m.status].word} with no update in {Math.floor(daysSince(m.updatedAt))} days.
          </>
        ),
      });
    const n = flagsByModule.value.get(m.id);
    if (n)
      attention.push({
        key: `f${m.id}`,
        node: (
          <>
            <Link href={`/m/${m.slug}`} class="gm-slug">
              {m.slug}
            </Link>{' '}
            has {n} open flag{n > 1 ? 's' : ''}.
          </>
        ),
      });
  }
  for (const c of liveConns.value)
    if (effective(c, byId.value.get(c.aId), byId.value.get(c.bId)).state === 'ready')
      attention.push({
        key: `c${c.id}`,
        node: (
          <>
            <Link href={`/c/${c.slug}`} class="gm-slug">
              {c.slug}
            </Link>{' '}
            is ready to connect.
          </>
        ),
      });
  return (
    <div class="gm-page gm-monitor">
      <div class="gm-titlerow">
        <Headline />
        <Button variant="quiet" icon="download" class="gm-noprint" onClick={() => print()}>
          Print progress report
        </Button>
      </div>
      <section aria-labelledby="board-h" class="gm-section">
        <h2 id="board-h">Status board</h2>
        <div class="gm-board">
          {STATUS.map((s, i) => {
            const col = ms.filter((m) => m.status === i);
            return (
              <section key={s.key} class="gm-board-col" aria-label={`${s.word}, ${col.length}`}>
                <h3>
                  <Icon name={s.icon} />
                  {s.word} <span class="gm-quiet">{col.length}</span>
                </h3>
                <ul>
                  {col.map((m) => (
                    <li key={m.id}>
                      <Link href={`/m/${m.slug}`} class="gm-slug">
                        {m.slug}
                      </Link>
                      <span class="gm-quiet">
                        {m.leaderInitials ?? 'no leader'} · updated {ago(m.updatedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="att-h" class="gm-section">
        <h2 id="att-h">Needs attention</h2>
        {attention.length === 0 ? (
          <p class="gm-quiet">Nothing needs attention.</p>
        ) : (
          <ul class="gm-entries">
            {attention.map((a) => (
              <li key={a.key}>{a.node}</li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="act-h" class="gm-section">
        <h2 id="act-h">Activity, last 14 days</h2>
        {acts === null ? (
          <p class="gm-quiet">Loading activity</p>
        ) : acts.length === 0 ? (
          <p class="gm-quiet">No activity in the last 14 days.</p>
        ) : (
          <ul class="gm-activity">
            {acts.map((a) => (
              <li key={a.id}>
                <span class="gm-initials">{a.actorInitials}</span> {a.summary} <span class="gm-quiet">· {ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
void Slug;
