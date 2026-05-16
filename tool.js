#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { discoverAlbum } = require('./src/discover-album');
const { parseTimestamps } = require('./src/parse-timestamps');
const { createManifestObject, writeManifest, readManifest } = require('./src/manifest');
const { cleanTitle, isNonMusicTrack } = require('./src/normalize');
const { buildAlbum, resolveBinary } = require('./src/build-album');
const { verifyOutput } = require('./src/verify');
const { formatError } = require('./src/errors');
const { buildTrackFileName } = require('./src/ffmpeg');
const { spawn } = require('node:child_process');
const lyrics = require('./src/lyrics');

// ── argument parsing (CLI only) ──

let command, params, flags, positional, noFlac, useRefalac, embedLyrics;

if (require.main === module) {
  const raw = process.argv.slice(2);

  const commandIdx = raw.findIndex((a) => !a.startsWith('-'));
  if (commandIdx === -1) {
    console.error('Usage: node tool.js <manifest|build|summary|lyrics> [options]');
    process.exit(1);
  }
  command = raw[commandIdx];

  const rest = raw.slice(commandIdx + 1);
  params = {};
  flags = new Set();
  positional = [];
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

  const validCommands = new Set(['manifest', 'build', 'summary', 'lyrics']);
  if (!validCommands.has(command)) {
    console.error('Usage: node tool.js <manifest|build|summary|lyrics> [options]');
    process.exit(1);
  }

  noFlac = flags.has('--no-flac');
  useRefalac = flags.has('--use-refalac');
  embedLyrics = flags.has('--embed');
}

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

function cleanTracks(tracks, artist) {
  return tracks.map((track) => {
    if (isNonMusicTrack(track.rawTitle)) {
      return {
        ...track,
        normalizedTitle: track.rawTitle,
        normalizationStatus: 'not_applicable',
        trackKind: 'mc',
        evidenceUrl: null,
        lyricLookupTitle: null,
        notes: ['MC/talk segment'],
      };
    }
    const cleaned = cleanTitle(track.rawTitle);
    const cleanedSomething = cleaned !== track.rawTitle.trim();
    return {
      ...track,
      normalizedTitle: cleaned,
      normalizationStatus: cleanedSomething ? 'cleaned' : 'raw',
      trackKind: 'song',
      evidenceUrl: null,
      lyricLookupTitle: `${artist} ${cleaned}`,
      notes: cleanedSomething ? ['Title cleaned locally — needs AI research for official name'] : ['Needs AI research for official name'],
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
  const tracksWithIntro = ensureIntroTrack(cleanedTracks);
  if (tracksWithIntro.length > cleanedTracks.length) {
    console.log('  Prepended Intro track (first track starts after 00:00:00)');
  }

  const manifest = createManifestObject({
    albumName,
    artist,
    sourceAudioPath: sourcePath,
    coverPath,
    timestampsPath,
    researchedTracks: tracksWithIntro,
  });

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.mkdirSync(outputDir, { recursive: true });
  writeManifest(manifestPath, manifest);
  console.log(`Manifest written: ${manifestPath}`);

  printSummary(tracksWithIntro);
}

// ── manifest: directory mode ──

async function runManifestDirectory(albumDir, artistOverride) {
  const album = discoverAlbum(albumDir);
  const parsedTracks = parseTimestamps(fs.readFileSync(album.timestampsPath, 'utf8'));

  const artist = artistOverride || 'Unknown Artist';
  console.log(`Cleaning ${parsedTracks.length} tracks…`);
  const cleanedTracks = cleanTracks(parsedTracks, artist);
  const tracksWithIntro = ensureIntroTrack(cleanedTracks);
  if (tracksWithIntro.length > cleanedTracks.length) {
    console.log('  Prepended Intro track (first track starts after 00:00:00)');
  }

  const manifest = createManifestObject({
    albumName: album.albumName,
    artist,
    sourceAudioPath: album.sourceAudioPath,
    coverPath: album.coverPath,
    timestampsPath: album.timestampsPath,
    researchedTracks: tracksWithIntro,
  });

  writeManifest(album.manifestPath, manifest);
  console.log(`Manifest written: ${album.manifestPath}`);

  printSummary(tracksWithIntro);
}

function ensureIntroTrack(tracks) {
  if (tracks.length === 0) return tracks;
  const first = tracks[0];
  if (first.start === '00:00:00') return tracks;

  const intro = {
    number: 1,
    start: '00:00:00',
    end: first.start,
    rawTitle: 'Intro',
    normalizedTitle: 'Intro',
    normalizationStatus: 'not_applicable',
    trackKind: 'intro',
    evidenceUrl: null,
    lyricLookupTitle: null,
    notes: [`First track starts at ${first.start}`],
  };

  const shifted = tracks.map((t) => ({ ...t, number: t.number + 1 }));
  return [intro, ...shifted];
}

function printSummary(tracks) {
  const mcCount = tracks.filter((t) => t.trackKind === 'mc').length;
  const introCount = tracks.filter((t) => t.trackKind === 'intro').length;
  const needReview = tracks.filter((t) => t.trackKind === 'song').length;
  const parts = [`${needReview} need review`, `${mcCount} MC/talk`];
  if (introCount > 0) parts.push(`${introCount} intro`);
  console.log(`  ${parts.join(', ')}`);
}

// ── summary ──

function runSummary(manifestPath) {
  const manifest = readManifest(manifestPath);

  const tracks = manifest.tracks || [];
  const total = tracks.length;
  const mcCount = tracks.filter((t) => t.trackKind === 'mc').length;
  const introCount = tracks.filter((t) => t.trackKind === 'intro').length;
  const songCount = tracks.filter((t) => t.trackKind === 'song').length;
  const needReview = tracks.filter((t) => t.trackKind === 'song' && (t.normalizationStatus === 'needs_review' || t.normalizationStatus === 'raw' || t.normalizationStatus === 'cleaned'));
  const verified = tracks.filter((t) => t.normalizationStatus === 'verified');

  console.log(`Album: ${manifest.albumTitle}`);
  console.log(`Artist: ${manifest.artist}`);
  console.log(`Year: ${manifest.year || '?'}`);
  console.log(`Tracks: ${total} total, ${songCount} songs, ${mcCount} MC, ${introCount} intro`);
  console.log(`Status: ${verified.length} verified, ${needReview.length} need review`);

  if (manifest.approved) {
    console.log('Approved: yes');
  } else {
    console.log('Approved: NO — review and set "approved": true before build');
  }

  if (needReview.length > 0) {
    console.log('');
    console.log('Needs review:');
    for (const t of needReview) {
      const marker = t.normalizationStatus === 'needs_review' ? '?' : ' ';
      console.log(`  ${String(t.number).padStart(2, '0')} [${t.normalizationStatus}] ${marker} ${t.rawTitle}`);
      if (t.normalizedTitle !== t.rawTitle) {
        console.log(`       -> ${t.normalizedTitle}`);
      }
    }
  }
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

// ── lyrics ──

async function embedLyricsInFile(trackPath, lyrics) {
  const ext = path.extname(trackPath).toLowerCase();
  const tmpPath = trackPath.replace(new RegExp(ext + '$'), '.embed' + ext);

  return new Promise((resolve, reject) => {
    const args = ['-i', trackPath, '-c', 'copy', '-map', '0', '-metadata', `lyrics=${lyrics}`, tmpPath];
    const proc = spawn(resolveBinary('ffmpeg'), args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0) {
        try { fs.renameSync(tmpPath, trackPath); resolve(true); }
        catch (e) { reject(e); }
      } else {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`));
      }
    });
    proc.on('error', reject);
  });
}

async function runLyrics(manifestPath, embed = false) {
  const manifest = readManifest(manifestPath);
  const baseDir = path.dirname(manifestPath);

  const songs = (manifest.tracks || []).filter((t) => {
    if (t.lyricPath) return false;
    if (t.trackKind === 'mc' || t.trackKind === 'intro' || t.isNonMusic) return false;
    if (!t.normalizedTitle) return false;
    return true;
  });

  if (songs.length === 0) {
    console.log('No tracks need lyrics.');
    return;
  }

  const lyricsDir = path.join(baseDir, 'lyrics');
  fs.mkdirSync(lyricsDir, { recursive: true });

  console.log(`Fetching lyrics for ${songs.length} tracks from Netease…`);
  let ok = 0;
  let failed = 0;

  for (const track of songs) {
    const prefix = String(track.number).padStart(2, '0');
    process.stdout.write(`  ${prefix} ${track.normalizedTitle} ... `);

    try {
      const result = await lyrics.fetchLyricsForTrack(
        manifest.artist,
        track.lyricLookupTitle || track.normalizedTitle
      );

      if (result && result.text) {
        const safeTitle = track.normalizedTitle.replace(/[<>:"/\\|?*]/g, '_');
        const filename = `${prefix}-${safeTitle}.txt`;
        const filePath = path.join(lyricsDir, filename);
        fs.writeFileSync(filePath, result.text, 'utf8');

        track.lyricSource = result.source;
        track.lyricPath = `lyrics/${filename}`;

        let embedStatus = '';
        if (embed) {
          const embedText = result.ttlm || result.text;
          const alacDir = path.join(baseDir, 'ALAC');
          const flacDir = path.join(baseDir, 'tracks');
          for (const [dir, ext] of [[alacDir, 'm4a'], [flacDir, 'flac']]) {
            if (!fs.existsSync(dir)) continue;
            const trackFile = path.join(dir, buildTrackFileName(track, ext));
            if (!fs.existsSync(trackFile)) continue;
            try {
              await embedLyricsInFile(trackFile, embedText);
            } catch (_) {
              embedStatus += ` embed-${ext}:failed`;
            }
          }
        }

        console.log(`OK (${result.source}, ${result.text.split('\n').length} lines${embedStatus})`);
        ok++;
      } else {
        track.lyricSource = 'not_found';
        track.lyricPath = null;
        console.log('NOT FOUND');
        failed++;
      }
    } catch (err) {
      track.lyricSource = 'not_found';
      track.lyricPath = null;
      console.log(`ERROR: ${err.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  writeManifest(manifestPath, manifest);
  console.log(`\nDone: ${ok} fetched, ${failed} not found. Manifest updated.`);
}

// ── exports ──

module.exports = { runManifestDirectory, runManifestExplicit, runSummary, runBuild, runLyrics, cleanTracks, ensureIntroTrack, printSummary };

// ── dispatch ──

if (require.main === module) {
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
    } else if (command === 'summary') {
      const manifestPath = params.manifest || path.join(positional[0] || '.', 'manifest.json');
      runSummary(path.isAbsolute(manifestPath) ? manifestPath : path.resolve(manifestPath));
    } else if (command === 'lyrics') {
      const manifestPath = params.manifest || path.join(positional[0] || '.', 'manifest.json');
      runLyrics(
        path.isAbsolute(manifestPath) ? manifestPath : path.resolve(manifestPath),
        embedLyrics
      ).catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
