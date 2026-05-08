const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseTimestamps } = require('../src/parse-timestamps');

test('parseTimestamps parses the real turn sample with noisy titles', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'turn-timestamps.md');
  const markdownText = fs.readFileSync(fixturePath, 'utf8');

  const tracks = parseTimestamps(markdownText);

  assert.equal(tracks.length, 24);
  assert.deepEqual(tracks[0], {
    number: 1,
    start: '00:02:34',
    rawTitle: 'Ame(B)',
  });
  assert.equal(tracks[20].rawTitle, 'MC\u73af\u8282');
  assert.equal(tracks[23].rawTitle, '\u30b7\u30e3\u30f3\u30c7\u30a3\u30ac\u30d5');
});

test('parseTimestamps supports observed repo timestamp formats and ignores separators', () => {
  const markdownText = [
    '\u65b0\u5b9d\u5cf6 4:50',
    '\u30b0\u30c3\u30c9\u30d0\u30a4\uff08Good Bye\uff09 2:00',
    '| \u591c\u306e\u8e0a\u308a\u5b50 | 09:26',
    '| \u63ed\u5e55\u5f00\u59cb | 03:59',
    '\u4ee5\u4e0b\u662f\u5b89\u53ef\u73af\u8282------------------------\u5206\u5272\u7ebf',
    '1:56:25\u300c\u8074\u304d\u305f\u304b\u3063\u305f\u30c0\u30f3\u30b9\u30df\u30e5\u30fc\u30b8\u30c3\u30af\u3001\u30ea\u30ad\u30c3\u30c9\u30eb\u30fc\u30e0\u306b\u300d',
  ].join('\n');

  const tracks = parseTimestamps(markdownText);

  assert.deepEqual(tracks, [
    { number: 1, start: '00:04:50', rawTitle: '\u65b0\u5b9d\u5cf6' },
    { number: 2, start: '00:02:00', rawTitle: '\u30b0\u30c3\u30c9\u30d0\u30a4\uff08Good Bye\uff09' },
    { number: 3, start: '00:09:26', rawTitle: '\u591c\u306e\u8e0a\u308a\u5b50' },
    { number: 4, start: '00:03:59', rawTitle: '\u63ed\u5e55\u5f00\u59cb' },
    {
      number: 5,
      start: '01:56:25',
      rawTitle: '\u300c\u8074\u304d\u305f\u304b\u3063\u305f\u30c0\u30f3\u30b9\u30df\u30e5\u30fc\u30b8\u30c3\u30af\u3001\u30ea\u30ad\u30c3\u30c9\u30eb\u30fc\u30e0\u306b\u300d',
    },
  ]);
});

test('parseTimestamps throws a clear error for malformed lines', () => {
  assert.throws(
    () => parseTimestamps('this is not a timestamp line'),
    /Unable to parse timestamp line: this is not a timestamp line/
  );
});

test('parseTimestamps ignores markdown table separators with spaces', () => {
  const tracks = parseTimestamps([
    '| --- | --- |',
    '| \u591c\u306e\u8e0a\u308a\u5b50 | 09:26',
  ].join('\n'));

  assert.deepEqual(tracks, [
    { number: 1, start: '00:09:26', rawTitle: '\u591c\u306e\u8e0a\u308a\u5b50' },
  ]);
});

test('parseTimestamps rejects malformed pipe rows instead of treating them as time-first', () => {
  assert.throws(
    () => parseTimestamps('00:01 | Title | Extra'),
    /Unable to parse timestamp line: 00:01 \| Title \| Extra/
  );
});
