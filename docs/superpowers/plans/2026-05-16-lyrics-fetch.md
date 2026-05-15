# Lyrics Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `node tool.js lyrics --manifest <path>` command that fetches plain-text lyrics from Netease Cloud Music for all songs in a manifest, saves to `lyrics/` directory, and records source metadata.

**Architecture:** `src/lyrics.js` provides `fetchLyricsForTrack(artist, title)` — tries Netease search → lyric API → LRC-to-plain conversion. `tool.js` gains a `lyrics` command that reads manifest, filters for songs needing lyrics, calls the fetcher, writes files, and updates manifest. Netease is primary (free API, no auth, no proxy in China); Genius scrape is retained as fallback.

**Tech Stack:** Node.js built-in `https` module with HTTP CONNECT proxy tunnel for Genius fallback. No external dependencies.

---

### Task 1: Productionize lyrics fetch module

**Files:**
- Modify: `src/lyrics.js` (complete rewrite from prototype to production)

- [ ] **Step 1: Replace prototype with production module**

Write `src/lyrics.js`:

```js
// Lyrics fetcher — Netease Cloud Music (primary) + Genius HTML scrape (fallback).
const https = require('node:https');
const http = require('node:http');
const zlib = require('node:zlib');

// ── HTTP helpers ──

const PROXY_URL = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:7897';

function proxyTunnel(hostname, port) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(PROXY_URL);
    const req = http.request({
      hostname: proxy.hostname,
      port: proxy.port || 7897,
      method: 'CONNECT',
      path: `${hostname}:${port}`,
    });
    req.on('connect', (_res, socket) => resolve(socket));
    req.on('error', reject);
    req.end();
  });
}

function request(opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...opts.headers,
      },
    };

    function handleRes(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(request({ ...opts, url: res.headers.location }));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${opts.url}`));
      }
      if (opts.raw) {
        // Return raw response stream for HTML scraping
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        return;
      }
      // JSON response with gzip support
      const chunks = [];
      const stream = res.headers['content-encoding'] === 'gzip'
        ? res.pipe(zlib.createGunzip())
        : res;
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }

    function doReq() {
      const req = https.get(reqOpts, handleRes);
      req.on('error', reject);
      req.end();
    }

    if (PROXY_URL && new URL(PROXY_URL).hostname) {
      proxyTunnel(u.hostname, u.port || 443)
        .then((socket) => {
          https.get({ ...reqOpts, socket, agent: false }, handleRes).on('error', reject);
        })
        .catch(() => doReq());
    } else {
      doReq();
    }
  });
}

// ── Netease Cloud Music ──

async function searchNetease(keyword) {
  const data = await request({
    url: `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&offset=0&limit=5`,
    headers: { 'Referer': 'https://music.163.com/' },
  });
  if (data.code !== 200 || !data.result || !data.result.songs) return [];
  return data.result.songs.map((s) => ({
    id: s.id,
    title: s.name,
    artists: (s.artists || []).map((a) => a.name).join('/'),
  }));
}

async function fetchNeteaseLyrics(songId) {
  const data = await request({
    url: `https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&tv=-1`,
    headers: { 'Referer': 'https://music.163.com/' },
  });
  if (data.code !== 200) return null;
  const result = {};
  if (data.lrc && data.lrc.lyric) result.lrc = data.lrc.lyric;
  if (data.tlyric && data.tlyric.lyric) result.tlyric = data.tlyric.lyric;
  return result;
}

// ── Genius (fallback) ──

async function fetchGeniusLyrics(url) {
  const html = await request({ url, raw: true });
  const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>(.*?)<\/div>/gs;
  const matches = html.match(containerRegex);
  if (!matches || matches.length === 0) return null;

  const noiseRegex = /(?:^\d+\s*)?(?:Contributors?|Translations?|Romanization|English\s*Translation|Embed|Share|Copy|Copy\s*Link|by\s+Genius).*$/gim;

  const lines = [];
  for (const match of matches) {
    let text = match
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(noiseRegex, '')
      .trim();
    if (text) lines.push(text);
  }
  return lines.join('\n\n');
}

// ── LRC to plain text ──

function lrcToPlain(lrc) {
  return lrc
    .split('\n')
    .map((line) => line.replace(/\[\d{2}:\d{2}[.:]\d{2,3}\]/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

// ── Main entry point ──

async function fetchLyricsForTrack(artist, title) {
  const keyword = `${artist} ${title}`.trim();
  const results = await searchNetease(keyword);
  if (results.length === 0) return null;

  const best = results[0];
  const lyricData = await fetchNeteaseLyrics(best.id);
  if (!lyricData || !lyricData.lrc) return null;

  return {
    text: lrcToPlain(lyricData.lrc),
    source: 'netease',
    neteaseId: best.id,
    neteaseTitle: best.title,
  };
}

module.exports = { fetchLyricsForTrack, searchNetease, fetchNeteaseLyrics, fetchGeniusLyrics, lrcToPlain, request };
```

- [ ] **Step 2: Run existing netease prototype to verify refactor doesn't break**

```bash
# Temporarily update test to use new module path, or just run a quick smoke
node -e "const { fetchLyricsForTrack } = require('./src/lyrics'); fetchLyricsForTrack('サカナクション', 'グッドバイ').then(r => console.log(r ? 'OK ' + r.text.split('\n').length + ' lines' : 'FAIL'))"
```

Expected: `OK 33 lines` (or similar line count, verifying Netease API still works)

- [ ] **Step 3: Clean up prototype test files**

Remove `tests/lyrics-prototype.js` and `tests/lyrics-netease.js` — they were exploration scripts, not proper tests.

```bash
rm tests/lyrics-prototype.js tests/lyrics-netease.js
```

- [ ] **Step 4: Commit**

```bash
git add src/lyrics.js
git rm tests/lyrics-prototype.js tests/lyrics-netease.js
git commit -m "feat: productionize lyrics fetch module with Netease primary source"
```

---

### Task 2: Add lyrics CLI command

**Files:**
- Modify: `tool.js` (add `lyrics` command dispatch + `runLyrics` function)

- [ ] **Step 1: Add `lyrics` to valid commands and dispatch**

In `tool.js`, find `const validCommands` and add `lyrics`:

```js
const validCommands = new Set(['manifest', 'build', 'summary', 'lyrics']);
```

- [ ] **Step 2: Add `lyrics` to dispatch block**

In `tool.js`, after the `summary` else-if block, add:

```js
  } else if (command === 'lyrics') {
    const manifestPath = params.manifest || path.join(positional[0] || '.', 'manifest.json');
    runLyrics(
      path.isAbsolute(manifestPath) ? manifestPath : path.resolve(manifestPath)
    ).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
```

- [ ] **Step 3: Add imports at top of tool.js**

Add to the existing require block:

```js
const { fetchLyricsForTrack } = require('./src/fetch-lyrics');
```

Wait — the module is still `./src/lyrics`. Let me use `./src/lyrics`:

```js
// Add this line after existing requires:
const { fetchLyricsForTrack } = require('./src/lyrics');
```

- [ ] **Step 4: Add `runLyrics` function**

Insert before the `// ── dispatch ──` section:

```js
// ── lyrics ──

async function runLyrics(manifestPath) {
  const manifest = readManifest(manifestPath);
  const baseDir = path.dirname(manifestPath);

  const songs = manifest.tracks.filter(
    (t) => t.trackKind === 'song' && t.normalizedTitle && !t.lyricPath
  );

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
      const result = await fetchLyricsForTrack(
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

        console.log(`OK (${result.source}, ${result.text.split('\n').length} lines)`);
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

    // Rate limit: 1 req/sec to be polite
    await new Promise((r) => setTimeout(r, 1000));
  }

  writeManifest(manifestPath, manifest);
  console.log(`\nDone: ${ok} fetched, ${failed} not found. Manifest updated.`);
}
```

Note: We also need to add `path` and `fs` requires at top of tool.js. They're already there — verify by checking existing imports.

- [ ] **Step 5: Commit**

```bash
git add tool.js
git commit -m "feat: add lyrics CLI command to tool.js"
```

---

### Task 3: Unit tests for lyrics module

**Files:**
- Create: `tests/fetch-lyrics.test.js`

- [ ] **Step 1: Write unit test for lrcToPlain**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { lrcToPlain } = require('../src/lyrics');

test('lrcToPlain strips timestamps and returns plain text', () => {
  const lrc = [
    '[00:12.34]君が言うような',
    '[00:16.00]淋しさは感じないけど',
    '[00:20.50]思い出した',
  ].join('\n');

  const result = lrcToPlain(lrc);
  const lines = result.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '君が言うような');
  assert.equal(lines[1], '淋しさは感じないけど');
  assert.equal(lines[2], '思い出した');
});

test('lrcToPlain skips empty lines and metadata lines', () => {
  const lrc = [
    '[ti:ユリイカ]',
    '[ar:サカナクション]',
    '[00:05.00]思い出した',
    '',
    '[00:10.00]ここは東京',
  ].join('\n');

  const result = lrcToPlain(lrc);
  const lines = result.split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '思い出した');
  assert.equal(lines[1], 'ここは東京');
});

test('lrcToPlain handles lines without timestamps', () => {
  const lrc = [
    '[00:01.00]hello',
    'world',
    '[00:02.00]foo',
  ].join('\n');

  const result = lrcToPlain(lrc);
  const lines = result.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], 'world');
});

test('lrcToPlain handles 3-digit milliseconds', () => {
  const lrc = '[00:01.500]hello world';
  const result = lrcToPlain(lrc);
  assert.equal(result, 'hello world');
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/fetch-lyrics.test.js
```

Expected: 4 tests PASS

- [ ] **Step 3: Write integration test for searchNetease (live API call)**

Note: These tests require network access to music.163.com. Mark with a flag or skip in CI.

```js
// Live API integration tests — skipped when offline
const NETLIVE = process.env.NETLIVE === '1';

test('searchNetease finds known song', { skip: !NETLIVE }, async () => {
  const { searchNetease } = require('../src/lyrics');
  const results = await searchNetease('サカナクション グッドバイ');
  assert.ok(results.length > 0, 'should find at least one result');
  assert.equal(results[0].title, 'グッドバイ');
});

test('fetchNeteaseLyrics returns LRC data', { skip: !NETLIVE }, async () => {
  const { fetchNeteaseLyrics } = require('../src/lyrics');
  // グッドバイ on Netease
  const data = await fetchNeteaseLyrics(1372730084);
  assert.ok(data, 'should return lyric data');
  assert.ok(data.lrc, 'should have lrc field');
  assert.ok(data.lrc.includes('グッドバイ'), 'should contain song title in lyrics');
});

test('fetchLyricsForTrack full flow', { skip: !NETLIVE }, async () => {
  const { fetchLyricsForTrack } = require('../src/lyrics');
  const result = await fetchLyricsForTrack('サカナクション', 'グッドバイ');
  assert.ok(result, 'should return result');
  assert.equal(result.source, 'netease');
  assert.ok(result.text.includes('グッドバイ'), 'should contain lyrics text');
  assert.ok(result.neteaseId > 0, 'should have neteaseId');
});
```

- [ ] **Step 4: Commit**

```bash
git add tests/fetch-lyrics.test.js
git commit -m "test: add unit and integration tests for lyrics module"
```

---

### Task 4: Integration test for lyrics CLI command

**Files:**
- Create: `tests/lyrics-command.test.js`

Note: The lyrics command fetches live from Netease, so we test only the local behavior: manifest filtering, file writing, manifest update. We mock `fetchLyricsForTrack`.

- [ ] **Step 1: Write integration test with mock**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Mock lyrics module to avoid live API calls
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
        evidenceUrl: null, lyricLookupTitle: null, lyricText: null,
        lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 2, start: '00:01:00', end: null,
        rawTitle: 'Song One', normalizedTitle: 'Song One',
        normalizationStatus: 'verified', trackKind: 'song',
        evidenceUrl: 'https://example.com', lyricLookupTitle: 'Test Artist Song One',
        lyricText: null, lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 3, start: '00:05:00', end: null,
        rawTitle: 'Song Two', normalizedTitle: 'Song Two',
        normalizationStatus: 'verified', trackKind: 'song',
        evidenceUrl: 'https://example.com', lyricLookupTitle: 'Test Artist Song Two',
        lyricText: null, lyricSource: null, lyricPath: null, notes: [],
      },
      {
        number: 4, start: '00:10:00', end: null,
        rawTitle: 'MC Talk', normalizedTitle: 'MC Talk',
        normalizationStatus: 'not_applicable', trackKind: 'mc',
        evidenceUrl: null, lyricLookupTitle: null, lyricText: null,
        lyricSource: null, lyricPath: null, notes: [],
      },
    ],
  };

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

test('lyrics command writes lyrics files and updates manifest', (t) => {
  const dir = createFixture(t);
  const repoRoot = path.resolve(__dirname, '..');

  // Mock fetchLyricsForTrack to return fake lyrics
  let callCount = 0;
  lyricsMod.fetchLyricsForTrack = async (artist, title) => {
    callCount++;
    if (title.includes('Song Two')) return null; // simulate not found
    return {
      text: `Fake lyrics for ${title}\nLine two\nLine three`,
      source: 'netease',
      neteaseId: 12345 + callCount,
    };
  };

  const result = spawnSync('node', ['tool.js', 'lyrics', '--manifest', path.join(dir, 'manifest.json')], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /Fetching lyrics for 2 tracks/);
  assert.match(result.stdout, /Song One.*OK/);
  assert.match(result.stdout, /Song Two.*NOT FOUND/);

  // Check lyrics file for Song One
  const lyricsPath = path.join(dir, 'lyrics', '02-Song_One.txt');
  assert.equal(fs.existsSync(lyricsPath), true);
  const content = fs.readFileSync(lyricsPath, 'utf8');
  assert.match(content, /Fake lyrics for Test Artist Song One/);

  // Check manifest updated
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const track2 = manifest.tracks[1]; // Song One
  assert.equal(track2.lyricSource, 'netease');
  assert.equal(track2.lyricPath, 'lyrics/02-Song_One.txt');

  // Song Two marked as not_found
  const track3 = manifest.tracks[2];
  assert.equal(track3.lyricSource, 'not_found');
  assert.equal(track3.lyricPath, null);

  // Intro and MC tracks untouched
  assert.equal(manifest.tracks[0].lyricSource, null);
  assert.equal(manifest.tracks[3].lyricSource, null);
});

test('lyrics command skips when no tracks need lyrics', (t) => {
  const dir = createFixture(t);
  const repoRoot = path.resolve(__dirname, '..');

  // Pre-fill all song tracks with lyrics
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
```

- [ ] **Step 2: Run only the lyrics command tests**

```bash
node --test tests/lyrics-command.test.js
```

Expected: 2 tests PASS

- [ ] **Step 3: Run full test suite to check no regressions**

```bash
npm test
```

Expected: All existing tests + new tests PASS (12+ tests total)

- [ ] **Step 4: Commit**

```bash
git add tests/lyrics-command.test.js
git commit -m "test: add integration tests for lyrics CLI command"
```

---

### Task 5: Clean up prototype artifacts and verify

**Files:**
- Clean up: Remove test lyrics output from prototype runs (albums dir)
- Verify: Run full test suite

- [ ] **Step 1: Remove prototype output from albums directory**

```bash
rm -rf "../albums/SAKANAQUARIUM 光 ONLINE/lyrics"
rm -rf "../albums/SAKANAQUARIUM 光 ONLINE/lyrics-netease"
rm -rf "../albums/SAKANAQUARIUM 光 ONLINE/lyrics-netease-lrc"
```

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: All tests pass, zero failures.

- [ ] **Step 3: Run lyrics command against a real manifest to verify end-to-end**

First, set `wantsLyrics: true` in a test manifest, then:

```bash
node tool.js lyrics --manifest "../albums/SAKANAQUARIUM 光 ONLINE/manifest.json"
```

Expected: Fetches ~19 songs from Netease. Check that `lyrics/` directory has files, manifest has `lyricSource` and `lyricPath` filled.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up prototype artifacts"
```

---

### Task 6: Rebuild albums with lyrics (光 ONLINE)

- [ ] **Step 1: Run lyrics command on 光 ONLINE**

```bash
node tool.js lyrics --manifest "../albums/SAKANAQUARIUM 光 ONLINE/manifest.json"
```

Verify: All songs have lyrics fetched. Check output summary for any `NOT FOUND`.

- [ ] **Step 2: Commit updated manifest**

```bash
cd "../albums/SAKANAQUARIUM 光 ONLINE"
git add manifest.json lyrics/
git commit -m "feat: add lyrics for SAKANAQUARIUM 光 ONLINE via Netease"
```
