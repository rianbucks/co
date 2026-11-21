import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import fg from 'fast-glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
  const root = path.resolve(__dirname, '..');
  const srcCss = `@import "tailwindcss";

:root {
  color-scheme: dark;
  --paper: #091426;
  --glass-fill: linear-gradient(125deg, #91bcff13, transparent 54%), linear-gradient(160deg, #1f3653c9, #11233bcc);
  --glass-edge: #93bdff3d;
  --glass-shadow: inset 0 1px 0 #dfedff20, 0 6px 22px #030b172e;
  --sheet: #172a43;
  --ink: #f2f4f6;
  --muted: #b9c2ca;
  --quiet: #89949d;
  --rule: #354860;
  --accent: #85b5ff;
  --accent-strong: #2467d4;
  --accent-soft: #1d304c;
}

html, body { background: var(--paper); }
body {
  min-height: 100vh;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

.app-shell { isolation: isolate; background: radial-gradient(ellipse 85% 520px at 88% 2%, #23467099, transparent), radial-gradient(ellipse 75% 620px at 0% 62%, #15385b88, transparent), var(--paper); color: var(--ink); }
.app-shell, .app-shell * { font-family: inherit; }
.app-frame {
  width: min(100%, 984px);
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.app-header {
  border-color: var(--rule);
  background: #12181d;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.app-header-nav { gap: 20px; }
.app-header-link,
.app-header-step {
  border: 0 !important;
  background: transparent !important;
  padding: 4px 0 !important;
  box-shadow: none !important;
}
.app-shell button.app-header-link { padding-inline: 10px !important; }
.app-header-link { color: var(--muted); }
.app-header-link:hover { color: var(--ink); }
.app-header-step { color: var(--quiet); }
.app-footer { border-color: var(--rule); color: var(--quiet); }

/* 한 가지 문서 재질, 하나의 직인색으로 모든 단계의 화면을 묶는다. */
.app-shell [class*="rounded-3xl"] {
  border-color: var(--rule) !important;
  border-radius: 14px !important;
  background-image: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.app-shell [class*="rounded-2xl"][class*="border"] {
  border-color: var(--rule) !important;
  border-radius: 10px !important;
}
.app-shell [class*="bg-zinc-900"],
.app-shell [class*="bg-zinc-950"] {
  background-color: var(--sheet) !important;
  background-image: none !important;
}
.app-shell [class*="bg-black"] { background-color: #12171b !important; background-image: none !important; }
.app-shell [class*="from-zinc-900"],
.app-shell [class*="to-zinc-950"],
.app-shell [class*="bg-gradient"] { background-image: none !important; }
.app-shell [class*="border-zinc-700"],
.app-shell [class*="border-zinc-800"],
.app-shell [class*="border-zinc-900"],
.app-shell [class*="border-white/"] { border-color: var(--rule) !important; }
.app-shell [class*="border-indigo-"],
.app-shell [class*="border-purple-"],
.app-shell [class*="border-sky-"] { border-color: color-mix(in srgb, var(--accent) 42%, transparent) !important; }

.app-shell [class~="text-white"],
.app-shell [class*="text-zinc-100"],
.app-shell [class*="text-zinc-200"] { color: var(--ink) !important; }
.app-shell [class*="text-zinc-300"] { color: #d3dbe1 !important; }
.app-shell [class*="text-zinc-400"],
.app-shell [class*="text-slate-400"] { color: var(--muted) !important; }
.app-shell [class*="text-zinc-500"],
.app-shell [class*="text-zinc-600"] { color: var(--quiet) !important; }
.app-shell [class*="text-indigo-"],
.app-shell [class*="text-purple-"],
.app-shell [class*="text-sky-"] { color: var(--accent) !important; }
.app-shell [class*="text-red-"] { color: #e59a91 !important; }
.app-shell [class*="text-amber-"] { color: #e2c47f !important; }
.app-shell [class*="text-emerald-"] { color: #91c9aa !important; }
.app-shell [class*="bg-indigo-"],
.app-shell [class*="bg-purple-"],
.app-shell [class*="bg-sky-"] { background-color: var(--accent-soft) !important; }
.app-shell [class*="bg-red-"] { background-color: #382426 !important; }
.app-shell [class*="bg-amber-"] { background-color: #342f23 !important; }
.app-shell [class*="bg-emerald-"] { background-color: #203128 !important; }

.app-shell main h1 { font-size: clamp(30px, 4.5vw, 50px) !important; font-weight: 500 !important; line-height: 1.28 !important; }
.app-shell main h2 { font-size: 20px !important; font-weight: 500 !important; line-height: 1.4 !important; }
.app-shell main h3 { font-size: 16px !important; font-weight: 500 !important; line-height: 1.5 !important; }
.app-shell [class~="text-xs"] { font-size: 12px !important; line-height: 1.45 !important; }
.app-shell [class~="text-sm"] { font-size: 14px !important; line-height: 1.45 !important; }
.app-shell [class~="text-base"] { font-size: 16px !important; line-height: 1.5 !important; }
.app-shell [class~="text-lg"] { font-size: 18px !important; line-height: 1.5 !important; }
.app-shell [class~="text-xl"] { font-size: 20px !important; line-height: 1.45 !important; }
.app-shell [class~="text-2xl"] { font-size: 24px !important; line-height: 1.35 !important; }
.app-shell [class~="text-3xl"] { font-size: 30px !important; line-height: 1.3 !important; }
.app-shell [class~="text-4xl"] { font-size: 38px !important; line-height: 1.25 !important; }
.app-shell [class~="text-5xl"] { font-size: 46px !important; line-height: 1.2 !important; }
.app-shell [class*="text-[9px]"],
.app-shell [class*="text-[10px]"],
.app-shell [class*="text-[11px]"] { font-size: 12px !important; line-height: 1.45 !important; }
.app-shell [class*="font-bold"], .app-shell [class*="font-extrabold"] { font-weight: 600 !important; }
.app-shell strong { font-weight: 600; }

.app-shell button { border-radius: var(--button-radius, 12px) !important; }
.app-shell main button {
  min-height: 44px;
  border-radius: var(--button-radius, 12px) !important;
  border-color: var(--rule);
  box-shadow: none !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  line-height: 1.35 !important;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
}
.app-shell main button,
.app-shell main button * {
  font-size: 15px !important;
  line-height: 1.35 !important;
}
.app-shell main button[class~="bg-white"],
.app-shell main button[class*="bg-indigo-500"],
.app-shell main button.intro-primary-action {
  border-color: var(--accent-strong) !important;
  background: var(--accent-strong) !important;
  color: #fffdf8 !important;
}
.app-shell main button[class~="bg-white"]:hover,
.app-shell main button[class*="bg-indigo-500"]:hover,
.app-shell main button.intro-primary-action:hover { background: #1959bd !important; }
.app-shell main button[class*="bg-zinc-800"] {
  border-color: var(--rule) !important;
  background: #20272d !important;
  color: var(--ink) !important;
}
.app-shell main button.secondary-action-button {
  min-height: 46px;
  border: 1px solid var(--rule) !important;
  background: #171d22 !important;
  color: var(--muted) !important;
}
.app-shell main button.secondary-action-button:hover {
  border-color: #53616b !important;
  background: #20272d !important;
  color: var(--ink) !important;
}
.app-shell main button:hover { background-color: #20272d; }
.app-shell main button:active { transform: translateY(1px); }
.app-shell :is(input, textarea) {
  border-color: var(--rule) !important;
  border-radius: 8px !important;
  background: var(--sheet) !important;
  color: var(--ink) !important;
}
.app-shell :is(button, input, textarea):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.app-shell [class*="shadow-"] { box-shadow: none !important; }
.app-shell [class*="animate-pulse"],
.app-shell [class*="animate-ping"] { animation: none !important; }
.app-shell [class*="blur-3xl"] { display: none !important; }
.app-shell [class*="bg-gradient-to-t"] { background-image: none !important; background-color: var(--accent) !important; }
.app-shell mark { background: var(--accent-soft) !important; color: var(--accent) !important; }

/* S1을 제외한 화면은 같은 너비, 카드 재질, 여백, 버튼 높이로 맞춘다. */
.screen-glass { width: min(100%, 984px); margin-inline: auto; padding: 18px 20px !important; }
.screen-glass > .grid { gap: 14px !important; }
.screen-glass [class*="rounded-3xl"]:not([role="alert"]) {
  padding: 16px !important;
  border: 1px solid var(--rule) !important;
  border-radius: 14px !important;
  background: var(--glass-fill) !important;
  border-color: var(--glass-edge) !important;
  box-shadow: var(--glass-shadow) !important;
}
.screen-glass > [role="alert"] { border-radius: 12px !important; }
.screen-glass button { min-height: 44px; font-size: 14px; font-weight: 500; }
.screen-glass button[class~="bg-white"] {
  border: 1px solid var(--accent-strong) !important;
  background: var(--accent-strong) !important;
  color: #f5f8fb !important;
}
.screen-glass button[class~="bg-white"]:hover { background: #1959bd !important; }
.screen-glass button[class*="bg-zinc-800"] {
  border: 1px solid var(--rule) !important;
  background: #20272d !important;
  color: var(--ink) !important;
}
.record-question-index { color: var(--accent); font-size: 14px; font-weight: 600; }
.record-target { color: var(--muted); font-size: 14px; }
.record-target strong { margin-left: 8px; color: var(--ink); font-weight: 500; }
.app-shell main button.recording-live-button {
  position: relative;
  min-height: 46px;
  overflow: hidden;
  border: 1px solid #c85c57;
  background: #853b38;
  color: #fff !important;
  animation: recording-button-pulse 1.05s ease-in-out infinite;
  transition: transform 120ms ease;
}
.recording-live-label { position: relative; z-index: 1; font-size: 15px; font-weight: 500; line-height: 1.35; }
.app-shell main button.recording-live-button:active { transform: translateY(1px); animation-play-state: paused; }
.judging-indicator { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border: 1px solid var(--rule); border-radius: 50%; background: #12171b; color: #e59a91; font-size: 20px; }
.judging-spinner { width: 18px; height: 18px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
.judging-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.result-eyebrow, .ranking-eyebrow { color: var(--accent); font-size: 14px; font-weight: 500; }
@keyframes recording-button-pulse {
  0%, 100% { background-color: #753331; }
  50% { background-color: #a94742; }
}
@media (prefers-reduced-motion: reduce) { .app-shell main button.recording-live-button, .judging-spinner { animation: none; } }
@media (max-width: 640px) {
  .screen-glass { padding: 14px !important; }
  .screen-glass [class*="rounded-3xl"]:not([role="alert"]) { padding: 14px !important; }
}

/* 홈과 녹음은 좁은 화면에서도 첫 동작이 한눈에 들어오게 구성한다. */
.app-shell { letter-spacing: -.018em; }
.intro-masthead { background: transparent; }
.app-header { background: #0c192ce8; backdrop-filter: blur(14px); }
.app-header, .intro-masthead { padding: 4px 20px; border-bottom: 0; }
.intro-masthead, .studio-heading, .judging-title { display: flex; align-items: center; justify-content: space-between; }
.app-shell .wordmark { font-size: 18px; font-weight: 750; letter-spacing: -.055em; }
.app-header button, .intro-masthead button { min-height: 44px; }
.app-shell main button.ranking-link { color: var(--muted); padding: 0 10px; }
.ranking-link span { margin-left: 3px; color: var(--quiet); }
.intro-layout { display: grid; grid-template-columns: 1.22fr 1fr; gap: 16px; padding: 12px 16px; align-items: start; }
.intro-copy { position: relative; isolation: isolate; overflow: hidden; border-radius: 14px; padding: 16px; background: linear-gradient(118deg, #202d45, #182233 78%); }
.intro-meta, .studio-target, .studio-heading > span { color: #adcaff; font-size: 14px; font-weight: 600; }
.app-shell .intro-copy h1 { position: relative; margin: 6px 0 4px; word-break: keep-all; font-size: clamp(25px, 3.3vw, 36px) !important; font-weight: 720 !important; letter-spacing: -.065em; line-height: 1.12 !important; }
.intro-description { font-size: 15px; color: #d4dce8; line-height: 1.45; word-break: keep-all; }
.intro-meta { display: flex; align-items: center; justify-content: space-between; }
.intro-wave { width: 90px; height: 24px; display: flex; align-items: center; justify-content: flex-end; gap: 2px; overflow: hidden; }
.intro-wave i { flex: 1; min-width: 1px; border-radius: 4px; background: #689ef0; opacity: .72; }
.intro-wave i:nth-child(3n) { background: #a4c7ff; }
.intro-primary-action { min-height: 46px; padding: 10px 18px; }
.intro-copy .intro-primary-action { margin-top: 12px; width: 100%; }
.intro-info { padding: 3px 0; }
.app-shell .intro-info h2 { font-size: 17px !important; font-weight: 650 !important; }
.intro-steps li { display: grid; grid-template-columns: 22px auto; align-items: baseline; gap: 6px; margin-top: 9px; }
.intro-steps li > span { color: var(--accent); font-weight: 700; font-size: 19px; font-variant-numeric: tabular-nums; line-height: 1.2; }
.intro-steps h3 { display: inline; }
.app-shell .intro-steps h3 { font-size: 15px !important; font-weight: 650 !important; }
.intro-steps h3 { margin-right: 6px; }
.intro-steps p { display: inline; }
.intro-steps p, .intro-regions p { color: var(--muted); font-size: 14px; line-height: 1.4; }
.intro-regions { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--rule); }

.desktop-intro-details { display: none; }
@media (min-width: 1024px) {
  .intro-layout {
    grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr);
    gap: 22px 28px;
    padding: clamp(16px, 3vh, 30px) 20px 20px;
  }
  .intro-copy { padding: 20px; }
  .intro-info { align-self: center; }
  .desktop-intro-details {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: start;
    padding-top: 16px;
  }
  .app-shell .desktop-intro-details h2 { font-size: 18px !important; font-weight: 650 !important; }
  .question-preview ol { margin-top: 8px; }
  .question-preview li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
    padding-block: clamp(10px, 1.6vh, 18px);
    border-top: 1px solid var(--rule);
  }
  .preview-number { color: var(--accent); font-size: 17px; font-variant-numeric: tabular-nums; font-weight: 650; }
  .question-preview p { margin-top: 3px; color: var(--muted); font-size: 15px; word-break: keep-all; }
  .intro-reference { display: grid; gap: 16px; }
  .ranking-heading, .grade-list li { display: flex; align-items: baseline; gap: 10px; }
  .ranking-heading { align-items: center; justify-content: space-between; }
  .ranking-heading button { color: var(--accent); padding-inline: 6px; }
  .ranking-message { color: var(--muted); font-size: 14px; }
  .grade-list { margin-top: 6px; }
  .grade-list li { border-top: 1px solid var(--rule); padding-block: 7px; font-size: 14px; }
  .grade-list strong { color: var(--accent); white-space: nowrap; }
  .grade-list small { margin-left: auto; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
}

/* 높이가 넉넉한 모니터는 남는 공간을 본문 위아래로 나눈다. */
@media (min-width: 1024px) and (min-height: 850px) {
  .intro-page { min-height: 100svh; display: flex; flex-direction: column; }
  .intro-layout { width: 100%; margin-block: auto; }
}

.consent-screen, .studio-screen { width: min(100%, 600px); margin-inline: auto; padding: 14px 16px; }
.app-shell .consent-screen h1, .app-shell .studio-screen h1 { font-size: clamp(22px, 3vw, 28px) !important; letter-spacing: -.045em; line-height: 1.28 !important; font-weight: 680 !important; word-break: keep-all; }
.consent-list {
  display: grid;
  gap: 16px;
  margin: 14px 0 10px;
  padding: 18px;
  border-radius: 16px;
  background: var(--glass-fill);
}
.consent-list > div { display: grid; gap: 3px; }
.consent-list dt { color: #d5e8ff; font-size: 15px; font-weight: 650; }
.consent-list dd { color: var(--muted); font-size: 14px; line-height: 1.55; word-break: keep-all; }
.studio-hint { color: var(--muted); font-size: 14px; line-height: 1.45; }
.consent-check { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 15px; cursor: pointer; }
.consent-check input { width: 19px; height: 19px; accent-color: var(--accent-strong); }
.flow-actions { display: grid; grid-template-columns: 1fr 2.4fr; gap: 8px; margin-top: 10px; }
.app-shell button:disabled { opacity: .48; cursor: not-allowed; }
.consent-error { color: #ffaca8; font-size: 14px; margin-block: 8px; }
.studio-heading button { padding: 0 8px; color: var(--muted); }
.question-progress { display: flex; gap: 4px; }
.question-progress i { flex: 1; height: 3px; background: var(--rule); border-radius: 3px; }
.question-progress .filled { background: var(--accent); }
.studio-target { margin: 10px 0 3px; }
.studio-hint { margin-top: 6px; }
.studio-meter { display: grid; align-items: center; grid-template-columns: auto 1fr; gap: 8px 24px; margin: 10px 0 8px; padding: 8px 12px; border-radius: 12px; background: var(--sheet); }
.studio-meter time { font-variant-numeric: tabular-nums; font-size: 27px; font-weight: 650; }
.studio-wave { display: flex; align-items: center; justify-content: flex-end; gap: 3px; height: 35px; }
.studio-wave i { width: 4px; min-height: 3px; border-radius: 4px; background: var(--accent); }
.studio-meter progress { width: 100%; height: 4px; grid-column: 1 / -1; accent-color: var(--accent); }
.studio-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(135px, 100%), 1fr)); gap: 6px; }
.judging-panel { max-width: 480px; margin: 0 auto; }
.judging-title { justify-content: start; gap: 8px; }
.judging-panel p { margin: 4px 0 12px; color: var(--muted); font-size: 14px; }
.judging-panel li { display: flex; gap: 10px; align-items: baseline; padding: 8px 0; color: var(--muted); border-bottom: 1px solid var(--rule); }
.judging-panel li[aria-current] { color: var(--accent); font-weight: 650; }
.probability-row { display: grid; grid-template-columns: minmax(7em, auto) minmax(30px, 1fr) 4ch; align-items: center; gap: 8px; padding-block: 3px; }
.probability-row > :last-child { text-align: right; font-variant-numeric: tabular-nums; }
.certificate-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.certificate-tools button { padding-inline: 12px; }
.certificate-tools button:first-child { margin-right: auto; }
.answer-detail { border-bottom: 1px solid var(--rule); padding-bottom: 4px; }
.answer-detail summary { cursor: pointer; padding: 10px 2px; font-size: 14px; }
.answer-detail summary > span:first-child { margin-right: 6px; }
.app-shell main button.ranking-form-action {
  width: 100%; min-height: 44px; padding: 10px 14px;
  font-size: 15px !important; font-weight: 600 !important; line-height: 1.4 !important;
}
.app-shell main .ranking-form-hint { color: var(--muted); font-size: 13px; line-height: 1.5; }
.app-shell main .ranking-card-title {
  margin: 0; text-align: left; color: var(--ink);
  font-size: clamp(21px, 2.5vw, 25px) !important; font-weight: 650 !important;
  line-height: 1.35 !important; letter-spacing: -.035em; word-break: keep-all;
}
.app-shell input.nickname-input {
  display: block; width: 100%; min-width: 0; height: 44px; padding-inline: 12px;
  background: linear-gradient(155deg, #87baff20, transparent 65%), #12273bc9 !important;
  border: 1px solid var(--glass-edge) !important; border-radius: 10px !important;
  box-shadow: inset 0 1px 0 #d4e7ff26; font-size: 16px;
}
.app-shell input.nickname-input::placeholder { color: var(--muted); }
@media (prefers-reduced-motion: no-preference) {
  .nickname-input:placeholder-shown:not(:focus):enabled { animation: nickname-invite 1.5s ease-in-out 1; }
  @keyframes nickname-invite { 50% { box-shadow: 0 0 0 3px #91bfff44; } }
}
.ranking-list { display: grid; gap: 8px; }
.ranking-list > .ranking-entry { padding: 10px 12px; }
.ranking-list > .ranking-entry, .ranking-glow {
  border: 1px solid var(--rank-edge, #466588);
  border-radius: 14px;
  background: linear-gradient(135deg, #80baff19, transparent 60%), #142941cc;
  box-shadow: inset 0 1px 0 #d8eaff17, 0 2px 12px var(--rank-halo, #4299ff12);
}
.ranking-list > [data-mine], .ranking-glow[data-mine] {
  --rank-edge: #86b5f0; --rank-halo: #67aaff35;
}
.ranking-rows { margin-top: 8px; }
.ranking-rows li { border: 0; border-bottom: 1px solid var(--rule); border-radius: 0 !important; background: transparent !important; padding: 8px 2px; }
@media (max-width: 1023px) { .ranking-first { order: -1; } }
.discard-dialog { position: fixed; inset: 0; margin: auto; width: min(380px, calc(100% - 32px)); height: fit-content; padding: 24px; border: 1px solid #495761; border-radius: 14px; background: var(--sheet); color: var(--ink); }
.discard-dialog::backdrop { background: rgb(6 9 12 / 76%); }
.discard-dialog p { margin-block: 10px 20px; color: var(--muted); }
.discard-actions { display: flex; gap: 8px; }
.discard-actions button { flex: 1; padding: 8px; }
@media (max-width: 760px) {
  .intro-layout { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 4px 18px 12px; }
  .intro-copy { padding: 12px; }
  .intro-info { padding: 0 4px; }
  .intro-copy .intro-primary-action { margin-top: 12px; }

  .intro-steps li { margin-top: 7px; }

  .app-header, .intro-masthead { padding-inline: 16px; }
  .consent-screen, .studio-screen { padding: 8px 12px; }
  .discard-dialog { inset: auto 0 0; width: 100%; max-width: 100%; border-radius: 16px 16px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}

/* 녹음 테이프의 릴과 창은 화면 너비에 비례해 함께 줄어든다. */
.intro-copy { grid-column: 1 / -1; background: #253deb; color: white; padding: clamp(20px, 3vw, 36px); }
.intro-copy .intro-meta { color: #e0e6ff; }
.app-shell .intro-copy h1 { margin-block: 9px; font-size: clamp(42px, 6.2vw, 76px) !important; line-height: .99 !important; letter-spacing: -.07em; }
.intro-copy h1 em { font-style: normal; color: #d8ff8b; }
.intro-description { color: white; max-width: 55%; }
.cassette {
  position: absolute; right: 6%; top: 48%; width: 34%; aspect-ratio: 1.58;
  transform: translateY(-50%) rotate(-11deg); border-radius: 6% / 10%;
  background: linear-gradient(155deg,#f0ffbe 2%,#c4e68e 53%,#8db773);
  box-shadow: inset 0 2px 0 #fcffdc, inset 0 -4px 0 #86a86a, 2px 7px 0 #627c55, 9px 18px 20px #162c9e99;
}
.cassette::before { content: ""; position: absolute; inset: 4%; background: radial-gradient(circle at 1% 2%, #53694c 1%,transparent 1.5%),radial-gradient(circle at 99% 2%,#53694c 1%,transparent 1.5%),radial-gradient(circle at 1% 98%,#53694c 1%,transparent 1.5%),radial-gradient(circle at 99% 98%,#53694c 1%,transparent 1.5%); }
.cassette-label { position: absolute; inset: 9% 6% 28%; border-radius: 5%; background: linear-gradient(170deg,#f6f2d6 65%,#fd835b 65% 75%,#2a48ab 75%); }
.cassette-label i { display: block; width: 77%; margin: 4% auto 0; border-top: 1px solid #9f9f85; }
.cassette-window { position: absolute; inset: 32% 14% 40%; display: flex; align-items: center; justify-content: space-around; background: #28302c; border-radius: 40px; }
.cassette-window b { height: 78%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle,#2e322b 18%,transparent 20%),repeating-conic-gradient(#dce2d1 0 43deg,#72796c 45deg 60deg); }
.cassette-window span { width: 29%; height: 50%; background: linear-gradient(110deg,#645b4e,#a79d83 50%,#433e34); }
.cassette-lip { position: absolute; inset: 78% 18% 1%; clip-path: polygon(8% 0,92% 0,100% 100%,0 100%); background: radial-gradient(circle at 17% 67%,#465941 3%,transparent 4%),radial-gradient(circle at 83% 67%,#465941 3%,transparent 4%),#a7c87d; }
.intro-choices { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.app-shell main .intro-choices .intro-primary-action { margin: 0; width: auto; padding-inline: 28px; background: #ecffd1 !important; color: #1d321b !important; }
.preview-trigger { padding-inline: 12px; color: white; border: 1px solid #ffffff70; }
.app-shell main .preview-trigger:hover { background: #152b96; }
.intro-info { grid-column: 1/-1; }
.grade-disclosure summary { padding-block: 12px; cursor: pointer; border-top: 1px solid var(--rule); font-weight: 600; }
@media (min-width: 761px) {
 .intro-info { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr); align-items: start; gap: 20px; }
 .intro-steps { display: flex; gap: 16px; }
 .intro-steps li { flex: 1; }
 .intro-steps p { display: block; }
 .intro-regions { display: block; margin: 0; padding: 0; border: 0; }
}
.app-shell main .question-link { min-height: 44px; text-align: left; font-weight: 650 !important; }
.question-link span { color: var(--accent); }
.question-preview li { padding-block: 4px; align-items: baseline; }
.sheet-title, .question-picker { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.sheet-title button { color: var(--muted); padding-inline: 10px; }
.question-picker { padding: 4px; margin-top: 12px; border-radius: 12px; background: var(--paper); }
.question-picker button { flex: 1; color: var(--muted); }
.question-picker button[aria-pressed="true"] { background: #304767; color: white; }
.preview-prompt { padding-block: 18px; }
.preview-prompt strong { color: var(--accent); font-size: 14px; }
.preview-sheet .preview-prompt p { margin: 5px 0 0; font-size: 19px; line-height: 1.45; color: var(--ink); word-break: keep-all; }
.preview-sheet > .intro-primary-action { width: 100%; }
.discard-dialog { max-height: 85dvh; overscroll-behavior: contain; }
body:has(.discard-dialog[open]) { overflow: hidden; }
@media (prefers-reduced-motion: no-preference) {
  [data-enter], .discard-dialog[open] > * {
    animation: panel-enter 400ms cubic-bezier(.2,.75,.25,1) var(--enter-delay, 0ms) backwards;
  }
  [data-enter="2"], .discard-dialog[open] > :nth-child(2) { --enter-delay: 85ms; }
  [data-enter="3"], .discard-dialog[open] > :nth-child(n+3) { --enter-delay: 170ms; }
  [data-enter="4"] { --enter-delay: 255ms; }
  [data-enter="5"] { --enter-delay: 340ms; }
  @keyframes panel-enter {
    from { opacity: .12; translate: 0 14px; }
    to { opacity: 1; translate: 0 0; }
  }
  @media (max-width: 1023px) {
    .ranking-first[data-enter] { --enter-delay: 0ms; }
    [data-enter]:has(+ .ranking-first) { --enter-delay: 85ms; }
  }
  .discard-dialog[open] { animation: sheet-enter .28s ease-out; }
  @keyframes sheet-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
}
@media (max-width: 760px) {
  .intro-copy { padding: 16px; }
  .cassette { right: 5%; top: 60px; transform: rotate(-11deg); width: min(32%, 160px); }
  .intro-description { max-width: 100%; padding-top: 5px; }
  .intro-choices button { flex: 1; }
  .intro-choices { margin-top: 10px; }
}

/* 반사광은 글자와 조작부 뒤에만 둔다. */
.intro-copy {
  background: radial-gradient(ellipse at 87% 12%, #778df6 0%, transparent 46%),
    linear-gradient(115deg, #17264b, #284fc5 57%, #5375db);
  border: 1px solid #92a9ff66;
  box-shadow: inset 0 1px 0 #e5efff55;
}
.intro-copy::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: linear-gradient(118deg, transparent 47%, #e8f5ff17 47.4%, #e8f5ff03 60%, transparent 60.5%); }
.cassette::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(125deg, transparent 30%, #fff9 31%, #fff2 40%, transparent 41%, #fff4 64%, transparent 65%); }
.mobile-shortcuts { display: none; }
.discard-dialog { background: #1b2638f5; border-color: #b4d6ff45; box-shadow: inset 0 1px 0 #ffffff26, 0 16px 65px #0006; }
@supports (backdrop-filter: blur(12px)) {
  .discard-dialog { background: #192539e6; backdrop-filter: blur(16px); }
  .discard-dialog::backdrop { background: #080e1ba8; backdrop-filter: blur(4px); }
}
.sheet-grades, .sheet-guide { margin-block: 12px 18px; }
.sheet-grades li { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: baseline; padding-block: 8px; border-bottom: 1px solid var(--rule); font-size: 14px; }
.sheet-grades strong, .sheet-guide strong { color: var(--accent); }
.sheet-grades small { white-space: nowrap; }
.sheet-guide ol { list-style: decimal inside; }
.sheet-guide li { padding: 6px 0; }
@media (min-width: 1024px) {
  .app-frame:has(.intro-page) { width: min(100%, 1320px); }
  .intro-layout { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 20px; margin-block: 0; }
  .intro-copy { grid-column: 1; align-self: stretch; padding: clamp(20px, 2.6vw, 36px); }
  .intro-info { grid-column: 2; display: block; align-self: center; }
  .intro-steps { display: grid; gap: 2px; }
  .intro-info .intro-regions { margin-top: 12px; display: flex; }
  .intro-copy .cassette { right: 4%; top: 43%; width: 33%; }
  .intro-copy .intro-choices { max-width: 68%; }
  .desktop-intro-details { padding-top: 18px; }
  .intro-reference { gap: 22px; }
  .question-preview li { padding-block: clamp(6px, 1.2vh, 15px); }
}
@media (max-width: 760px) {
  .intro-copy { display: grid; grid-template-columns: minmax(0, 1fr) minmax(65px, 28%); align-items: center; gap: 6px 8px; }
  .intro-copy .intro-meta { grid-column: 1; }
  .app-shell .intro-copy h1 { grid-column: 1; grid-row: 2; margin: 0; font-size: clamp(34px, 9vw, 46px) !important; }
  .intro-copy .cassette { position: relative; inset: auto; grid-column: 2; grid-row: 1 / 3; width: 92%; }
  .intro-description, .intro-choices { grid-column: 1 / -1; }
  .intro-description { padding: 0; }
  .intro-choices { margin: 4px 0 0; }
  .intro-info { display: none; }
  .mobile-shortcuts { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
  .mobile-shortcuts button { display: flex; justify-content: space-between; align-items: center; padding-inline: 12px; color: var(--ink); background: #202731; }
  .mobile-shortcuts span { color: var(--muted); }
  .discard-dialog { padding-top: 12px; }
}

.question-preview, .intro-reference > section, .studio-meter, .judging-panel {
  border-radius: 16px;
  border: 1px solid var(--glass-edge);
  background: var(--glass-fill);
  box-shadow: var(--glass-shadow);
  padding: 14px 16px;
}
.app-shell button:enabled { cursor: pointer; }
.app-shell .nav-chevron { display: inline-block; }
.app-shell button:has(.nav-chevron) { min-width: 44px; min-height: 44px; padding-inline: max(10px, .65em); }

@media (hover: hover) and (pointer: fine) {
  .app-shell button:enabled:hover {
    box-shadow: inset 0 0 0 100vmax rgb(173 205 255 / 10%) !important;
  }
  .app-shell button:enabled:has(.nav-chevron):hover {
    box-shadow: inset 0 0 0 1px #b3d3ff50, inset 0 0 0 100vmax #9cc5ff20 !important;
  }
}
.app-shell button:enabled:is(:active, [data-pressed]),
.app-shell button:enabled:has(.nav-chevron):is(:active, [data-pressed]) {
  box-shadow: inset 0 0 0 2px #b6d7ff95, inset 0 0 0 100vmax #a5cdff33 !important;
}
.app-shell button:focus-visible { outline: 2px solid #abcfff; outline-offset: 2px; }


/*
 * 녹음 화면(S3): 휴대폰 한 화면에 안내, 문장, 녹음 시작 버튼이 들어오게 한다.
 * - 녹음(S3)과 심사(S4) 중에는 머리글 탭 줄을 누를 수 없으므로 휴대폰에서는 숨긴다(hide-header-tabs).
 *   :has()를 지원하지 않는 브라우저는 탭 줄과 문항 카드 위치가 전과 같다.
 * - 문항 카드와 오류 안내는 탭 줄을 숨겨 낮아진 머리글(약 74px) 바로 아래로 올린다.
 * - 타이머 상자는 lg:rounded-3xl 때문에 위 규칙의 20px 여백을 받는다. 휴대폰에서는 원래 여백(px-4 py-2.5)으로 둔다.
 * - 정밀 감정 5번의 흉내 상자는 표지를 점선 테두리 위에 얹는다. 표지 바탕은 문항 카드 바탕과 같다.
 */
@media (max-width: 640px) {
  .app-shell:has(.hide-header-tabs) .app-header-tabs { display: none; }
  .app-shell:has(.hide-header-tabs) .record-card { scroll-margin-top: 76px; }
  .app-shell:has(.hide-header-tabs) .judging-error-panel { scroll-margin-top: 84px; }
  .screen-glass .record-timer[class*="rounded-3xl"]:not([role="alert"]) { padding: 10px 16px !important; }
}
.app-shell figure.record-quote[class*="border"] { border-color: #5b6872 !important; }
.record-quote-label { background: var(--sheet); }

.intro-page { color: var(--ink); }
.intro-masthead, .intro-wordmark, .intro-record-heading, .intro-edition, .intro-regions ul, .intro-footer {
  display: flex;
  align-items: center;
}
.intro-masthead {
  justify-content: space-between;
}
.intro-wordmark { gap: 12px; }
.intro-seal {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--accent);
  border-radius: 50%;
  color: var(--accent);
  font-size: 12px;
  letter-spacing: -0.05em;
}
.intro-brand { font-size: 14px; font-weight: 600; line-height: 1.4; }
.intro-brand-subtitle, .intro-edition { color: var(--muted); font-size: 12px; }
.intro-edition { gap: 12px; }
.intro-edition span { padding-left: 12px; border-left: 1px solid var(--rule); color: var(--quiet); }
.intro-copy { display: flex; flex-direction: column; align-items: flex-start; }
.intro-eyebrow { color: var(--accent); font-size: 14px; font-weight: 500; }
.intro-copy h1 { margin-top: 20px; font-size: clamp(30px, 4.5vw, 50px); font-weight: 500; line-height: 1.28; letter-spacing: -0.045em; }
.recording-prompt { font-size: clamp(22px, 2.4vw, 28px) !important; font-weight: 500 !important; line-height: 1.45 !important; }
.intro-copy h1 span { color: #cad6df; }
.intro-description { max-width: 560px; margin-top: 24px; color: var(--muted); font-size: 16px; line-height: 1.9; }
.intro-regions { width: 100%; margin-top: auto; padding-top: 40px; }
.intro-regions h2 { padding-bottom: 12px; border-bottom: 1px solid var(--rule); color: var(--muted); font-size: 14px; font-weight: 500; }
.intro-regions ul { flex-wrap: wrap; gap: 8px 0; padding-top: 14px; }
.intro-regions li { padding: 0 14px; border-left: 1px solid var(--rule); color: #d3dbe1; font-size: 14px; }
.intro-regions li:first-child { padding-left: 0; border-left: 0; }
.intro-record { align-self: stretch; padding: 24px 28px 22px; border: 1px solid var(--rule); border-top: 3px solid var(--accent); background: #171d22; }
.intro-record-heading { justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid var(--rule); }
.intro-record-heading p { color: var(--muted); font-size: 12px; }
.intro-record-heading h2 { margin-top: 3px; font-size: 20px; font-weight: 500; letter-spacing: -0.03em; }
.intro-record-heading > span { color: var(--accent); font-size: 18px; }
.intro-steps li { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--rule); }
.intro-step-number { padding-top: 1px; color: var(--accent); font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.35; }
.intro-steps h3 { font-size: 15px; font-weight: 500; }
.intro-steps p { margin-top: 4px; color: var(--muted); font-size: 14px; line-height: 1.6; }
.intro-actions { padding-top: 18px; }
.intro-time { color: var(--ink); font-size: 14px; }
.intro-time span { margin-left: 10px; padding-left: 10px; border-left: 1px solid var(--rule); color: var(--muted); }
.intro-actions button { width: 100%; min-height: 48px; margin-top: 14px; border-radius: 8px; font-size: 15px; font-weight: 500; }
.app-shell main button.intro-primary-action { border: 1px solid var(--accent-strong); background: var(--accent-strong); color: #fffaf5; }
.app-shell main button.intro-primary-action:hover { background: #36566f; }
.intro-secondary-action { border: 1px solid var(--rule); background: transparent; color: var(--ink); }
.intro-secondary-action:hover { background: #20272d; }
.intro-privacy { margin-top: 14px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.intro-footer { gap: 14px; padding-top: 16px; border-top: 1px solid var(--rule); color: var(--quiet); font-size: 12px; }
.intro-footer span + span { padding-left: 14px; border-left: 1px solid var(--rule); }

@media (max-width: 760px) {
  .intro-regions { margin-top: 36px; }
  .intro-record { padding: 20px; }
}
@media (max-width: 480px) {
  .intro-edition { display: block; padding-top: 5px; text-align: right; }
  .intro-edition span { display: block; margin: 5px 0 0; padding: 0; border: 0; }
  .intro-copy h1 { font-size: 30px; }
  .intro-description { font-size: 15px; }
  .intro-footer { flex-wrap: wrap; gap: 8px; }
}
.gs-area-filter { display: grid; grid-template-columns: .7fr 1fr 1.4fr; gap: 5px; margin-top: 8px; }
.gs-area-filter button { color: #c8d6eb; background: #172b45; border: 1px solid #47607e; }
.gs-area-filter button[aria-pressed="true"] { color: #10243a; background: #b7d3ff; font-weight: 700 !important; }
`;

  const compiler = await compile(srcCss, {
    base: root,
    onDependency: () => {},
  });

  // 두 번째 규칙은 소수점(py-3.5, scale-[0.98])과 # 색상(bg-[#315b83])이 든 클래스를 잡는다.
  // 첫 번째 규칙으로 뽑던 후보는 그대로 두고 더하기만 한다. 클래스가 아닌 후보는 Tailwind가 무시한다.
  const candidatePatterns = [/[a-zA-Z0-9_\-\/\[\]\:\%]+/g, /[a-zA-Z0-9_\-\/\[\]\:\%\.#]+/g];

  const files = fg.sync(['src/**/*.{tsx,ts,jsx,js}'], { cwd: root });
  const candidates = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const pattern of candidatePatterns) {
      for (const m of text.match(pattern) || []) candidates.add(m);
    }
  }

  const result = compiler.build(Array.from(candidates));
  const outPath = path.join(root, 'src/app/globals.css');
  fs.writeFileSync(outPath, result, 'utf8');
  console.log(`[build-css] Successfully compiled Tailwind CSS (${(result.length / 1024).toFixed(1)} KB) -> src/app/globals.css`);
}

build().catch((err) => {
  console.error('[build-css] Error:', err);
  process.exit(1);
});
