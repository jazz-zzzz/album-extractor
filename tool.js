#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { discoverAlbum } = require('./src/discover-album');
const { parseTimestamps } = require('./src/parse-timestamps');
const { createManifestObject, writeManifest } = require('./src/manifest');
const { researchAlbum } = require('./src/research');
const { buildAlbum } = require('./src/build-album');
const { verifyOutput } = require('./src/verify');

// ── argument parsing ──

const raw = process.argv.slice(2);

// Separate command from the rest
const commandIdx = raw.findIndex((a) => !a.startsWith('-'));
if (commandIdx === -1) {
  console.error('Usage: node tool.js <manifest|build> [options]');
  process.exit(1);
}
const command = raw[commandIdx];

// Everything after the command
const rest = raw.slice(commandIdx + 1);

// Parse --key value pairs, --flags, and collect positionals
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

const online = flags.has('--online');

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

// ── manifest: explicit mode ──

async function runManifestExplicit() {
  const artist = requireParam('artist');
  const albumName = requireParam('album');
  const sourcePath = requireParam('source');
  const timestampsPath = requireParam('timestamps');
  const coverPath = requireParam('cover');
  const outputDir = params.output || resolveSourceDir(sourcePath);

  const timestampMarkdown = fs.readFileSync(timestampsPath, 'utf8');
  const parsedTracks = parseTimestamps(timestampMarkdown);

  console.log(`Researching ${parsedTracks.length} tracks…`);
  const researchedTracks = await researchAlbum({
    tracks: parsedTracks,
    albumName,
    artist,
    options: { offline: !online },
  });

  const manifest = createManifestObject({
    albumName,
    artist,
    sourceAudioPath: sourcePath,
    coverPath,
    timestampsPath,
    researchedTracks,
  });

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.mkdirSync(outputDir, { recursive: true });
  writeManifest(manifestPath, manifest);
  console.log(`Manifest written: ${manifestPath}`);

  printSummary(researchedTracks);
}

// ── manifest: directory mode ──

async function runManifestDirectory(albumDir, artistOverride) {
  const album = discoverAlbum(albumDir);
  const timestampMarkdown = fs.readFileSync(album.timestampsPath, 'utf8');
  const parsedTracks = parseTimestamps(timestampMarkdown);

  const artist = artistOverride || 'Unknown Artist';

  console.log(`Researching ${parsedTracks.length} tracks…`);
  const researchedTracks = await researchAlbum({
    tracks: parsedTracks,
    albumName: album.albumName,
    artist,
    options: { offline: !online },
  });

  const manifest = createManifestObject({
    albumName: album.albumName,
    artist,
    sourceAudioPath: album.sourceAudioPath,
    coverPath: album.coverPath,
    timestampsPath: album.timestampsPath,
    researchedTracks,
  });

  writeManifest(album.manifestPath, manifest);
  console.log(`Manifest written: ${album.manifestPath}`);

  printSummary(researchedTracks);
}

// ── shared ──

function printSummary(tracks) {
  const mcCount = tracks.filter((t) => t.isNonMusic).length;
  const geniusHits = tracks.filter((t) => t.lyricSource === 'genius').length;
  const needReview = tracks.filter(
    (t) => !t.isNonMusic && t.lyricSource !== 'genius'
  ).length;
  console.log(
    `  ${geniusHits} Genius hits, ${needReview} need review, ${mcCount} MC/talk`
  );
}

// ── build ──

async function runBuild(manifestPath) {
  console.log(`Building from: ${manifestPath}`);
  const result = await buildAlbum({ manifestPath, sourceDuration: params.duration });

  console.log('');
  console.log(`Build complete: ${result.completed} built, ${result.failures.length} failed`);
  if (result.failures.length > 0) {
    console.log('Failures:');
    for (const f of result.failures) {
      console.log(`  ✗ ${f.track}: ${f.error}`);
    }
  }

  // Verify
  const manifest = require('./src/manifest').readManifest(manifestPath);
  const baseDir = path.dirname(manifestPath);
  const summary = verifyOutput({
    flacDir: path.join(baseDir, 'tracks'),
    alacDir: path.join(baseDir, 'ALAC'),
    manifest,
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
      // Directory mode: first positional is the album dir
      if (positional.length === 0) {
        console.error(
          'Usage: node tool.js manifest <album-dir> [--artist <name>] [--online]\n' +
          '       node tool.js manifest --artist <name> --album <name> --source <path> --timestamps <path> --cover <path> [--output <dir>] [--online]'
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
