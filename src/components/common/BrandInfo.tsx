'use client';

import { useId, useRef } from 'react';
import styles from './BrandInfo.module.css';

export default function BrandInfo({ onHomeClick }: { onHomeClick?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return <>
    <button type="button" className={styles.brand} aria-haspopup="dialog"
      aria-label="원산지증명서 소개" onClick={() => dialog.current?.showModal()}>
      <span className={styles.mark} aria-hidden="true"><i /><i /><i /></span>
      원산지증명서 <span className={`nav-chevron ${styles.arrow}`} aria-hidden="true">›</span>
    </button>
    <dialog ref={dialog} className={`discard-dialog ${styles.about}`} aria-labelledby={titleId}>
      <div className="sheet-title">
        <h2 id={titleId}>원산지증명서 소개</h2>
        <button type="button" onClick={() => dialog.current?.close()}>닫기</button>
      </div>
      <dl>
        <dt>제작자</dt><dd>MC</dd>
        <dt>만든 이유</dt>
        <dd>같은 말도 지역마다 끝맺는 소리가 달라요. 평소엔 잘 듣지 못하는 내 말버릇을 짧은 녹음으로 발견하고, 친구들과 서로의 표현을 비교해 볼 수 있게 만들었어요.</dd>
      </dl>
      {onHomeClick && <button className="intro-primary-action" onClick={() => {
        dialog.current?.close();
        onHomeClick();
      }}>첫 화면으로</button>}
    </dialog>
  </>;
}
