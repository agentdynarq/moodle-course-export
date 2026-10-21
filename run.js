// MOODLE COURSE EXPORT LOADER
// Picks the right script for the page you are on:
// a module page (course/view.php) gets the single module download,
// any other Moodle page (Dashboard, home) gets the master download of every module.
(() => {
  const VERSION = 'v1.0.0';
  const BASE = `https://cdn.jsdelivr.net/gh/agentdynarq/moodle-course-export@${VERSION}/`;
  if (!(window.M && M.cfg && M.cfg.wwwroot)) { alert('Open your Moodle site and sign in first.'); return; }
  const file = location.pathname.endsWith('/course/view.php') ? 'single.js' : 'master.js';
  fetch(BASE + file, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(code => new Function(code)())
    .catch(e => alert(`Could not load the downloader: ${e.message}`));
})();
