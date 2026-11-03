import { render } from 'preact';
import { Router } from 'wouter-preact';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/app.css';
import { startSession } from './state/session';
import { App } from './app';
import { registerSW } from 'virtual:pwa-register';
import { offerUpdate } from './state/data';

startSession();
render(
  <Router>
    <App />
  </Router>,
  document.getElementById('app')!,
);

const update = registerSW({ onNeedRefresh: () => offerUpdate(() => update(true)) });
