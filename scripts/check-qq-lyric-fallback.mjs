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
const requests = [];
const forbidden = Object.assign(new Error('Request failed with status code 403'), {
  response: { status: 403 },
});
const firstRequest = {
  then() {
    return this;
  },
  catch(handler) {
    return handler(forbidden);
  },
};
const context = {
  axios: {
    get(url) {
      requests.push(url);
      if (requests.length === 1) return firstRequest;
      return Promise.resolve({ data: { lyric: 'primary lyric', trans: '' } });
    },
  },
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
assert.equal(requests.length, 2, '403 must trigger exactly one fallback request');
assert.match(requests[0], /^https:\/\/c\.y\.qq\.com\//);
assert.match(requests[1], /^https:\/\/i\.y\.qq\.com\//);
assert.equal(lyricResult.lyric, 'primary lyric');
assert.equal(lyricResult.tlyric, '');
console.log('PASS: QQ lyric 403 falls back from c.y.qq.com to i.y.qq.com');
