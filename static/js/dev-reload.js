// Dev-only live reload (served + injected only when BERUANG_DEV=1).
// Polls /__dev_version (same-origin: allowed by connect-src 'self')
// and reloads the page when the static tree changes. Vanilla, zero-build.
(function () {
  async function current() {
    var res = await fetch('/__dev_version', { cache: 'no-store' });
    if (!res.ok) throw new Error('dev version unavailable');
    return await res.text();
  }
  var seen = null;
  async function poll() {
    try {
      var next = await current();
      if (seen !== null && next !== seen) {
        window.location.reload();
        return;
      }
      seen = next;
    } catch (e) {
      // Server restarting (cargo watch) — keep polling.
    }
    window.setTimeout(poll, 1000);
  }
  poll();
})();
