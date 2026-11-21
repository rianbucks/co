'use client';

import { useRef, useState, type FormEvent } from 'react';
import { checkNickname } from '@/lib/ranking/nickname';
import styles from './NicknameInvite.module.css';

export default function NicknameInvite({ nickname, onStart, onStartGyeongsang }: {
  nickname: string;
  onStartGyeongsang: (nickname: string) => void;
  onStart: (nickname: string) => void;
}) {
  const [draft, setDraft] = useState(nickname);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const start = submitter instanceof HTMLButtonElement && submitter.value === 'gyeongsang' ? onStartGyeongsang : onStart;
    if (!draft.trim()) return start('');
    const checked = checkNickname(draft);
    if (checked.ok) return start(checked.value);
    setError(checked.problem === 'length' ? '닉네임은 2~10자로 입력해 주세요.' : '한글, 영문, 숫자만 쓸 수 있어요.');
    input.current?.focus();
  }

  return (
    <form data-enter="2" className={styles.card} aria-labelledby="apply-title" onSubmit={submit}>
      <div>
        <h2 id="apply-title">감정 신청</h2>
      </div>
      <div className={styles.controls}>
        <label htmlFor="home-nickname">랭킹 닉네임 <small>(선택)</small></label>
        <div className={styles.field}>
          <input className="nickname-input" ref={input} id="home-nickname" autoComplete="off" value={draft}
          placeholder="한글, 영문, 숫자 2~10자" aria-invalid={Boolean(error)}
          aria-describedby={error ? 'nickname-hint nickname-error' : 'nickname-hint'}
          onChange={event => { setDraft(event.target.value); setError(''); }} />
          <p id="nickname-hint" className={styles.hint}>닉네임 없이도 감정을 시작할 수 있어요.</p>
        </div>
        <button type="submit">일반 감정 시작</button>
        <button className={styles.regional} type="submit" value="gyeongsang">
          경상권 정밀 감정
        </button>
        {error && <small id="nickname-error" role="alert">{error}</small>}
      </div>
    </form>
  );
}
