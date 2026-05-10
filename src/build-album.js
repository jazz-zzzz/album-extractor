const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { readManifest } = require('./manifest');
const { buildFlacCommand, buildAlacCommand, buildExtractWavCommand, buildRefalacCommand, buildTrackFileName } = require('./ffmpeg');

const POOL_SIZE = 10;

const REFALAC_PATHS = [
  'refalac64',
  'refalac',
];

function resolveRefalac() {
  const ext = os.platform() === 'win32' ? '.exe' : '';
  // Check project-local first
  for (const name of REFALAC_PATHS) {
    const p = path.join(__dirname, '..', name + ext);
    if (fs.existsSync(p)) return p;
  }
  // Check Downloads
  for (const name of REFALAC_PATHS) {
    const p = path.join(os.homedir(), 'Downloads', 'qaac', 'qaac_*', 'x64', name + ext);
    // Glob-like check
    const dir = path.join(os.homedir(), 'Downloads', 'qaac');
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const e of entries) {
        const candidate = path.join(dir, e, 'x64', name + ext);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  // Fallback to bare name
  return 'refalac64';
}

function resolveBinary(name) {
  const ext = os.platform() === 'win32' ? '.exe' : '';
  const bin = name + ext;

  // Check configured path from env
  if (process.env.FFMPEG_HOME) {
    const p = path.join(process.env.FFMPEG_HOME, bin);
    if (fs.existsSync(p)) return p;
  }

  // Check common locations
  const candidates = [
    path.join(os.homedir(), 'Downloads', bin),
    path.join(os.homedir(), 'downloads', bin),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Fallback to bare name (hope it's in PATH)
  return name;
}

function assertApprovedManifest(manifest) {
  if (manifest.approved !== true) {
    throw new Error(
      'Manifest is not approved. Review and set "approved": true before building.'
    );
  }
}

function resolveTrackEnds(tracks, sourceDuration) {
  return tracks.map((track, i) => {
    if (track.end) return track;
    const next = tracks[i + 1];
    return {
      ...track,
      end: next ? next.start : sourceDuration,
    };
  });
}

async function getSourceDuration(sourcePath) {
  const ffmpegBin = resolveBinary('ffmpeg');

  function parseDuration(s) {
    const secs = parseFloat(s.trim());
    if (isNaN(secs)) throw new Error(`Could not parse duration: ${s}`);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const sec = Math.floor(secs % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  return new Promise((resolve, reject) => {
    // Try ffprobe first if available
    const ffprobeBin = resolveBinary('ffprobe');
    if (fs.existsSync(ffprobeBin)) {
      const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', sourcePath];
      const proc = spawn(ffprobeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d; });
      proc.on('close', (code) => {
        if (code === 0) {
          try { resolve(parseDuration(stdout)); } catch (e) { reject(e); }
          return;
        }
        fallbackToFfmpeg();
      });
      proc.on('error', () => fallbackToFfmpeg());
      return;
    }
    fallbackToFfmpeg();

    function fallbackToFfmpeg() {
      const proc2 = spawn(ffmpegBin, ['-i', sourcePath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc2.stderr.on('data', (d) => { stderr += d; });
      proc2.on('close', () => {
        const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          resolve(`${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${String(Math.floor(parseFloat(match[3]))).padStart(2, '0')}`);
        } else {
          reject(new Error('Could not determine source duration'));
        }
      });
      proc2.on('error', reject);
    }
  });
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function processTrack(track, manifest, flacDir, alacDir, skipFlac, useRefalac) {
  const alacOut = path.join(alacDir, buildTrackFileName(track, 'm4a'));

  const buildOpts = {
    sourceAudioPath: manifest.sourceAudioPath,
    coverPath: manifest.coverPath,
    track,
    albumTitle: manifest.albumTitle,
    artist: manifest.artist,
    year: manifest.year,
  };

  let alacJob;
  if (useRefalac) {
    // Two-step: ffmpeg extracts WAV, refalac encodes to ALAC M4A
    const wavPath = alacOut.replace(/\.m4a$/, '.wav');
    alacJob = runProcess(resolveBinary('ffmpeg'), buildExtractWavCommand({ ...buildOpts, outputPath: wavPath }))
      .then(() => runProcess(resolveRefalac(), buildRefalacCommand({ ...buildOpts, wavPath, coverPath: manifest.coverPath, outputPath: alacOut })))
      .then(() => { try { fs.unlinkSync(wavPath); } catch (_) {} });
  } else {
    alacJob = runProcess(resolveBinary('ffmpeg'), buildAlacCommand({ ...buildOpts, outputPath: alacOut }));
  }

  const jobs = [alacJob];

  if (!skipFlac) {
    const flacOut = path.join(flacDir, buildTrackFileName(track, 'flac'));
    jobs.push(
      runProcess(resolveBinary('ffmpeg'), buildFlacCommand({ ...buildOpts, outputPath: flacOut }))
    );
  }

  try {
    await Promise.all(jobs);
    return { status: 'built', track: track.normalizedTitle };
  } catch (err) {
    return { status: 'failed', track: track.normalizedTitle, error: err.message };
  }
}

async function withConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function buildAlbum({ manifestPath, sourceDuration, skipFlac, useRefalac }) {
  const manifest = readManifest(manifestPath);
  assertApprovedManifest(manifest);

  const baseDir = path.dirname(manifestPath);
  const alacDir = path.join(baseDir, 'ALAC');
  // Clean old output to prevent stale files from masking failures
  fs.rmSync(alacDir, { recursive: true, force: true });
  fs.mkdirSync(alacDir, { recursive: true });

  let flacDir = null;
  if (!skipFlac) {
    flacDir = path.join(baseDir, 'tracks');
    fs.rmSync(flacDir, { recursive: true, force: true });
    fs.mkdirSync(flacDir, { recursive: true });
  }

  let duration = sourceDuration;
  if (!duration) {
    console.log('Probing source duration…');
    duration = await getSourceDuration(manifest.sourceAudioPath);
    console.log(`  Source duration: ${duration}`);
  }

  const tracks = resolveTrackEnds(manifest.tracks, duration);
  const total = tracks.length;

  console.log(`Building ${total} tracks (pool: ${POOL_SIZE} workers)…`);

  const taskFns = tracks.map((track) => () => processTrack(track, manifest, flacDir, alacDir, skipFlac, useRefalac));
  const results = await withConcurrency(taskFns, POOL_SIZE);

  const built = results.filter((r) => r.status === 'built').length;
  const failures = results.filter((r) => r.status === 'failed');

  if (failures.length > 0) {
    const msg = failures.map((f) => `${f.track}: ${f.error}`).join('\n  ');
    throw new Error(`${failures.length} track(s) failed:\n  ${msg}`);
  }

  return { total, completed: built, failures };
}

module.exports = { buildAlbum, assertApprovedManifest, resolveTrackEnds, getSourceDuration };
