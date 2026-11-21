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
  --paper: #101418;
  --sheet: #191f24;
  --ink: #edf1f4;
  --muted: #b9c2ca;
  --quiet: #89949d;
  --rule: #303a42;
  --accent: #9bbbd5;
  --accent-strong: #416785;
  --accent-soft: #202f3b;
}

html, body { background: var(--paper); }
body {
  min-height: 100vh;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.65;
}

.app-shell { isolation: isolate; background: var(--paper); color: var(--ink); }
.app-shell, .app-shell * { font-family: inherit; }
.app-frame {
  width: min(100%, 1120px);
  border-color: transparent;
  background: var(--sheet);
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
  border-radius: 0 !important;
  background: transparent !important;
  padding: 4px 0 !important;
  box-shadow: none !important;
}
.app-shell button.app-header-link { border-radius: 0 !important; }
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
.app-shell [class~="text-xs"] { font-size: 12px !important; line-height: 1.55 !important; }
.app-shell [class~="text-sm"] { font-size: 14px !important; line-height: 1.6 !important; }
.app-shell [class~="text-base"] { font-size: 16px !important; line-height: 1.65 !important; }
.app-shell [class~="text-lg"] { font-size: 18px !important; line-height: 1.5 !important; }
.app-shell [class~="text-xl"] { font-size: 20px !important; line-height: 1.45 !important; }
.app-shell [class~="text-2xl"] { font-size: 24px !important; line-height: 1.35 !important; }
.app-shell [class~="text-3xl"] { font-size: 30px !important; line-height: 1.3 !important; }
.app-shell [class~="text-4xl"] { font-size: 38px !important; line-height: 1.25 !important; }
.app-shell [class~="text-5xl"] { font-size: 46px !important; line-height: 1.2 !important; }
.app-shell [class*="text-[9px]"],
.app-shell [class*="text-[10px]"],
.app-shell [class*="text-[11px]"] { font-size: 12px !important; line-height: 1.55 !important; }
.app-shell [class*="font-bold"], .app-shell [class*="font-extrabold"] { font-weight: 600 !important; }
.app-shell strong { font-weight: 600; }

.app-shell button { border-radius: 9px !important; }
.app-shell main button {
  min-height: 44px;
  border-radius: 9px !important;
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
.app-shell main button.intro-primary-action:hover { background: #36566f !important; }
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
.screen-glass { width: min(100%, 1120px); margin-inline: auto; padding: 32px !important; }
.screen-glass > .grid { gap: 24px !important; }
.screen-glass [class*="rounded-3xl"]:not([role="alert"]) {
  padding: 24px !important;
  border: 1px solid var(--rule) !important;
  border-radius: 14px !important;
  background-color: var(--sheet) !important;
  background-image: none !important;
}
.screen-glass > [role="alert"] { border-radius: 12px !important; }
.screen-glass button { min-height: 44px; font-size: 14px; font-weight: 500; }
.screen-glass button[class~="bg-white"] {
  border: 1px solid var(--accent-strong) !important;
  background: var(--accent-strong) !important;
  color: #f5f8fb !important;
}
.screen-glass button[class~="bg-white"]:hover { background: #36566f !important; }
.screen-glass button[class*="bg-zinc-800"] {
  border: 1px solid var(--rule) !important;
  background: #20272d !important;
  color: var(--ink) !important;
}
.record-question-index { color: var(--accent); font-size: 14px; font-weight: 600; }
.record-target { color: var(--muted); font-size: 14px; }
.record-target strong { margin-left: 8px; color: var(--ink); font-weight: 500; }
.app-shell main .screen-glass button.recording-live-button {
  position: relative;
  min-height: 60px;
  overflow: hidden;
  border: 1px solid #c85c57;
  background: #853b38;
  color: #fff !important;
  animation: recording-button-pulse 1.05s ease-in-out infinite;
  transition: transform 120ms ease;
}
.recording-live-label { position: relative; z-index: 1; font-size: 15px; font-weight: 500; line-height: 1.35; }
.app-shell main .screen-glass button.recording-live-button:active { transform: translateY(1px); animation-play-state: paused; }
.judging-indicator { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border: 1px solid var(--rule); border-radius: 50%; background: #12171b; color: #e59a91; font-size: 20px; }
.judging-spinner { width: 18px; height: 18px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
.judging-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.result-eyebrow, .ranking-eyebrow { color: var(--accent); font-size: 14px; font-weight: 500; }
@keyframes recording-button-pulse {
  0%, 100% { background-color: #753331; }
  50% { background-color: #a94742; }
}
@media (prefers-reduced-motion: reduce) { .recording-live-button, .judging-spinner { animation: none; } }
@media (max-width: 640px) {
  .screen-glass { padding: 20px !important; }
  .screen-glass [class*="rounded-3xl"]:not([role="alert"]) { padding: 20px !important; }
}

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
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rule);
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
.intro-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); gap: clamp(32px, 7vw, 96px); padding: clamp(44px, 8vw, 104px) 0 64px; }
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
  .intro-layout { grid-template-columns: 1fr; gap: 36px; padding-top: 48px; }
  .intro-regions { margin-top: 36px; }
  .intro-record { padding: 20px; }
}
@media (max-width: 480px) {
  .intro-masthead { align-items: flex-start; }
  .intro-edition { display: block; padding-top: 5px; text-align: right; }
  .intro-edition span { display: block; margin: 5px 0 0; padding: 0; border: 0; }
  .intro-copy h1 { font-size: 30px; }
  .intro-description { font-size: 15px; }
  .intro-footer { flex-wrap: wrap; gap: 8px; }
}
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
