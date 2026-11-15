import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const ignored = new Set(['.git', 'node_modules', 'data']);
const findings = [];
const patterns = [
  ['Anthropic key literal', /sk-ant-[A-Za-z0-9._-]{12,}/g],
  ['Bearer token literal', /Bearer\s+[A-Za-z0-9._-]{24,}/g],
  ['macOS user path', /\/Users\/[A-Za-z0-9._-]+\//g],
  ['non-loopback IPv4 address', /\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(location);
    else {
      const text = fs.readFileSync(location, 'utf8');
      for (const [label, pattern] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) findings.push(`${path.relative(root, location)}: ${label}`);
      }
    }
  }
}

visit(root);
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log('No credential-shaped literals, private paths, or non-loopback IPs found.');
}
