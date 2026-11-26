import React, { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallProps {
  onInstalled?: () => void;
  onCloseMenu?: () => void;
}

export const PWAInstallMenuItem: React.FC<PWAInstallProps> = ({
  onInstalled,
  onCloseMenu,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      onCloseMenu?.();
      if (accepted) {
        onInstalled?.();
      }
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    setShowIOSGuide(true);
  };

  return (
    <>
      <button
        type="button"
        className="dropdown-item"
        role="menuitem"
        id="pwaInstallMenuBtn"
        onClick={handleInstallClick}
      >
        <span>{isIOS ? 'Install Offline App (iOS)' : 'Install Offline App (PWA)'}</span>
        <span className="ntype-badge">{isInstallable ? 'APP' : 'PWA'}</span>
      </button>

      {showIOSGuide ? (
        <div
          className="fcm open pwa-guide-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Install Offline App Guide"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowIOSGuide(false);
            }
          }}
        >
          <div className="fcb pwa-guide-card">
            <div className="pwa-guide-head">
              <span className="ntype-badge">INSTALL OFFLINE PWA</span>
              <button
                type="button"
                className="sb-btn"
                onClick={() => setShowIOSGuide(false)}
              >
                [X CLOSE]
              </button>
            </div>
            {isIOS ? (
              <div className="pwa-guide-body">
                <p>Add this sheet to your iPhone or iPad Home Screen for zero-latency offline revision:</p>
                <ol>
                  <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> to launch in standalone offline mode.</li>
                </ol>
              </div>
            ) : (
              <div className="pwa-guide-body">
                <p>Install this app for offline access in exam corridors and on flaky hostel Wi-Fi:</p>
                <ol>
                  <li>Open your browser address bar or menu (Chrome / Edge / Brave).</li>
                  <li>Select <strong>Install App</strong> or <strong>Add to Home Screen</strong>.</li>
                  <li>All formulas, theorems, and KaTeX fonts stay cached locally.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
};

export const PWAInstallHeaderBtn: React.FC<{ onInstalled?: () => void }> = ({
  onInstalled,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (isInstalled || !isInstallable) {
    return null;
  }

  return (
    <button
      type="button"
      id="pwaHeaderInstallBtn"
      className="pwa-header-install-btn"
      data-tip="Install Offline App"
      data-tip-tone="course"
      aria-label="Install Offline App"
      onClick={async () => {
        const accepted = await install();
        if (accepted) {
          onInstalled?.();
        }
      }}
    >
      [INSTALL]
    </button>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="offline-status-banner" role="status" aria-live="polite">
      <span className="offline-status-dot" aria-hidden="true" />
      <span>OFFLINE MODE // SERVING CACHED REFERENCE</span>
    </div>
  );
};
