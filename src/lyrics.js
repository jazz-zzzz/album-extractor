// Lyrics fetcher — Netease Cloud Music (primary) + Genius HTML scrape (fallback).
const https = require('node:https');
const http = require('node:http');
const zlib = require('node:zlib');

// ── HTTP helpers ──

const PROXY_URL = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null;

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
        const redirectUrl = new URL(res.headers.location, opts.url).href;
        return resolve(request({ ...opts, url: redirectUrl }));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${opts.url}`));
      }
      if (opts.raw) {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        return;
      }
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
      req.setTimeout(15000);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
      req.on('error', reject);
      req.end();
    }

    if (PROXY_URL && new URL(PROXY_URL).hostname) {
      proxyTunnel(u.hostname, u.port || 443)
        .then((socket) => {
          const pReq = https.get({ ...reqOpts, socket, agent: false }, handleRes);
          pReq.setTimeout(15000);
          pReq.on('timeout', () => {
            pReq.destroy();
            reject(new Error('Request timed out'));
          });
          pReq.on('error', reject);
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

const LRC_META_RE = /^\[[a-z]+:.*\]$/i;
const CREDIT_RE = /^(作[词詞曲]|编[曲曲]|編曲|制作|プロデュース)\s*[:：]/;

function lrcToPlain(lrc) {
  return lrc
    .split('\n')
    .filter((line) => !LRC_META_RE.test(line.trim()))
    .map((line) => line.replace(/\[\d{2}:\d{2}[.:]\d{2,3}\]/g, '').trim())
    .filter(Boolean)
    .filter((line) => !CREDIT_RE.test(line))
    .join('\n');
}

// ── LRC to Apple TTML (timed lyrics for Music app) ──

// Wrap plain lyrics in Apple TTML for full-screen display without time sync.
// Single static <p> block spanning 24h — Apple Music shows all lyrics at once.
function lrcToTtml(lrc) {
  const plain = lrcToPlain(lrc);
  if (!plain) return null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric/1.0">',
    '  <head/>',
    '  <body>',
    '    <div>',
    `      <p begin="00:00:00.000" end="99:59:59.999">${escapeXml(plain)}</p>`,
    '    </div>',
    '  </body>',
    '</tt>',
  ].join('\n');
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main entry point ──

function formatGeniusSlug(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\p{L}-]/giu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchLyricsForTrack(artist, title) {
  // 1) Try Netease Cloud Music
  const keyword = `${artist} ${title}`.trim();
  const results = await searchNetease(keyword);
  if (results.length > 0) {
    const best = results[0];
    const lyricData = await fetchNeteaseLyrics(best.id);
    if (lyricData && lyricData.lrc) {
      return {
        text: lrcToPlain(lyricData.lrc),
        ttlm: lrcToTtml(lyricData.lrc),
        source: 'netease',
        neteaseId: best.id,
        neteaseTitle: best.title,
      };
    }
  }

  // 2) Fall back to Genius
  try {
    const artistSlug = formatGeniusSlug(artist);
    const titleSlug = formatGeniusSlug(title);
    const geniusUrl = `https://genius.com/${artistSlug}-${titleSlug}-lyrics`;
    const lyrics = await fetchGeniusLyrics(geniusUrl);
    if (lyrics) {
      return { text: lyrics, source: 'genius' };
    }
  } catch {
    // best-effort — ignore any error and return null below
  }

  return null;
}

module.exports = { fetchLyricsForTrack, searchNetease, fetchNeteaseLyrics, fetchGeniusLyrics, lrcToPlain, request };
