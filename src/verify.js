const fs = require('node:fs');
const path = require('node:path');

function summarizeBuild({ expectedCount, generatedFlacCount, generatedAlacCount, lyricFailures }) {
  const ok =
    expectedCount === generatedFlacCount &&
    expectedCount === generatedAlacCount &&
    lyricFailures.length === 0;

  return {
    ok,
    message: `${generatedFlacCount} FLAC, ${generatedAlacCount} ALAC` +
      (lyricFailures.length > 0 ? `, ${lyricFailures.length} lyric failures` : ''),
  };
}

function verifyOutput({ flacDir, alacDir, manifest }) {
  const musicTracks = manifest.tracks.filter((t) => !t.lyricLookupTitle || t.lyricLookupTitle !== null);

  const flacFiles = fs.readdirSync(flacDir).filter((f) => f.endsWith('.flac'));
  const alacFiles = fs.readdirSync(alacDir).filter((f) => f.endsWith('.m4a'));

  const expectedCount = manifest.tracks.length;
  const lyricFailures = [];

  // Check lyric embedding status
  if (manifest.wantsLyrics) {
    for (const track of musicTracks) {
      if (!track.lyricText) {
        lyricFailures.push({ track: track.normalizedTitle, reason: 'No lyric text in manifest' });
      }
    }
  }

  return summarizeBuild({
    expectedCount,
    generatedFlacCount: flacFiles.length,
    generatedAlacCount: alacFiles.length,
    lyricFailures,
  });
}

module.exports = { summarizeBuild, verifyOutput };
