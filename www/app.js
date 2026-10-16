/* App-only additions for the iPhone/iPad build of Quiet, Please.
   - Over-the-air updates: checks a small JSON file you host and downloads a newer
     copy of the game in the background. Nothing here runs in a web browser.
   - Hides co-op, which needs claude.ai's live room and is not available in the app. */
(function () {
  // Where the update manifest lives. The "Publish game update" workflow writes it.
  // If your GitHub repository has a different name or owner, change this one line.
  const UPDATE_MANIFEST_URL = 'https://jameshollers-art.github.io/quiet-please/latest.json';

  const $ = id => document.getElementById(id);
  const Cap = window.Capacitor;
  const isApp = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

  // Co-op talks through claude.ai, so it can't work inside the app.
  if (!window.claude) {
    const b = $('coopBtn');
    if (b) b.hidden = true;
  }

  // Small version label on the day card so testers can say which build they have.
  const card = $('startOv') && $('startOv').querySelector('.card');
  const verEl = document.createElement('div');
  verEl.className = 'small';
  verEl.id = 'appVersion';
  verEl.style.marginTop = '-14px';
  if (card) card.appendChild(verEl);
  function showVersion(text) { verEl.textContent = text; }

  if (!isApp) { showVersion('Web version'); return; }

  // ---- Game Center: achievements and leaderboards ----
  // Achievement IDs in App Store Connect are "qp.ach.<game id>"; leaderboards below.
  const GC = (Cap.Plugins && Cap.Plugins.GameCenter) || (Cap.registerPlugin && Cap.registerPlugin('GameCenter'));
  const LEADERBOARDS = { rating: 'qp.lb.bestrating', shelved: 'qp.lb.booksshelved' };
  let gcReady = false, gcFirst = true, gcBusy = false;
  const gcReported = new Set(), gcScores = {};
  function readSave() { try { return JSON.parse(localStorage.getItem('qp-save-v1')) || {}; } catch (e) { return {}; } }
  async function gcSync() {
    if (!gcReady || gcBusy) return;
    gcBusy = true;
    try {
      const save = readSave();
      const ids = Object.keys(save.ach || {}).filter(id => !gcReported.has(id));
      if (ids.length) {
        // Catch-up on first sign-in is silent; new unlocks after that show Apple's banner.
        await GC.reportAchievements({ ids: ids.map(id => 'qp.ach.' + id), banner: !gcFirst });
        ids.forEach(id => gcReported.add(id));
      }
      gcFirst = false;
      const best = Math.max(0, ...Object.values(save.best || {}).map(Number).filter(n => !isNaN(n)));
      const shelved = (save.tot && save.tot.shelved) || 0;
      for (const [key, value] of [['rating', best], ['shelved', shelved]]) {
        if (value > 0 && gcScores[key] !== value) {
          await GC.submitScore({ leaderboard: LEADERBOARDS[key], score: Math.round(value) });
          gcScores[key] = value;
        }
      }
    } catch (e) {
      // Offline or Game Center unavailable: try again after the next shift.
    } finally {
      gcBusy = false;
    }
  }
  function addGameCenterButton() {
    const row = $('startOv') && $('startOv').querySelector('.btnrow');
    if (!row || $('gcBtn')) return;
    const b = document.createElement('button');
    b.className = 'btn ghost'; b.id = 'gcBtn'; b.type = 'button'; b.textContent = 'Game Center';
    b.addEventListener('click', () => { GC.showDashboard().catch(() => {}); });
    row.appendChild(b);
  }
  if (GC) {
    GC.signIn().then(r => {
      gcReady = !!(r && r.authenticated);
      if (gcReady) { addGameCenterButton(); gcSync(); }
    }).catch(() => {});
    // Report after every shift (the shift report or day card is showing).
    let wasBetween = false;
    setInterval(() => {
      const between = ($('endOv') && !$('endOv').hidden) || ($('startOv') && !$('startOv').hidden);
      if (between && !wasBetween) gcSync();
      wasBetween = between;
    }, 1500);
  }

  const Updater = (Cap.Plugins && Cap.Plugins.CapacitorUpdater) || (Cap.registerPlugin && Cap.registerPlugin('CapacitorUpdater'));
  if (!Updater) { showVersion('App version'); return; }

  // Tell the updater this copy of the game started fine. If a downloaded update
  // ever fails to start, the app rolls back to the last good version on its own.
  Updater.notifyAppReady().catch(() => {});

  // "Update ready" pill, shown only between shifts so nobody loses a shift in progress.
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.id = 'updatePill';
  pill.hidden = true;
  pill.textContent = 'Update ready · Restart';
  pill.style.cssText = 'position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:9;' +
    'font:800 13px system-ui,-apple-system,sans-serif;background:#3f8a5c;color:#fff;border:0;border-radius:999px;padding:9px 14px;box-shadow:0 6px 18px rgba(0,0,0,.4)';
  document.body.appendChild(pill);
  let readyBundle = null;
  pill.addEventListener('click', () => {
    if (!readyBundle) return;
    pill.textContent = 'Restarting…';
    Updater.set({ id: readyBundle.id }).catch(() => { pill.textContent = 'Update ready · Restart'; });
  });
  setInterval(() => {
    const between = ($('startOv') && !$('startOv').hidden) || ($('endOv') && !$('endOv').hidden);
    pill.hidden = !(readyBundle && between);
  }, 1000);

  let checking = false, lastCheck = 0;
  async function checkForUpdate() {
    if (checking || Date.now() - lastCheck < 60 * 1000) return;
    checking = true; lastCheck = Date.now();
    try {
      const cur = await Updater.current();
      const curVersion = cur && cur.bundle ? cur.bundle.version : 'builtin';
      showVersion('App ' + (cur && cur.native ? cur.native : '') + ' \u00b7 game ' + (curVersion === 'builtin' ? 'as installed' : curVersion));
      const res = await fetch(UPDATE_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const m = await res.json();
      if (!m || typeof m.version !== 'string' || typeof m.url !== 'string') return;
      if (m.version === curVersion) return;
      if (readyBundle && readyBundle.version === m.version) return;
      const bundle = await Updater.download({ url: m.url, version: m.version });
      await Updater.next({ id: bundle.id }); // also applies by itself the next time the app is reopened
      readyBundle = bundle;
    } catch (e) {
      // Offline or the manifest isn't published yet: try again later.
    } finally {
      checking = false;
    }
  }
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
})();
