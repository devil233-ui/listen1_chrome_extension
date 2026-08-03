import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providerSource = fs.readFileSync(
  path.join(repositoryRoot, 'js', 'provider', 'qq.js'),
  'utf8'
);
const rules = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'rules_1.json'), 'utf8')
);
const requests = [];
const lyric = '[00:00.00]primary lyric';
const translatedLyric = '[00:00.00]translated lyric';
const context = {
  axios: {
    post(url, data) {
      requests.push({ url, data });
      return Promise.resolve({
        data: {
          req_1: {
            code: 0,
            data: {
              lyric: Buffer.from(lyric).toString('base64'),
              trans: Buffer.from(translatedLyric).toString('base64'),
            },
          },
        },
      });
    },
  },
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  TextDecoder,
  getParameterByName: () => 'qqtrack_003KI9992I7WpG',
};

vm.runInNewContext(`${providerSource}\nglobalThis.qqProvider = qq;`, context);
let lyricResult;
const request = context.qqProvider
  .lyric('qqtrack_003KI9992I7WpG')
  .success((result) => {
    lyricResult = result;
  });

await request;
assert.equal(requests.length, 1, 'QQ lyric must use one modern API request');
assert.equal(requests[0].url, 'https://u.y.qq.com/cgi-bin/musicu.fcg');
assert.equal(
  requests[0].data.req_1.module,
  'music.musichallSong.PlayLyricInfo'
);
assert.equal(requests[0].data.req_1.method, 'GetPlayLyricInfo');
assert.equal(requests[0].data.req_1.param.songMID, '003KI9992I7WpG');
assert.equal(lyricResult.lyric, lyric);
assert.equal(lyricResult.tlyric, translatedLyric);

const qqRule = rules.find((rule) => rule.id === 1);
assert.equal(qqRule.condition.urlFilter, '||y.qq.com/');
assert.equal(qqRule.condition.requestDomains, undefined);
assert.equal(
  qqRule.action.requestHeaders.find((header) => header.header === 'origin').value,
  'https://y.qq.com'
);
console.log('PASS: QQ lyric uses musicu API, decodes base64 lyrics, and has a compatible header rule');
