'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, Compass } from 'lucide-react';

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function AppExperience() {
  const [launching, setLaunching] = useState(true);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    // The server-rendered brand remains visible until React is ready; no artificial delay.
    setLaunching(false);
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
    {launching && <div className="app-launch" role="status" aria-label="Загружаем EEDOO"><Compass size={68} strokeWidth={1.5}/><strong>EEDOO</strong><span>Открывайте город в своём темпе</span></div>}
    {!dismissed && (prompt || ios) && <aside className="install-card" aria-label="Установка приложения">
      <button className="install-dismiss" onClick={dismiss} aria-label="Закрыть подсказку"><X size={18}/></button>
      {instructions ? <><strong>EEDOO на главном экране</strong><p>Откройте меню браузера <Share size={15} aria-label="Поделиться"/>, выберите «На экран Домой» и нажмите «Добавить». Если этого пункта нет, откройте сайт в Safari.</p></> : <><strong>Город ближе с EEDOO</strong><p>Запускайте прогулки с главного экрана.</p><button className="install-action" onClick={() => void install()}><Download size={17}/>Установить приложение</button></>}
    </aside>}
  </>;
}
