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
