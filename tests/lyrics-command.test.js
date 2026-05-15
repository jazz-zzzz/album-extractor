const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lyricsMod = require('../src/lyrics');
const origFetch = lyricsMod.fetchLyricsForTrack;

function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-cmd-'));
  t.after(() => {
    lyricsMod.fetchLyricsForTrack = origFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const manifest = {
    approved: true,
    albumTitle: 'Test Album',
    artist: 'Test Artist',
    sourceAudioPath: '/fake/source.flac',
    coverPath: '/fake/cover.jpg',
    timestampsPath: '/fake/timestamps.md',
    year: 2024,
    notes: [],
    tracks: [
      {
        number: 1, start: '00:00:00', end: '00:01:00',
        rawTitle: 'Intro', normalizedTitle: 'Intro',
        normalizationStatus: 'not_applicable', trackKind: 'intro',
        evidenceUrl: null, lyricLookupTitle: null,
        lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 2, start: '00:01:00', end: null,
        rawTitle: 'Song One', normalizedTitle: 'Song One',
        normalizationStatus: 'verified', trackKind: 'song',
        evidenceUrl: 'https://example.com', lyricLookupTitle: 'Test Artist Song One',
        lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 3, start: '00:05:00', end: null,
        rawTitle: 'Song Two', normalizedTitle: 'Song Two',
        normalizationStatus: 'verified', trackKind: 'song',
        evidenceUrl: 'https://example.com', lyricLookupTitle: 'Test Artist Song Two',
        lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 4, start: '00:10:00', end: null,
        rawTitle: 'MC Talk', normalizedTitle: 'MC Talk',
        normalizationStatus: 'not_applicable', trackKind: 'mc',
        evidenceUrl: null, lyricLookupTitle: null,
        lyricSource: null, lyricPath: null, notes: [],
      },
    ],
  };

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

test('lyrics command writes lyrics files and updates manifest', async (t) => {
  const dir = createFixture(t);
  const { runLyrics } = require('../tool.js');

  let callCount = 0;
  lyricsMod.fetchLyricsForTrack = async (artist, title) => {
    callCount++;
    if (title.includes('Song Two')) return null;
    return {
      text: `Fake lyrics for ${title}\nLine two\nLine three`,
      source: 'netease',
      neteaseId: 12345 + callCount,
    };
  };

  await runLyrics(path.join(dir, 'manifest.json'));

  const lyricsPath = path.join(dir, 'lyrics', '02-Song One.txt');
  assert.equal(fs.existsSync(lyricsPath), true);
  const content = fs.readFileSync(lyricsPath, 'utf8');
  assert.match(content, /Fake lyrics for Test Artist Song One/);

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const track2 = manifest.tracks[1];
  assert.equal(track2.lyricSource, 'netease');
  assert.equal(track2.lyricPath, 'lyrics/02-Song One.txt');

  const track3 = manifest.tracks[2];
  assert.equal(track3.lyricSource, 'not_found');
  assert.equal(track3.lyricPath, null);

  assert.equal(manifest.tracks[0].lyricSource, null);
  assert.equal(manifest.tracks[3].lyricSource, null);
});

test('lyrics command skips when no tracks need lyrics', async (t) => {
  const dir = createFixture(t);
  const { runLyrics } = require('../tool.js');

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.tracks[1].lyricPath = 'lyrics/already-done.txt';
  manifest.tracks[1].lyricSource = 'netease';
  manifest.tracks[2].lyricPath = 'lyrics/already-done.txt';
  manifest.tracks[2].lyricSource = 'netease';
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await runLyrics(path.join(dir, 'manifest.json'));

  // Verify manifest not modified (lyricPath already set on all songs)
  const updated = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(updated.tracks[1].lyricPath, 'lyrics/already-done.txt');
  assert.equal(updated.tracks[2].lyricPath, 'lyrics/already-done.txt');
});

test('lyrics CLI via spawn works (integration smoke)', (t) => {
  const dir = createFixture(t);
  const repoRoot = path.resolve(__dirname, '..');

  // Pre-mark all songs as already having lyrics so no network calls are made
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.tracks[1].lyricPath = 'lyrics/already-done.txt';
  manifest.tracks[1].lyricSource = 'netease';
  manifest.tracks[2].lyricPath = 'lyrics/already-done.txt';
  manifest.tracks[2].lyricSource = 'netease';
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const result = spawnSync('node', ['tool.js', 'lyrics', '--manifest', path.join(dir, 'manifest.json')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /No tracks need lyrics/);
});
