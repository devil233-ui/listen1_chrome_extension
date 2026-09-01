import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const providerSource = fs.readFileSync(
  path.join(repositoryRoot, 'js', 'provider', 'netease.js'),
  'utf8'
);

const writtenCookies = [];
const context = {
  // 最小可用的 async.concat，足够驱动 ne_ensure_cookie 的两段流程
  async: {
    concat(items, iteratee, done) {
      const results = [];
      let pending = items.length;
      items.forEach((item, index) => {
        iteratee(item, (_error, value) => {
          results[index] = value;
          pending -= 1;
          if (pending === 0) {
            done(null, results);
          }
        });
      });
    },
  },
  // 返回 null 表示本地没有该 cookie，强制走写入分支
  cookieGet: (_item, callback) => callback(null),
  cookieSet: (cookie, callback) => {
    writtenCookies.push(cookie);
    callback(null);
  },
  cookieRemove: () => {},
  isElectron: () => false,
  getParameterByName: () => '',
  forge: {},
};

vm.runInNewContext(
  `${providerSource}\nglobalThis.neteaseProvider = netease;`,
  context
);

await new Promise((resolve) => {
  context.neteaseProvider.ne_ensure_cookie(resolve);
});

assert.equal(
  writtenCookies.length,
  3,
  'ne_ensure_cookie must write the three netease bootstrap cookies'
);
assert.deepEqual(
  writtenCookies.map((cookie) => cookie.name).sort(),
  ['NMTID', '_ntes_nnid3', '_ntes_nuid'].sort()
);

// Chrome 要求 sameSite=no_restriction 必须同时带 secure，
// 否则 chrome.cookies.set 直接失败并抛
// "Failed to parse or set cookie named ..."。
writtenCookies
  .filter((cookie) => cookie.sameSite === 'no_restriction')
  .forEach((cookie) => {
    assert.equal(
      cookie.secure,
      true,
      `cookie ${cookie.name} uses sameSite=no_restriction so it must set secure:true`
    );
    assert.ok(
      cookie.url.startsWith('https://'),
      `cookie ${cookie.name} must be written against an https url`
    );
  });

console.log(
  'PASS: netease bootstrap cookies pair sameSite=no_restriction with secure:true'
);
