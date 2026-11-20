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
  --background: #ffffff;
  --foreground: #171717;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

:root {
  color-scheme: dark;
  --surface-border: rgba(226, 237, 255, 0.13);
  --surface-highlight: rgba(255, 255, 255, 0.12);
  --surface-fill: rgba(20, 30, 45, 0.58);
  --accent-blue: #8eb7e8;
}

html { background: #070b12; }
body {
  min-height: 100vh;
  background: #070b12;
  color: #edf3fb;
  font-size: 16px;
  line-height: 1.6;
}

.app-shell {
  isolation: isolate;
  background:
    radial-gradient(ellipse at 15% -15%, rgba(74, 119, 172, 0.2), transparent 42%),
    radial-gradient(ellipse at 92% 12%, rgba(47, 97, 130, 0.12), transparent 34%),
    #070b12;
}

.app-frame {
  width: min(100%, 1280px);
  border-color: rgba(210, 225, 246, 0.08);
  background: linear-gradient(180deg, rgba(14, 21, 32, 0.56), rgba(8, 13, 21, 0.76));
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.28);
}

.app-header {
  border-color: rgba(210, 225, 246, 0.1);
  background: rgba(8, 13, 21, 0.72);
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
}

.app-footer { border-color: rgba(210, 225, 246, 0.08); }

.screen-glass [class*="rounded-3xl"]:not([class*="border-red"]) {
  border-color: var(--surface-border);
  background-image:
    linear-gradient(145deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.018) 42%, rgba(102, 148, 197, 0.035)),
    radial-gradient(ellipse at 8% 0%, rgba(177, 211, 250, 0.08), transparent 48%);
  box-shadow: inset 0 1px 0 var(--surface-highlight), 0 24px 70px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(24px) saturate(130%);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
}

.screen-glass [class*="rounded-2xl"][class*="border"]:not([class*="border-red"]) {
  border-color: rgba(218, 232, 250, 0.1);
  background-color: rgba(255, 255, 255, 0.035);
}

.screen-glass button {
  min-height: 44px;
  border-radius: 14px;
  transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.screen-glass button[class~="bg-white"] {
  border: 1px solid rgba(226, 239, 255, 0.42);
  background: linear-gradient(135deg, #a8c9ed, #729dca);
  color: #0b1726;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.62), 0 10px 26px rgba(75, 122, 174, 0.2);
}

.screen-glass button[class~="bg-white"]:hover { background: linear-gradient(135deg, #bdd7f3, #8aaed3); }
.screen-glass button[class*="bg-indigo-500"] { border-color: rgba(159, 190, 226, 0.24); }
.screen-glass button[class*="bg-zinc-800"] { border-color: rgba(218, 232, 250, 0.14); }

.screen-glass input {
  border-radius: 14px;
  border-color: rgba(218, 232, 250, 0.15);
  background: rgba(7, 12, 20, 0.56);
}

.screen-glass :is(button, input):focus-visible {
  outline: 2px solid rgba(164, 202, 242, 0.9);
  outline-offset: 3px;
}

.screen-glass [class~="text-xs"] { font-size: 0.875rem; line-height: 1.55; }
.screen-glass [class~="text-sm"] { font-size: 0.9375rem; line-height: 1.6; }
.screen-glass [class~="text-[10px]"], .screen-glass [class~="text-[11px]"] { font-size: 0.8125rem; line-height: 1.5; }

.glass-panel {
  border: 1px solid var(--surface-border);
  border-radius: 24px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.018) 42%, rgba(102, 148, 197, 0.035)),
    radial-gradient(ellipse at 8% 0%, rgba(177, 211, 250, 0.08), transparent 48%);
  box-shadow: inset 0 1px 0 var(--surface-highlight), 0 24px 70px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(24px) saturate(130%);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
}

@media (max-width: 640px) {
  .glass-panel { border-radius: 20px; }
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
