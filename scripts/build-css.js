const fs = require('fs');
const path = require('path');
const { compile } = require('@tailwindcss/node');
const fg = require('fast-glob');

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

  const files = fg.sync(['src/**/*.{tsx,ts,jsx,js}'], { cwd: root });
  const candidates = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    const matches = text.match(/[a-zA-Z0-9_\-\/\[\]\:\%]+/g) || [];
    for (const m of matches) candidates.add(m);
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
