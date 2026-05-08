const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createManifestObject,
  writeManifest,
  readManifest,
} = require('../src/manifest');

function createSampleResearchedTracks() {
  return [
    {
      number: 1,
      start: '00:02:34',
      rawTitle: 'Ame(B)',
      normalizedTitle: 'Ame (B)',
      evidenceUrl: 'https://sakanaction.jp/feature/turn_blu-ray',
      lyricLookupTitle: 'サカナクション Ame',
      lyricSource: 'genius',
      notes: [],
    },
    {
      number: 2,
      start: '00:07:02',
      rawTitle: '陽炎',
      normalizedTitle: '陽炎',
      evidenceUrl: null,
      lyricLookupTitle: 'サカナクション 陽炎',
      lyricSource: null,
      notes: ['No Genius match found — review needed'],
    },
  ];
}

test('createManifestObject returns the full manifest shape with all fields', () => {
  const researchedTracks = createSampleResearchedTracks();
  const manifest = createManifestObject({
    albumName: 'SAKANAQUARIUM 2024 turn',
    artist: 'サカナクション',
    sourceAudioPath: 'albums/turn/source.flac',
    coverPath: 'albums/turn/cover.jpg',
    timestampsPath: 'albums/turn/timestamps.md',
    year: '2025',
    albumEvidenceUrl: 'https://sakanaction.jp/feature/turn_blu-ray',
    wantsLyrics: true,
    researchedTracks,
  });

  assert.equal(manifest.approved, false);
  assert.equal(manifest.albumTitle, 'SAKANAQUARIUM 2024 turn');
  assert.equal(manifest.albumEvidenceUrl, 'https://sakanaction.jp/feature/turn_blu-ray');
  assert.equal(manifest.artist, 'サカナクション');
  assert.equal(manifest.year, '2025');
  assert.equal(manifest.wantsLyrics, true);
  assert.equal(manifest.tracks.length, 2);
  assert.equal(manifest.tracks[0].normalizedTitle, 'Ame (B)');
  assert.equal(manifest.tracks[0].evidenceUrl, 'https://sakanaction.jp/feature/turn_blu-ray');
  assert.equal(manifest.tracks[0].lyricSource, 'genius');
  assert.equal(manifest.tracks[1].normalizedTitle, '陽炎');
  assert.equal(manifest.tracks[1].notes.length, 1);
});

test('createManifestObject uses defaults when optional fields omitted', () => {
  const minimalTracks = [
    { number: 1, start: '00:00:00', rawTitle: 'Test', normalizedTitle: 'Test' },
  ];

  const manifest = createManifestObject({
    albumName: 'Test',
    artist: null,
    sourceAudioPath: 'src.flac',
    coverPath: 'cover.jpg',
    timestampsPath: 'ts.md',
    researchedTracks: minimalTracks,
  });

  assert.equal(manifest.artist, 'Unknown Artist');
  assert.equal(manifest.year, null);
  assert.equal(manifest.albumEvidenceUrl, null);
  assert.equal(manifest.wantsLyrics, false);
  assert.equal(manifest.tracks[0].evidenceUrl, null);
  assert.equal(manifest.tracks[0].lyricLookupTitle, null);
  assert.equal(manifest.tracks[0].lyricText, null);
  assert.deepEqual(manifest.tracks[0].notes, []);
});

test('writeManifest and readManifest round-trip manifest JSON with a trailing newline', () => {
  const researchedTracks = createSampleResearchedTracks();
  const manifest = createManifestObject({
    albumName: 'SAKANAQUARIUM 2024 turn',
    artist: 'サカナクション',
    sourceAudioPath: 'albums/turn/source.flac',
    coverPath: 'albums/turn/cover.jpg',
    timestampsPath: 'albums/turn/timestamps.md',
    year: '2025',
    researchedTracks,
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sakanaction-manifest-'));
  const manifestPath = path.join(tempDir, 'manifest.json');

  try {
    writeManifest(manifestPath, manifest);

    const rawText = fs.readFileSync(manifestPath, 'utf8');
    const loadedManifest = readManifest(manifestPath);

    assert.match(rawText, /\n$/);
    assert.deepEqual(loadedManifest, manifest);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
