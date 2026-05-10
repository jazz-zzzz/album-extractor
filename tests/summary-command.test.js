const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');
const { spawnSync } = require('node:child_process');

function createManifest(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const manifest = {
    approved: false,
    albumTitle: 'Test Album',
    albumEvidenceUrl: null,
    artist: 'Test Artist',
    year: 2024,
    sourceAudioPath: '/fake/source.flac',
    coverPath: '/fake/cover.jpg',
    timestampsPath: '/fake/timestamps.md',
    notes: [],
    tracks: [
      {
        number: 1,
        start: '00:00:00',
        end: '00:02:30',
        rawTitle: 'Intro',
        normalizedTitle: 'Intro',
        normalizationStatus: 'not_applicable',
        trackKind: 'intro',
        evidenceUrl: null,
        lyricLookupTitle: null,
        notes: ['First track starts at 00:02:30'],
      },
      {
        number: 2,
        start: '00:02:30',
        end: null,
        rawTitle: 'Song One',
        normalizedTitle: 'Song One',
        normalizationStatus: 'raw',
        trackKind: 'song',
        evidenceUrl: null,
        lyricLookupTitle: 'Test Artist Song One',
        notes: ['Needs AI research for official name'],
      },
      {
        number: 3,
        start: '00:06:00',
        end: null,
        rawTitle: 'Song Two／歌二',
        normalizedTitle: 'Song Two',
        normalizationStatus: 'cleaned',
        trackKind: 'song',
        evidenceUrl: null,
        lyricLookupTitle: 'Test Artist Song Two',
        notes: ['Title cleaned locally — needs AI research for official name'],
      },
      {
        number: 4,
        start: '00:09:30',
        end: null,
        rawTitle: 'Official Song',
        normalizedTitle: 'Official Song',
        normalizationStatus: 'verified',
        trackKind: 'song',
        evidenceUrl: 'https://example.com/setlist',
        lyricLookupTitle: null,
        notes: ['Confirmed via official setlist'],
      },
      {
        number: 5,
        start: '00:13:00',
        end: null,
        rawTitle: 'MC环节',
        normalizedTitle: 'MC环节',
        normalizationStatus: 'not_applicable',
        trackKind: 'mc',
        evidenceUrl: null,
        lyricLookupTitle: null,
        notes: ['MC/talk segment'],
      },
    ],
  };

  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { dir, manifestPath };
}

const repoRoot = path.resolve(__dirname, '..');

test('summary shows intro in Tracks count', (t) => {
  const { manifestPath } = createManifest(t);

  const result = spawnSync('node', ['tool.js', 'summary', '--manifest', manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /Tracks: 5 total, 3 songs, 1 MC, 1 intro/);
});

test('summary excludes MC from needs review', (t) => {
  const { manifestPath } = createManifest(t);

  const result = spawnSync('node', ['tool.js', 'summary', '--manifest', manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  // Only 2 songs need review (raw + cleaned), verified and MC/intro excluded
  assert.match(result.stdout, /Status: 1 verified, 2 need review/);

  // MC should NOT appear in Needs review section
  const reviewSection = result.stdout.split('Needs review:')[1] || '';
  assert.equal(reviewSection.includes('MC'), false, 'MC should not appear in Needs review');
  assert.equal(reviewSection.includes('Intro'), false, 'Intro should not appear in Needs review');
});

test('summary lists cleaned and raw songs in needs review', (t) => {
  const { manifestPath } = createManifest(t);

  const result = spawnSync('node', ['tool.js', 'summary', '--manifest', manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const reviewSection = result.stdout.split('Needs review:')[1] || '';
  assert.match(reviewSection, /Song One/);
  assert.match(reviewSection, /Song Two/);
  // Verified song should NOT be in needs review
  assert.equal(reviewSection.includes('Official Song'), false);
});

test('summary shows approval status', (t) => {
  const { manifestPath } = createManifest(t);

  const result = spawnSync('node', ['tool.js', 'summary', '--manifest', manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /Approved: NO/);
});
