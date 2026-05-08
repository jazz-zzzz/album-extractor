const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const albumDir = 'albums/SAKANAQUARIUM 2024 turn';
const manifestPath = path.join(repoRoot, albumDir, 'manifest.json');

test('directory mode: node tool.js manifest <album-dir> writes draft manifest', () => {
  fs.rmSync(manifestPath, { force: true });

  const result = spawnSync('node', ['tool.js', 'manifest', albumDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /Manifest written:/);
  assert.match(result.stdout, /need review/);
  assert.equal(fs.existsSync(manifestPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.tracks.length, 24);
  assert.equal(manifest.approved, false);

  // DJ-suffixed track: halfwidth parens preserved (AI decides)
  const bachTrack = manifest.tracks.find((t) => t.rawTitle.includes('バッハ'));
  assert.notEqual(bachTrack, undefined);
  assert.equal(bachTrack.normalizedTitle, 'バッハの旋律を夜に聴いたせいです(DJ版)');

  // MC tracks flagged
  const mcTrack = manifest.tracks.find((t) => t.rawTitle === 'MC环节');
  assert.notEqual(mcTrack, undefined);
  assert.equal(mcTrack.lyricLookupTitle, null);
});

test('directory mode with --artist overrides artist', () => {
  fs.rmSync(manifestPath, { force: true });

  const result = spawnSync('node', ['tool.js', 'manifest', albumDir, '--artist', 'Test Artist'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.artist, 'Test Artist');
});
