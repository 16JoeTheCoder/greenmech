// Runs before first paint (external file: the CSP forbids inline script). Theme is the only localStorage use besides shortcuts.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('gm-theme') || 'system'; } catch (e) { /* storage blocked */ }
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    var p = document.documentElement.getAttribute('data-theme-pref') || pref;
    document.documentElement.setAttribute('data-theme', p === 'system' ? (mq.matches ? 'dark' : 'light') : p);
  }
  document.documentElement.setAttribute('data-theme-pref', pref);
  apply();
  mq.addEventListener('change', apply);
})();
