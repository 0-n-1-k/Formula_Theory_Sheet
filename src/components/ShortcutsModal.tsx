import React from 'react';

export interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: ReadonlyArray<{
  heading: string;
  items: ReadonlyArray<{ keys: string[]; label: string }>;
}> = [
  {
    heading: 'SEARCH & NAVIGATION',
    items: [
      { keys: ['/', 'Ctrl+K'], label: 'Focus search bar (or Fullscreen HUD search)' },
      { keys: ['j', '↓'], label: 'Move to next search result / HUD card' },
      { keys: ['k', '↑'], label: 'Move to previous search result / HUD card' },
      { keys: ['Enter'], label: 'Jump to / pin active result card' },
      { keys: ['?'], label: 'Toggle this Keyboard Shortcuts overlay' },
      { keys: ['Esc'], label: 'Close modal, clear search, or exit HUD/fullscreen' },
    ],
  },
  {
    heading: 'ACTIVE RECALL FLASHCARD QUIZ',
    items: [
      { keys: ['Space'], label: 'Reveal answer, derivation steps, and context' },
      { keys: ['S'], label: 'Skip card and move to end of queue' },
      { keys: ['1'], label: 'Needs Review (auto-star & re-queue soon)' },
      { keys: ['2'], label: 'Got It (mark learned & advance)' },
    ],
  },
  {
    heading: 'PRACTICE PDF READER',
    items: [
      { keys: ['F5'], label: 'Toggle Fullscreen Practice PDF Reader' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  return (
    <div
      className={`fcm${open ? ' open' : ''}`}
      id="shortcutsModal"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      aria-hidden={!open}
      inert={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="fcb shortcuts-modal-box">
        <div className="shortcuts-modal-head">
          <div className="fc-modal-head-left">
            <span className="modal-eyebrow">KEYBOARD SHORTCUTS</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            id="shortcutsModalClose"
            aria-label="Close Keyboard Shortcuts"
            data-tip="Close (Esc)"
            data-tip-tone="neutral"
            onClick={onClose}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" />
            </svg>
          </button>
        </div>

        <div className="shortcuts-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.heading} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.heading}</div>
              <div className="shortcuts-list">
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut-row">
                    <span className="shortcut-desc">{item.label}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((k, idx) => (
                        <React.Fragment key={k}>
                          {idx > 0 ? <span className="shortcut-or">/</span> : null}
                          <kbd className="shortcut-kbd">{k}</kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
