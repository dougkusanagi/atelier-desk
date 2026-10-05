export function registerOfflineShell() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              window.dispatchEvent(
                new CustomEvent('atelier-update-available', { detail: registration }),
              );
          });
        });
      })
      .catch(() => {
        /* Editing remains usable when browser policy prevents installation. */
      });
  });
}
