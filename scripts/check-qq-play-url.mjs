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
  path.join(repositoryRoot, 'js', 'provider', 'qq.js'),
  'utf8'
);

const purl = 'M500000VDG6v0SG4Oh.mp3?guid=10000&vkey=TESTVKEY&uin=0&fromtag=66';

function bootstrapWith(sip) {
  const context = {
    axios: {
      post() {
        return Promise.resolve({
          data: {
            req_1: {
              code: 0,
              data: {
                sip,
                midurlinfo: [{ purl, result: 0 }],
              },
            },
          },
        });
      },
    },
    getParameterByName: () => '',
  };
  vm.runInNewContext(`${providerSource}\nglobalThis.qqProvider = qq;`, context);
  return new Promise((resolve, reject) => {
    context.qqProvider.bootstrap_track(
      { id: 'qqtrack_000VDG6v0SG4Oh' },
      resolve,
      reject
    );
  });
}

// 只给 http 源时必须升级协议，否则扩展页面会按混合内容拦截音频。
const upgraded = await bootstrapWith([
  'http://aqqmusic.tc.qq.com/',
  'http://sjy6.stream.qqmusic.qq.com/',
]);
assert.equal(upgraded.url, `https://aqqmusic.tc.qq.com/${purl}`);
assert.ok(
  !upgraded.url.startsWith('http://'),
  'QQ play url must never stay on plain http'
);

// 列表里已有 https 源时优先直接采用，不做字符串改写。
const preferred = await bootstrapWith([
  'http://aqqmusic.tc.qq.com/',
  'https://isure.stream.qqmusic.qq.com/',
]);
assert.equal(preferred.url, `https://isure.stream.qqmusic.qq.com/${purl}`);

console.log('PASS: QQ play url always resolves to an https stream source');
