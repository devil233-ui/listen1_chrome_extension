import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(repositoryRoot, 'listen1.html'), 'utf8');
const documentHtml = html.replace(/<!--[\s\S]*?-->/g, '');
const scriptTags = documentHtml.match(/<script\b[^>]*>/gi) ?? [];
const inlineScriptTags = scriptTags.filter((tag) => !/\bsrc\s*=/i.test(tag));

if (inlineScriptTags.length > 0) {
  console.error(`FAIL: ${inlineScriptTags.length} inline script tag(s) violate extension CSP`);
  process.exit(1);
}

console.log('PASS: no inline script tags remain in listen1.html');
