import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLI = resolve(ROOT, 'gh-embed-image');

function run(args, { expectFail = false } = {}) {
  try {
    const out = execSync(`"${CLI}" ${args}`, {
      encoding: 'utf-8',
      cwd: ROOT,
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expectFail) throw new Error(`Expected failure but got: ${out}`);
    return { stdout: out, exitCode: 0 };
  } catch (err) {
    if (!expectFail) throw err;
    return { stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('CLI argument validation', () => {
  it('shows help with -h', () => {
    const { stdout } = run('-h');
    assert.match(stdout, /Usage:/);
    assert.match(stdout, /--login/);
    assert.match(stdout, /--pr/);
  });

  it('shows help with --help', () => {
    const { stdout } = run('--help');
    assert.match(stdout, /Upload images to GitHub/);
  });

  it('fails with no arguments', () => {
    const { stderr, exitCode } = run('', { expectFail: true });
    assert.ok(exitCode !== 0);
    assert.match(stderr, /No images specified/);
  });

  it('fails with nonexistent file', () => {
    const { stderr, exitCode } = run('nonexistent.png', { expectFail: true });
    assert.ok(exitCode !== 0);
    assert.match(stderr, /File not found/);
  });

  it('rejects unknown options', () => {
    const { stderr, exitCode } = run('--bogus', { expectFail: true });
    assert.ok(exitCode !== 0);
    assert.match(stderr, /Unknown option/);
  });
});

describe('MIME type detection', () => {
  const TEMP_DIR = resolve(ROOT, 'test', '.tmp');

  function createTempFile(name) {
    mkdirSync(TEMP_DIR, { recursive: true });
    const path = resolve(TEMP_DIR, name);
    // Minimal valid PNG header
    writeFileSync(path, Buffer.from('89504e470d0a1a0a', 'hex'));
    return path;
  }

  function cleanup(path) {
    try { unlinkSync(path); } catch { /* ignore */ }
  }

  // These tests only validate that the file passes CLI validation (exists, is a file).
  // They don't test actual upload since that requires a session.
  // The MIME type logic is in upload.mjs and is covered by the extension map.

  it('accepts .png files', () => {
    const path = createTempFile('test.png');
    try {
      // Will fail at upload (no session) but should pass file validation
      const { stderr } = run(`"${path}"`, { expectFail: true });
      assert.doesNotMatch(stderr, /File not found/);
    } finally {
      cleanup(path);
    }
  });

  it('accepts .jpg files', () => {
    const path = createTempFile('test.jpg');
    try {
      const { stderr } = run(`"${path}"`, { expectFail: true });
      assert.doesNotMatch(stderr, /File not found/);
    } finally {
      cleanup(path);
    }
  });
});

describe('security invariants', () => {
  it('session.json is in .gitignore', () => {
    const gitignore = execSync('cat .gitignore', { encoding: 'utf-8', cwd: ROOT });
    assert.match(gitignore, /session\.json/);
  });

  it('.claude directory is in .gitignore', () => {
    const gitignore = execSync('cat .gitignore', { encoding: 'utf-8', cwd: ROOT });
    assert.match(gitignore, /\.claude/);
  });

  it('upload.mjs does not contain hardcoded tokens', () => {
    const source = execSync('cat lib/upload.mjs', { encoding: 'utf-8', cwd: ROOT });
    assert.doesNotMatch(source, /gho_/);
    assert.doesNotMatch(source, /ghp_/);
    assert.doesNotMatch(source, /github_pat_/);
  });

  it('session state directory uses ~/.config not project dir', () => {
    const source = execSync('cat lib/upload.mjs', { encoding: 'utf-8', cwd: ROOT });
    assert.match(source, /\.config.*gh-embed-image/);
    // Ensure state is NOT stored in the project directory
    assert.doesNotMatch(source, /resolve\(__dirname.*session/);
  });
});
