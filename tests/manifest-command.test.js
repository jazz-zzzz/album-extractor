const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');
const { spawnSync } = require('node:child_process');

function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-cmd-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // 24-track timestamps matching SAKANAQUARIUM 2024 turn layout
  const timestamps = [];
  for (let i = 1; i <= 22; i++) {
    const h = String(Math.floor(i / 6)).padStart(2, '0');
    const m = String((i * 3) % 60).padStart(2, '0');
    const s = String((i * 7) % 60).padStart(2, '0');
    timestamps.push(`${h}:${m}:${s} Song ${i}`);
  }
  timestamps.push('01:07:23 バッハの旋律を夜に聴いたせいです(DJ版)');
  timestamps.push('01:47:30 MC环节');

  fs.writeFileSync(path.join(dir, 'timestamps.md'), timestamps.join('\n'));
  fs.writeFileSync(path.join(dir, 'source.flac'), '');
  fs.writeFileSync(path.join(dir, 'cover.jpg'), '');

  return dir;
}

test('directory mode: node tool.js manifest <album-dir> writes draft manifest', (t) => {
  const dir = createFixture(t);
  const repoRoot = path.resolve(__dirname, '..');

  const result = spawnSync('node', ['tool.js', 'manifest', dir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /Manifest written:/);
  assert.match(result.stdout, /need review/);

  // Directory mode writes manifest to <albumDir>/manifest.json
  const mPath = path.join(dir, 'manifest.json');
  assert.equal(fs.existsSync(mPath), true, `manifest not found at ${mPath}`);

  const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  // 24 source tracks + 1 auto-inserted Intro (first track starts at 00:03:07 ≠ 00:00:00)
  assert.equal(manifest.tracks.length, 25);
  assert.equal(manifest.approved, false);

  // Intro track auto-inserted
  const intro = manifest.tracks[0];
  assert.equal(intro.trackKind, 'intro');
  assert.equal(intro.start, '00:00:00');
  assert.equal(intro.end, '00:03:07');

  // DJ-suffixed track: halfwidth parens preserved
  const bachTrack = manifest.tracks.find((t) => t.rawTitle.includes('バッハ'));
  assert.notEqual(bachTrack, undefined);
  assert.equal(bachTrack.normalizedTitle, 'バッハの旋律を夜に聴いたせいです(DJ版)');

  // MC track flagged as verified (not needs_review)
  const mcTrack = manifest.tracks.find((t) => t.rawTitle === 'MC环节');
  assert.notEqual(mcTrack, undefined);
  assert.equal(mcTrack.normalizationStatus, 'not_applicable');
  assert.equal(mcTrack.lyricLookupTitle, null);
});

test('directory mode with --artist overrides artist', (t) => {
  const dir = createFixture(t);
  const repoRoot = path.resolve(__dirname, '..');

  const result = spawnSync('node', ['tool.js', 'manifest', dir, '--artist', 'Test Artist'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const mPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  assert.equal(manifest.artist, 'Test Artist');
});
