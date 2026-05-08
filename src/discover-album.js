const fs = require('node:fs');
const path = require('node:path');

const AUDIO_EXTENSIONS = new Set(['.flac', '.m4a', '.wav', '.aiff']);
const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.mov', '.webm', '.ts', '.m2ts', '.avi']);
const SOURCE_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);
const COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const TIMESTAMPS_PATTERN = /^timestamps?\.md$/i;

function discoverAlbum(albumDir) {
  const entries = fs.readdirSync(albumDir, { withFileTypes: true });

  const sourceAudioPath = findRequiredFile(
    entries,
    albumDir,
    (entry) => SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    'source audio/video'
  );
  const coverPath = findRequiredFile(
    entries,
    albumDir,
    (entry) => COVER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
    'cover art'
  );
  const timestampsPath = findRequiredFile(
    entries,
    albumDir,
    (entry) => TIMESTAMPS_PATTERN.test(entry.name),
    'timestamps markdown'
  );

  return {
    albumDir,
    albumName: path.basename(albumDir),
    sourceAudioPath,
    coverPath,
    timestampsPath,
    outputTracksDir: path.join(albumDir, 'tracks'),
    outputAlacDir: path.join(albumDir, 'ALAC'),
    manifestPath: path.join(albumDir, 'manifest.json'),
  };
}

function findRequiredFile(entries, albumDir, predicate, label) {
  const matches = entries.filter((entry) => entry.isFile() && predicate(entry));

  if (matches.length === 0) {
    throw new Error(`Missing ${label} in album directory: ${albumDir}`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one ${label} in album directory: ${albumDir}; found ${matches.length}`
    );
  }

  return path.join(albumDir, matches[0].name);
}

module.exports = {
  discoverAlbum,
};
