#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { discoverAlbum } = require('./src/discover-album');
const { parseTimestamps } = require('./src/parse-timestamps');
const { createManifestObject, writeManifest, readManifest } = require('./src/manifest');
const { cleanTitle, isNonMusicTrack } = require('./src/normalize');
const { buildAlbum } = require('./src/build-album');
const { verifyOutput } = require('./src/verify');

// ── argument parsing ──

const raw = process.argv.slice(2);

const commandIdx = raw.findIndex((a) => !a.startsWith('-'));
if (commandIdx === -1) {
  console.error('Usage: node tool.js <manifest|build> [options]');
  process.exit(1);
}
const command = raw[commandIdx];

const rest = raw.slice(commandIdx + 1);
const params = {};
const flags = new Set();
const positional = [];
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      params[key] = next;
      i++;
    } else {
      flags.add('--' + key);
    }
  } else {
    positional.push(arg);
  }
}

const validCommands = new Set(['manifest', 'build']);
if (!validCommands.has(command)) {
  console.error('Usage: node tool.js <manifest|build> [options]');
  process.exit(1);
}

const noFlac = flags.has('--no-flac');
const useRefalac = flags.has('--use-refalac');

// ── helpers ──

function resolveSourceDir(sourcePath) {
  return path.join(
    path.dirname(sourcePath),
    path.basename(sourcePath, path.extname(sourcePath))
  );
}

function requireParam(name) {
  if (!params[name]) {
    console.error(`Missing required parameter: --${name}`);
    process.exit(1);
  }
  return params[name];
}

// Local title cleaning — strips translations and marks MC/talk tracks.
// The AI agent does the actual research/normalization via WebSearch.
function cleanTracks(tracks, artist) {
  return tracks.map((track) => {
    if (isNonMusicTrack(track.rawTitle)) {
      return {
        ...track,
        normalizedTitle: track.rawTitle,
        evidenceUrl: null,
        lyricLookupTitle: null,
        isNonMusic: true,
        notes: ['MC/talk segment'],
      };
    }
    const cleaned = cleanTitle(track.rawTitle);
    return {
      ...track,
      normalizedTitle: cleaned,
      evidenceUrl: null,
      lyricLookupTitle: `${artist} ${cleaned}`,
      isNonMusic: false,
      notes: ['Title cleaned locally — needs AI research for official name'],
    };
  });
}

// ── manifest: explicit mode ──

async function runManifestExplicit() {
  const artist = requireParam('artist');
  const albumName = requireParam('album');
  const sourcePath = requireParam('source');
  const timestampsPath = requireParam('timestamps');
  const coverPath = requireParam('cover');
  const outputDir = params.output || resolveSourceDir(sourcePath);

  const parsedTracks = parseTimestamps(fs.readFileSync(timestampsPath, 'utf8'));
  console.log(`Cleaning ${parsedTracks.length} tracks…`);
  const cleanedTracks = cleanTracks(parsedTracks, artist);

  const manifest = createManifestObject({
    albumName,
    artist,
    sourceAudioPath: sourcePath,
    coverPath,
    timestampsPath,
    researchedTracks: cleanedTracks,
  });

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.mkdirSync(outputDir, { recursive: true });
  writeManifest(manifestPath, manifest);
  console.log(`Manifest written: ${manifestPath}`);

  printSummary(cleanedTracks);
}

// ── manifest: directory mode ──

async function runManifestDirectory(albumDir, artistOverride) {
  const album = discoverAlbum(albumDir);
  const parsedTracks = parseTimestamps(fs.readFileSync(album.timestampsPath, 'utf8'));

  const artist = artistOverride || 'Unknown Artist';
  console.log(`Cleaning ${parsedTracks.length} tracks…`);
  const cleanedTracks = cleanTracks(parsedTracks, artist);

  const manifest = createManifestObject({
    albumName: album.albumName,
    artist,
    sourceAudioPath: album.sourceAudioPath,
    coverPath: album.coverPath,
    timestampsPath: album.timestampsPath,
    researchedTracks: cleanedTracks,
  });

  writeManifest(album.manifestPath, manifest);
  console.log(`Manifest written: ${album.manifestPath}`);

  printSummary(cleanedTracks);
}

// ── shared ──

function printSummary(tracks) {
  const mcCount = tracks.filter((t) => t.isNonMusic).length;
  const needReview = tracks.filter((t) => !t.isNonMusic).length;
  console.log(`  ${needReview} need review, ${mcCount} MC/talk`);
}

// ── build ──

async function runBuild(manifestPath) {
  console.log(`Building from: ${manifestPath}`);
  const result = await buildAlbum({ manifestPath, sourceDuration: params.duration, skipFlac: noFlac, useRefalac });

  console.log('');
  console.log(`Build complete: ${result.completed} built, 0 failed`);

  const manifest = readManifest(manifestPath);
  const baseDir = path.dirname(manifestPath);
  const summary = verifyOutput({
    flacDir: path.join(baseDir, 'tracks'),
    alacDir: path.join(baseDir, 'ALAC'),
    manifest,
    skipFlac: noFlac,
  });
  console.log(`Verification: ${summary.message}`);
  if (!summary.ok) process.exit(1);
}

// ── dispatch ──

try {
  if (command === 'manifest') {
    if (params.source) {
      runManifestExplicit().catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
    } else {
      if (positional.length === 0) {
        console.error(
          'Usage: node tool.js manifest <album-dir> [--artist <name>]\n' +
          '       node tool.js manifest --artist <name> --album <name> --source <path> --timestamps <path> --cover <path> [--output <dir>]'
        );
        process.exit(1);
      }
      const albumDir = positional[0];
      const artist = params.artist || null;
      runManifestDirectory(
        path.isAbsolute(albumDir) ? albumDir : path.resolve(albumDir),
        artist
      ).catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
    }
  } else if (command === 'build') {
    const manifestPath = params.manifest || path.join(positional[0] || '.', 'manifest.json');
    runBuild(path.isAbsolute(manifestPath) ? manifestPath : path.resolve(manifestPath)).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
