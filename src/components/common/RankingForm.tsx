import type { FormEventHandler, ReactNode } from 'react';
import { NICKNAME_MAX_LENGTH } from '@/lib/ranking/nickname';

interface RankingFormProps {
  inputId: string;
  nickname: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  disabled: boolean;
  error?: string;
  disclosure?: ReactNode;
  action: string;
}

export default function RankingForm({ inputId, nickname, onChange, onSubmit, disabled, error, disclosure, action }: RankingFormProps) {
  const length = [...nickname.normalize('NFC').trim()].length;
  return (
    <form onSubmit={onSubmit} className="mt-3 grid gap-3" noValidate>
      <div>
        <label htmlFor={inputId} className="text-sm font-medium text-zinc-300">
          랭킹 닉네임{!disclosure && ' (선택)'}
        </label>
        <input id={inputId} value={nickname} onChange={event => onChange(event.target.value)}
          placeholder="한글, 영문, 숫자 2~10자" aria-describedby={`${inputId}-help`}
          autoComplete="off" spellCheck={false} disabled={disabled}
          className="nickname-input mt-2 disabled:opacity-60" />
        <div id={`${inputId}-help`} className="mt-1.5 flex justify-between text-xs text-zinc-400">
          <span>띄어쓰기와 기호는 쓸 수 없어요.</span>
          <span className={length > NICKNAME_MAX_LENGTH ? 'text-red-400' : ''}>{length}/{NICKNAME_MAX_LENGTH}</span>
        </div>
      </div>
      {disclosure ? <div className="rounded-2xl border border-zinc-800/60 p-4 text-xs text-zinc-400">{disclosure}</div>
        : <p className="ranking-form-hint">닉네임은 선택이에요. 감정 후 랭킹에 공개할지 정할 수 있어요.</p>}
      {error && <div role="alert" className="text-sm text-red-300">{error}</div>}
      <button type="submit" disabled={disabled} className="ranking-form-action bg-white disabled:opacity-60">{action}</button>
    </form>
  );
}
