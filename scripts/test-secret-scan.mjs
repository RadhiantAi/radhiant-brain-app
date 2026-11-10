// Synthetic must-fail check for the narrowly scoped dynamic-key false positive.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'rb-secret-scan-'));
const file = join(dir, 'fixture.txt');
const variable = ['RB', 'SESSION', 'SECRET'].join('_');
const scan = () => spawnSync('gitleaks', ['dir', dir, '--config', resolve('.gitleaks.toml'), '--redact', '--no-banner'], { encoding: 'utf8' });
try {
  writeFileSync(file, `process.env.${variable} = randomBytes(32).toString('hex');\n`);
  const generated = scan();
  if (generated.error) throw new Error('gitleaks is required for this check');
  assert.equal(generated.status, 0, 'A dynamically generated test key contains no stored credential');
  writeFileSync(file, `${variable}=synthetic-detection-fixture-never-used\n`);
  assert.equal(scan().status, 1, 'The deliberately fake literal credential must still fail');
  writeFileSync(file, `process.env.${variable} = 'synthetic-detection-fixture-never-used';\n`);
  assert.equal(scan().status, 1, 'A literal in the same code variable must still fail');
  writeFileSync(file, `import { randomBytes } from 'node:crypto';\nprocess.env.${variable} = randomBytes(32).toString('hex');\n`);
  assert.equal(scan().status, 0, 'Generated key is allowed inside a multi-line source file');
  writeFileSync(file, `process.env.${variable} = randomBytes(32).toString('hex');\n${variable}=synthetic-detection-fixture-never-used\n`);
  assert.equal(scan().status, 1, 'A safe expression must not hide a literal elsewhere in the file');
  console.log('Secret-scan controls passed: generated keys allowed; all synthetic literals rejected.');
} finally { rmSync(dir, { recursive: true, force: true }); }
