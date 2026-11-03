import { shortcuts, setShortcuts } from '../state/session';
import { STATUS } from '../lib/status';
import { CONN_META } from '../lib/connections';
import { Icon } from '../components/ui';
import { useTitle } from '../app';

export default function Help({ panel }: { panel?: boolean }) {
  if (!panel) useTitle('Help');
  const H = panel ? 'h3' : 'h2';
  return (
    <div class={panel ? 'gm-help' : 'gm-page gm-narrow gm-help'}>
      {!panel && <h1>How Greenmech works</h1>}
      <H>Modules and status</H>
      <p>Each module of the machine has one leader and moves through four steps. The pattern on a bay tells you its step even without colour.</p>
      <ul class="gm-legend-list">
        {STATUS.map((s, i) => (
          <li key={s.key}><span class={`gm-swatch gm-swatch-${s.key}`} aria-hidden="true" /><Icon name={s.icon} /><strong>{s.word}</strong>
            <span class="gm-quiet">{['dotted outline: an idea, nobody has planned it yet', 'dashed outline: being planned', 'hatched: being built', 'solid forest: finished'][i]}</span></li>
        ))}
      </ul>
      <p>Take an unled module with <strong>Take it</strong>. Only the leader changes status, purpose, plan, ports and model. Anyone on the team can add ideas and flags. Flags are doubts and improvements, marked with a small red dot.</p>
      <H>Tiers</H>
      <p>The drawing is a front view of the tower. Tier 1 is the bottom. New modules start in Unplaced until the admin gives them a tier in Manage.</p>
      <H>Connections and Locked</H>
      <p>A connection is where module A feeds module B. It stays <strong>Locked</strong> until both modules are Done, and it names the module it waits for. Then it becomes Ready, In progress and Connected. If A sends something B does not take (for example spin into push), it also shows <strong>Adapter needed</strong>.</p>
      <ul class="gm-legend-list">
        {Object.values(CONN_META).sort((a, b) => a.rank - b.rank).map((c) => <li key={c.word}><Icon name={c.icon} /><strong>{c.word}</strong></li>)}
        <li><Icon name="alert-triangle" /><strong>Adapter needed</strong></li>
      </ul>
      <H>Keyboard</H>
      <table class="gm-table gm-keys">
        <tbody>
          <tr><td><kbd>/</kbd></td><td>Search</td></tr>
          <tr><td><kbd>?</kbd></td><td>Help</td></tr>
          <tr><td><kbd>1</kbd> to <kbd>4</kbd></td><td>Set status on a module page you lead</td></tr>
          <tr><td><kbd>[</kbd> and <kbd>]</kbd></td><td>Previous and next module</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close search, then the side panel, then the message, then go back</td></tr>
        </tbody>
      </table>
      <label class="gm-check">
        <input type="checkbox" checked={shortcuts.value} onChange={(e) => setShortcuts(e.currentTarget.checked)} />
        Single-key shortcuts on
      </label>
      <p class="gm-quiet">Shortcuts never fire while you type in a field.</p>
      <H id="gmm">Model files: GMM v1</H>
      <p>A module model is one SVG file under 40 KB, drawn as a technical front view in a 400 by 300 box with 20 units of margin. Lines use <code>stroke="currentColor"</code> and <code>fill="none"</code>, so the drawing follows light and dark mode. No scripts, links, images or gradients.</p>
      <p>It needs these groups: <code>envelope</code> (the dashed bounds), <code>parts</code> (one group per part), <code>ports</code> (a circle per connection point, ids like <code>in-1</code> and <code>out-1</code>), <code>labels</code>, and <code>&lt;metadata id="gmm"&gt;</code> with the JSON block. Name the file after the module, like <code>lift-arm.svg</code>.</p>
      <p>On a module page, <strong>Copy AI drawing prompt</strong> gives you a prompt with the module's name, purpose and ports filled in. Never invent sizes: measure the real module.</p>
    </div>
  );
}
