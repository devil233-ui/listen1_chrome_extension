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
  [
    'statuses are hidden on the lyric page',
    count(html, /ng-if="window_type !== 'track'(?: && isOpenSidebar)?"/g) ===
      2,
  ],
  ['no footer version badges', count(html, /class="version-badge"/g) === 0],
  [
    'statuses live in the reserved sidebar header',
    count(
      html,
      /<div class="menu-control">\s*<div\s+class="build-status"/g
    ) === 2,
  ],
  [
    'classic-theme status is top-left',
    /\.sidebar \.build-status \{[^}]*left: 8px;[^}]*max-width: calc\(100% - 16px\);[^}]*top: 7px;/.test(
      commonCss
    ),
  ],
  [
    'modern-theme status is top-left',
    /\.sidebar \.build-status \{[^}]*left: 8px;[^}]*max-width: calc\(100% - 16px\);[^}]*top: 23px;/.test(
      common2Css
    ),
  ],
  [
    'sidebar headers provide the full available width',
    /\.sidebar \.menu-control \{[^}]*width: 100%;/.test(commonCss) &&
      /\.sidebar \.menu-control \{[^}]*width: 100%;/.test(common2Css),
  ],
  [
    'status no longer occupies navigation content',
    !commonCss.includes('.navigation .build-status') &&
      !common2Css.includes('.navigation .build-status'),
  ],
  [
    'jump button is limited to playlist tracks',
    count(
      html,
      /ng-if="window_type === 'list' && is_window_hidden === 0"/g
    ) === 2,
  ],
  [
    'jump button shares the navigation state scope',
    count(
      html,
      /ng-controller="NavigationController">\s*<div class="wrap">\s*<button\s+type="button"\s+class="jump-to-current"/g
    ) === 2,
  ],
];
const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);

if (failed.length > 0) {
  console.error(`FAIL: ${failed.join(', ')}`);
  process.exit(1);
}

console.log('PASS: build status and jump button use the intended page visibility');
