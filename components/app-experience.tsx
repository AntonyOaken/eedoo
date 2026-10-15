'use client';

import { useEffect, useState, useRef } from 'react';
import { Download, X, Share } from 'lucide-react';

import { MIN_LAUNCH_MS, launchPhase } from '@/lib/launch-state';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function AppExperience() {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const photo = useRef<HTMLImageElement>(null);
  const phase = launchPhase(minimumElapsed, appReady && assetsReady && pageReady);
  const launching = phase !== 'finished';
  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), MIN_LAUNCH_MS);
    const ready = () => setAppReady(true);
    const loaded = () => setPageReady(true);
    window.addEventListener('eedoo:ready', ready);
    window.addEventListener('load', loaded);
    if (window.__eedooAppReady) ready();
    if (document.readyState === 'complete') loaded();
    let active = true;
    const image = photo.current;
    const picture = image?.decode ? image.decode().catch(() => {}) : Promise.resolve();
    const font = document.fonts?.load('500 64px Outfit', 'eedoo').catch(() => {});
    void Promise.all([picture, font]).then(() => { if (active) setAssetsReady(true); });
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('eedoo:ready', ready);
      window.removeEventListener('load', loaded);
    };
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-launching', launching);
    const sizeLaunch = () => {
      const installed = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      const portrait = window.matchMedia('(orientation: portrait)').matches;
      const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const height = installed ? Math.max(window.innerHeight, screenHeight) : window.innerHeight;
      document.documentElement.style.setProperty('--launch-viewport-height', `${height}px`);
    };
    if (launching) sizeLaunch();
    window.addEventListener('resize', sizeLaunch);
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (shell) shell.inert = launching;
    return () => { window.removeEventListener('resize', sizeLaunch); document.documentElement.style.removeProperty('--launch-viewport-height'); if (shell) shell.inert = false; document.documentElement.removeAttribute('data-launching'); };
  }, [launching]);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!installed) {
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      try { setDismissed(sessionStorage.getItem('poputi-install-dismissed') === '1'); } catch { setDismissed(false); }
    }
    const capture = (event: Event) => { event.preventDefault(); if (!installed) setPrompt(event as InstallPrompt); };
    const complete = () => { setPrompt(null); setIos(false); setInstructions(false); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* Installation remains available without offline support. */ });
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);
  const dismiss = () => { setDismissed(true); setInstructions(false); try { sessionStorage.setItem('poputi-install-dismissed', '1'); } catch {} };
  const install = async () => {
    if (!prompt) { setInstructions(true); return; }
    try { await prompt.prompt(); const choice = await prompt.userChoice; setPrompt(null); if (choice.outcome === 'accepted') dismiss(); } catch { setPrompt(null); }
  };
  return <>
    {launching && <div className="app-launch" role="status" aria-label="Загружаем EEDOO"><img ref={photo} className="launch-photo" src="/launch/saint-isaacs-portrait.jpeg" alt="" fetchPriority="high"/><div className="launch-shade"/><strong className="launch-title">eedoo</strong>{phase === 'loading' && <div className="launch-progress"><span className="launch-spinner" aria-hidden="true"/><span className="sr-only">Загружаем карту…</span></div>}</div>}
    {!launching && !dismissed && (prompt || ios) && <aside className="install-card" aria-label="Установка приложения">
      <button className="install-dismiss" onClick={dismiss} aria-label="Закрыть подсказку"><X size={18}/></button>
      {instructions ? <><strong>EEDOO на главном экране</strong><p>Откройте меню браузера <Share size={15} aria-label="Поделиться"/>, выберите «На экран Домой» и нажмите «Добавить». Если этого пункта нет, откройте сайт в Safari.</p></> : <><strong>Город ближе с EEDOO</strong><p>Запускайте прогулки с главного экрана.</p><button className="install-action" onClick={() => void install()}><Download size={17}/>Установить приложение</button></>}
    </aside>}
  </>;
}
