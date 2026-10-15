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
