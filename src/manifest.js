const fs = require('node:fs');

function createManifestObject({
  albumName,
  artist,
  sourceAudioPath,
  coverPath,
  timestampsPath,
  researchedTracks,
  year = null,
  albumEvidenceUrl = null,
  wantsLyrics = false,
}) {
  return {
    approved: false,
    albumTitle: albumName,
    albumEvidenceUrl,
    artist: artist || 'Unknown Artist',
    year,
    wantsLyrics,
    sourceAudioPath,
    coverPath,
    timestampsPath,
    notes: [],
    tracks: researchedTracks.map((track) => ({
      number: track.number,
      start: track.start,
      end: null,
      rawTitle: track.rawTitle,
      normalizedTitle: track.normalizedTitle,
      evidenceUrl: track.evidenceUrl ?? null,
      lyricLookupTitle: track.lyricLookupTitle ?? null,
      lyricText: null,
      lyricSource: track.lyricSource ?? null,
      notes: track.notes ?? [],
    })),
  };
}

function writeManifest(manifestPath, manifest) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function readManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

module.exports = {
  createManifestObject,
  writeManifest,
  readManifest,
};
