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
