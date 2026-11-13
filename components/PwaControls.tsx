import { useEffect, useRef, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaControls({ onConnectivityChange }: {
  onConnectivityChange(online: boolean): void;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [mobile] = useState(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const [standalone, setStandalone] = useState(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [helpOpen, setHelpOpen] = useState(false);
  const deferredInstall = useRef<InstallEvent | null>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const changed = () => {
      setOnline(navigator.onLine);
      onConnectivityChange(navigator.onLine);
    };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, [onConnectivityChange]);

  useEffect(() => {
    if (!mobile) return;

    const installAvailable = (event: Event) => {
      event.preventDefault();
      deferredInstall.current = event as InstallEvent;
    };
    const installed = () => {
      deferredInstall.current = null;
      setStandalone(true);
      setHelpOpen(false);
    };
    window.addEventListener('beforeinstallprompt', installAvailable);
    window.addEventListener('appinstalled', installed);
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.webmanifest';
    document.head.append(manifest);
    return () => {
      window.removeEventListener('beforeinstallprompt', installAvailable);
      window.removeEventListener('appinstalled', installed);
      manifest.remove();
    };
  }, [mobile]);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (helpOpen) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [helpOpen]);

  const install = async () => {
    if (!deferredInstall.current) {
      setHelpOpen(true);
      return;
    }
    const event = deferredInstall.current;
    deferredInstall.current = null;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setStandalone(true);
    } catch {
      setHelpOpen(true);
    }
  };

  const showInstall = mobile && !standalone;

  return <>
    {(!online || showInstall) && <div className="pwa-tools">
      {!online && <p role="status" className="pwa-notice"><WifiOff size={18} aria-hidden="true" /> 当前离线，可编辑指令；联网后再生成图片。</p>}
      {showInstall && <button ref={returnFocus} type="button" className="pwa-button install-button" onClick={install}><Download size={16} aria-hidden="true" />添加到主屏幕</button>}
    </div>}
    {showInstall && <dialog ref={helpRef} className="install-dialog" aria-labelledby="install-heading" onCancel={() => setHelpOpen(false)} onClose={() => { setHelpOpen(false); returnFocus.current?.focus(); }}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="install-heading" className="text-xl font-bold">把片场放进口袋</h2>
        <button type="button" className="icon-button" aria-label="关闭安装说明" onClick={() => setHelpOpen(false)}><X size={20} /></button>
      </div>
      <p className="mt-4 leading-relaxed">iPhone / iPad：用 Safari 打开，点击“分享”，选择“添加到主屏幕”。</p>
      <p className="mt-3 leading-relaxed">Android：在 Chrome 菜单中选择“安装应用”或“添加到主屏幕”。</p>
      <p className="mt-4 text-sm opacity-70">首次联网打开后即可离线进入页面；AI 生成和编辑需要网络。成片请及时保存到相册。</p>
    </dialog>}
  </>;
}
