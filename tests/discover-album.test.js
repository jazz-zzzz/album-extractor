const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { discoverAlbum } = require('../src/discover-album');

function createTempAlbum(t, files) {
  const albumDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-album-'));
  t.after(() => fs.rmSync(albumDir, { recursive: true, force: true }));
  for (const [fileName, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(albumDir, fileName), contents);
  }
  return albumDir;
}

test('discoverAlbum finds source, cover, timestamps in album dir', (t) => {
  const albumDir = createTempAlbum(t, {
    'live.flac': '',
    'cover.jpg': '',
    'timestamps.md': '',
  });

  const album = discoverAlbum(albumDir);

  assert.equal(album.albumDir, albumDir);
  assert.match(album.sourceAudioPath, /live\.flac$/i);
  assert.match(album.coverPath, /cover\.jpg$/i);
  assert.match(album.timestampsPath, /timestamps\.md$/i);
  assert.match(album.manifestPath, /manifest\.json$/i);
});

test('discoverAlbum rejects duplicate matching files', (t) => {
  const albumDir = createTempAlbum(t, {
    'side-a.flac': '',
    'side-b.flac': '',
    'cover.jpg': '',
    'timestamps.md': '',
  });

  assert.throws(
    () => discoverAlbum(albumDir),
    /Expected exactly one source audio.*found 2/i
  );
});

test('discoverAlbum rejects missing required files', (t) => {
  const albumDir = createTempAlbum(t, {
    'live.flac': '',
    'timestamps.md': '',
  });

  assert.throws(
    () => discoverAlbum(albumDir),
    /Missing cover art/i
  );
});

test('discoverAlbum accepts png cover and singular timestamp filename', (t) => {
  const albumDir = createTempAlbum(t, {
    'live-set.wav': '',
    'cover.png': '',
    'timestamp.md': '',
  });

  const album = discoverAlbum(albumDir);

  assert.match(album.sourceAudioPath, /live-set\.wav$/i);
  assert.match(album.coverPath, /cover\.png$/i);
  assert.match(album.timestampsPath, /timestamp\.md$/i);
});

test('discoverAlbum accepts video source files (mkv, mp4)', (t) => {
  const albumDir = createTempAlbum(t, {
    'concert.mkv': '',
    'cover.jpg': '',
    'timestamps.md': '',
  });

  const album = discoverAlbum(albumDir);
  assert.match(album.sourceAudioPath, /concert\.mkv$/i);
});

test('discoverAlbum prefers single source when both audio and video exist', (t) => {
  const albumDir = createTempAlbum(t, {
    'concert.flac': '',
    'concert.mkv': '',
    'cover.jpg': '',
    'timestamps.md': '',
  });

  assert.throws(
    () => discoverAlbum(albumDir),
    /Expected exactly one source/i
  );
});
