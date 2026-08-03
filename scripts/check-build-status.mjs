import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
const count = (text, pattern) => text.match(pattern)?.length ?? 0;

const html = read('listen1.html');
const commonCss = read('css/common.css');
const common2Css = read('css/common2.css');
const checks = [
  ['two top navigation statuses', count(html, /class="build-status"/g) === 2],
  ['no footer version badges', count(html, /class="version-badge"/g) === 0],
  ['classic-theme status style', commonCss.includes('.build-status')],
  ['modern-theme status style', common2Css.includes('.build-status')],
];
const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);

if (failed.length > 0) {
  console.error(`FAIL: ${failed.join(', ')}`);
  process.exit(1);
}

console.log('PASS: build status is present in the navigation for both themes');
