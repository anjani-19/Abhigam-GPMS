import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share } from 'lucide-react';

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 24 * 60 * 60 * 1000) {
      return;
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // On iOS mobile browsers, show after 3 seconds if not installed
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3500);
      return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <>
      <div className="mobile-install-banner">
        <div className="install-banner-content">
          <div className="install-banner-icon">
            <Smartphone size={22} color="#ffffff" />
          </div>
          <div className="install-banner-text">
            <strong>Install Anumathi App</strong>
            <span>Add to home screen for faster 1-tap mobile access</span>
          </div>
        </div>
        <div className="install-banner-actions">
          <button className="btn-install-app" onClick={handleInstallClick}>
            <Download size={14} /> Install
          </button>
          <button className="btn-dismiss-banner" onClick={handleDismiss} title="Dismiss">
            <X size={16} />
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div className="ios-modal-overlay" onClick={() => setShowIOSGuide(false)}>
          <div className="ios-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>Install on iPhone / iPad</h4>
              <button onClick={() => setShowIOSGuide(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#64748b" />
              </button>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>
              To install this application on your iOS device:
            </p>
            <ol style={{ fontSize: '0.85rem', color: '#334155', paddingLeft: '1.25rem', lineHeight: 1.6, marginTop: 8 }}>
              <li>Tap the <strong>Share</strong> button <Share size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> in Safari.</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
              <li>Tap <strong>"Add"</strong> in the top right corner.</li>
            </ol>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => setShowIOSGuide(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
