'use client';

import { useEffect, useState } from 'react';
import styles from './NoticePopup.module.css';

interface Props {
  title: string;
  action: string;
  onAction: () => void;
  rememberKey?: string;
  highlighted?: boolean;
}

export default function NoticePopup({ title, action, onAction, rememberKey, highlighted = false }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (rememberKey && sessionStorage.getItem(rememberKey)) return;
    } catch { /* 저장소를 차단한 브라우저에서도 닫을 수 있다. */ }
    const timer = window.setTimeout(() => setVisible(true), 1000);
    return () => window.clearTimeout(timer);
  }, [rememberKey]);

  function dismiss() {
    setVisible(false);
    try { if (rememberKey) sessionStorage.setItem(rememberKey, '1'); } catch {}
  }

  if (!visible) return null;
  return (
    <aside className={styles.space} aria-label="알림">
      <div className={highlighted ? `${styles.popup} ${styles.event}` : styles.popup}>
        {highlighted ? <span className={styles.beacon} aria-hidden="true" /> : <div className={styles.wave} aria-hidden="true"><i /><i /><i /><i /><i /></div>}
        <button className={styles.open} onClick={() => { dismiss(); onAction(); }}>
          <strong>{title}</strong><span>{action} <span className="nav-chevron" aria-hidden="true">›</span></span>
        </button>
        <button className={styles.close} onClick={dismiss} aria-label="알림 닫기">×</button>
      </div>
    </aside>
  );
}
