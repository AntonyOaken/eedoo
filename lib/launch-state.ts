export const MIN_LAUNCH_MS = 3000;
export function launchPhase(minimumElapsed: boolean, ready: boolean) {
  return !minimumElapsed ? 'intro' : ready ? 'finished' : 'loading';
}

export function signalAppReady() {
  window.__eedooAppReady = true;
  window.dispatchEvent(new Event('eedoo:ready'));
}

declare global {
  interface Window { __eedooAppReady?: boolean }
}
