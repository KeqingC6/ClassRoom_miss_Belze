import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspace = __dirname;

// 1. Compile TypeScript modules in dependency order into a single IIFE bundle
const moduleFiles = [
  'src/types.ts',
  'src/seed.ts',
  'src/store.ts',
  'src/utils.ts',
  'src/views/scheduler.ts',
  'src/views/tuition.ts',
  'src/views/logs.ts',
  'src/views/scores.ts',
  'src/views/album.ts',
  'src/views/classHub.ts',
  'src/views/dashboard.ts',
  'src/views/otherViews.ts',
  'src/main.ts',
];

const bundleParts = ['(function () {\n"use strict";\n'];

for (const relPath of moduleFiles) {
  const fullPath = path.join(workspace, relPath);
  const tsCode = fs.readFileSync(fullPath, 'utf-8');
  let jsCode = stripTypeScriptTypes(tsCode, { mode: 'strip' });

  // Strip ES module imports and exports for single-scope IIFE execution
  jsCode = jsCode.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  jsCode = jsCode.replace(/^\s*export\s+(async\s+function|function|const|let|var|class)\s+/gm, '$1 ');

  bundleParts.push(`\n// === MODULE: ${relPath} ===\n`);
  bundleParts.push(jsCode);
}

bundleParts.push('\n})();\n');

const distDir = path.join(workspace, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const bundleCode = bundleParts.join('\n');

// Validate JS syntax before writing
new vm.Script(bundleCode, { filename: 'dist/app.bundle.js' });

const bundlePath = path.join(distDir, 'app.bundle.js');
fs.writeFileSync(bundlePath, bundleCode, 'utf-8');
console.log(`1. Built dist/app.bundle.js (${bundleCode.length.toLocaleString()} bytes)`);

// 2. Build 100% standalone single-file HTML (dist/index.html + nttclass-standalone.html)
const baseHtml = fs.readFileSync(path.join(workspace, 'index.html'), 'utf-8');
const nttCss = fs.readFileSync(path.join(workspace, 'src/styles/nttclass.css'), 'utf-8');
const overridesCss = fs.readFileSync(path.join(workspace, 'src/styles/overrides.css'), 'utf-8');

const safeInlineCss = `${nttCss}\n${overridesCss}`.replace(/<\/style>/gi, '<\\/style>');
const safeInlineJs = bundleCode.replace(/<\/script>/gi, '<\\/script>');

let singleFileHtml = baseHtml;

// Replace external CSS links with inline <style>
singleFileHtml = singleFileHtml.replace(
  /\s*<link rel="stylesheet" href="\.\/src\/styles\/nttclass\.css">\s*<link rel="stylesheet" href="\.\/src\/styles\/overrides\.css">/,
  () => `\n  <style id="nttclass-inline-styles">\n${safeInlineCss}\n  </style>`
);

// Replace bottom script tag with inline <script>
singleFileHtml = singleFileHtml.replace(
  /<script src="\.\/dist\/app\.bundle\.js"><\/script>|(<script>\s*if \(window\.location\.protocol === 'file:'\)[\s\S]*?<\/script>\s*<script type="module" src="\/src\/main\.ts"><\/script>)/,
  () => `<script id="nttclass-inline-app">\n${safeInlineJs}\n  </script>`
);

const distHtmlPath = path.join(distDir, 'index.html');
const rootStandalonePath = path.join(workspace, 'nttclass-standalone.html');

fs.writeFileSync(distHtmlPath, singleFileHtml, 'utf-8');
fs.writeFileSync(rootStandalonePath, singleFileHtml, 'utf-8');

console.log(`2. Built single-file dist/index.html (${Buffer.byteLength(singleFileHtml, 'utf-8').toLocaleString()} bytes)`);
console.log(`3. Built single-file nttclass-standalone.html (${Buffer.byteLength(singleFileHtml, 'utf-8').toLocaleString()} bytes)`);
