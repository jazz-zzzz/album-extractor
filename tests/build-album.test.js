const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertApprovedManifest, resolveTrackEnds } = require('../src/build-album');

test('assertApprovedManifest throws when approved is false', () => {
  assert.throws(
    () => assertApprovedManifest({ approved: false }),
    /Manifest is not approved/
  );
});

test('assertApprovedManifest throws when approved is missing', () => {
  assert.throws(
    () => assertApprovedManifest({}),
    /Manifest is not approved/
  );
});

test('assertApprovedManifest passes when approved is true', () => {
  assert.doesNotThrow(() => assertApprovedManifest({ approved: true }));
});

test('resolveTrackEnds sets each end to next track start', () => {
  const tracks = [
    { number: 1, start: '00:02:34' },
    { number: 2, start: '00:07:02' },
    { number: 3, start: '00:11:49' },
  ];

  const resolved = resolveTrackEnds(tracks, '00:15:00');

  assert.equal(resolved[0].end, '00:07:02');
  assert.equal(resolved[1].end, '00:11:49');
  assert.equal(resolved[2].end, '00:15:00');
});

test('resolveTrackEnds preserves existing end values', () => {
  const tracks = [
    { number: 1, start: '00:02:34', end: '00:07:00' },
    { number: 2, start: '00:07:02' },
  ];

  const resolved = resolveTrackEnds(tracks, '00:15:00');

  assert.equal(resolved[0].end, '00:07:00');
  assert.equal(resolved[1].end, '00:15:00');
});

test('build command rejects unapproved manifest', async () => {
  const { spawnSync } = require('node:child_process');

  // Create temp unapproved manifest
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    approved: false,
    albumTitle: 'Test',
    artist: 'Test',
    sourceAudioPath: '/fake/source.flac',
    coverPath: '/fake/cover.jpg',
    tracks: [{ number: 1, start: '00:00:00', normalizedTitle: 'Test', rawTitle: 'Test' }],
  }));

  try {
    const result = spawnSync('node', [
      path.resolve(__dirname, '..', 'tool.js'),
      'build',
      '--manifest', manifestPath,
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /not approved/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
