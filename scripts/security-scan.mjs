import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Scan only files eligible for Git; never print suspected credential values.
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:private[_-]?key|seed[_-]?phrase|mnemonic)\s*[=:]\s*["'][^"']{20,}["']/i,
  /(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/i,
];
const findings = [];
for (const file of new Set(files)) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example'))
    findings.push(`${file}: environment file must not be committed`);
  const content = readFileSync(file, 'utf8');
  if (patterns.some((pattern) => pattern.test(content)))
    findings.push(`${file}: potential credential`);
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Credential pattern scan passed (${new Set(files).size} files). This is not a security audit.`,
  );
}
