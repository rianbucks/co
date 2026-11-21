'use client';

import { useRef, useState } from 'react';
import { checkNickname } from '@/lib/ranking/nickname';
import styles from './NicknameInvite.module.css';

export default function NicknameInvite({ nickname, onStart }: {
  nickname: string;
  onStart: (nickname: string) => void;
}) {
  const [draft, setDraft] = useState(nickname);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  return (
    <form data-enter="2" className={styles.card} aria-labelledby="apply-title" onSubmit={event => {
      event.preventDefault();
      if (!draft.trim()) return onStart('');
      const checked = checkNickname(draft);
      if (checked.ok) return onStart(checked.value);
      setError(checked.problem === 'length' ? '닉네임은 2~10자로 입력해 주세요.' : '한글, 영문, 숫자만 쓸 수 있어요.');
      input.current?.focus();
    }}>
      <div>
        <h2 id="apply-title">감정 신청</h2>
      </div>
      <div className={styles.controls}>
        <label htmlFor="home-nickname">닉네임 <small>(선택)</small></label>
        <input ref={input} id="home-nickname" autoComplete="off" value={draft}
          placeholder="한글, 영문, 숫자 2~10자" aria-invalid={Boolean(error)}
          aria-describedby={error ? 'nickname-error' : undefined}
          onChange={event => { setDraft(event.target.value); setError(''); }} />
        <button type="submit">{draft.trim() ? '감정 신청하기' : '랭킹 등록 없이 감정 신청하기'}</button>
        {error && <small id="nickname-error" role="alert">{error}</small>}
      </div>
    </form>
  );
}
