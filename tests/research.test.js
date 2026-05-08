const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanTitle, isNonMusicTrack, researchAlbum } = require('../src/research');

// ── cleanTitle ──

test('cleanTitle strips slash-separated translations', () => {
  assert.equal(cleanTitle('モス/moth/蛾'), 'モス');
  assert.equal(cleanTitle('マッチとピーナッツ /花生与火柴'), 'マッチとピーナッツ');
  assert.equal(cleanTitle('ミュージック/Music(乐曲)'), 'ミュージック');
  assert.equal(cleanTitle('INORI/祈'), 'INORI');
  assert.equal(cleanTitle('セプテンバー /九月(acoustic)'), 'セプテンバー');
});

test('cleanTitle strips fullwidth parenthetical translations', () => {
  assert.equal(cleanTitle('グッドバイ（Good Bye）'), 'グッドバイ');
  assert.equal(cleanTitle('ユリイカ（Eureka）'), 'ユリイカ');
  assert.equal(cleanTitle('multiple exposure（多重曝光）'), 'multiple exposure');
  assert.equal(cleanTitle('キャラバン（骆驼商队）'), 'キャラバン');
});

test('cleanTitle keeps halfwidth parenthetical content (AI decides if annotation)', () => {
  // Halfwidth parens are left alone — could be part of official title or annotation
  // The AI agent determines correct title via web research
  assert.equal(cleanTitle('Ame(B)'), 'Ame(B)');
  assert.equal(cleanTitle('バッハの旋律を夜に聴いたせいです(DJ版)'), 'バッハの旋律を夜に聴いたせいです(DJ版)');
  assert.equal(cleanTitle('ネイティブダンサー(DJ版)'), 'ネイティブダンサー(DJ版)');
});

test('cleanTitle preserves fullwidth version markers like （DJ）', () => {
  assert.equal(cleanTitle('ネイティブダンサー （DJ）'), 'ネイティブダンサー （DJ）');
});

test('cleanTitle strips Japanese corner brackets', () => {
  assert.equal(
    cleanTitle('『バッハの旋律を夜に聴いたせいです。』'),
    'バッハの旋律を夜に聴いたせいです。'
  );
});

test('cleanTitle handles titles with no noise (identity)', () => {
  assert.equal(cleanTitle('陽炎'), '陽炎');
  assert.equal(cleanTitle('新宝島'), '新宝島');
  assert.equal(cleanTitle('Aoi'), 'Aoi');
  assert.equal(cleanTitle('モス'), 'モス');
  assert.equal(cleanTitle('ショック！'), 'ショック！');
  assert.equal(cleanTitle('白波トップウォーター'), '白波トップウォーター');
});

test('cleanTitle handles MC/talk titles', () => {
  assert.equal(cleanTitle('MC环节'), 'MC环节');
  assert.equal(cleanTitle('MC×2'), 'MC×2');
  assert.equal(cleanTitle('一郎讲话＋成员介绍'), '一郎讲话＋成员介绍');
});

test('cleanTitle returns original when result would be empty', () => {
  assert.equal(cleanTitle('(test)'), '(test)');
});

// ── isNonMusicTrack ──

test('isNonMusicTrack returns true for MC and talk patterns', () => {
  assert.equal(isNonMusicTrack('MC环节'), true);
  assert.equal(isNonMusicTrack('MC×2'), true);
  assert.equal(isNonMusicTrack('MC环节2'), true);
  assert.equal(isNonMusicTrack('一郎讲话＋成员介绍'), true);
  assert.equal(isNonMusicTrack('MC'), true);
  assert.equal(isNonMusicTrack('揭幕开始'), true);
  assert.equal(isNonMusicTrack('开场'), true);
  assert.equal(isNonMusicTrack('Interlude'), true);
  assert.equal(isNonMusicTrack('Talk'), true);
});

// ── researchAlbum (integration with mocked Genius) ──

function createMockGeniusClient(resultsOrError) {
  return {
    songs: {
      search: async (_query) => {
        if (resultsOrError instanceof Error) throw resultsOrError;
        return resultsOrError;
      },
    },
  };
}

test('researchAlbum offline mode skips all network calls', async () => {
  const tracks = [
    { number: 1, start: '00:02:34', rawTitle: 'Ame(B)' },
    { number: 2, start: '00:07:02', rawTitle: '陽炎' },
  ];

  const results = await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { offline: true },
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].normalizedTitle, 'Ame(B)');
  assert.ok(results[0].notes[0].includes('Offline'));
  assert.equal(results[1].normalizedTitle, '陽炎');
});

test('researchAlbum skips Genius for MC tracks', async () => {
  let searchCallCount = 0;
  const mockClient = {
    songs: {
      search: async (_query) => {
        searchCallCount++;
        return [];
      },
    },
  };

  const tracks = [
    { number: 1, start: '00:02:34', rawTitle: 'MC环节' },
    { number: 2, start: '00:07:02', rawTitle: '陽炎' },
  ];

  const results = await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { geniusClient: mockClient, rateLimitMs: 0 },
  });

  assert.equal(searchCallCount, 1);
  assert.equal(results[0].isNonMusic, true);
  assert.equal(results[0].lyricLookupTitle, null);
});

test('researchAlbum normalizes via Genius result', async () => {
  const mockClient = createMockGeniusClient([
    { title: 'バッハの旋律を夜に聴いたせいです。', url: 'https://genius.com/...', id: 123, result: {} },
  ]);

  const tracks = [
    { number: 1, start: '01:07:23', rawTitle: 'バッハの旋律を夜に聴いたせいです(DJ版)' },
  ];

  const results = await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { geniusClient: mockClient, rateLimitMs: 0 },
  });

  assert.equal(results[0].normalizedTitle, 'バッハの旋律を夜に聴いたせいです。');
  assert.equal(results[0].lyricSource, 'genius');
  assert.ok(results[0].evidenceUrl.includes('genius.com'));
});

test('researchAlbum falls back to cleanedTitle when Genius returns no results', async () => {
  const mockClient = createMockGeniusClient([]);

  const tracks = [
    { number: 1, start: '01:07:23', rawTitle: 'バッハの旋律を夜に聴いたせいです(DJ版)' },
  ];

  const results = await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { geniusClient: mockClient, rateLimitMs: 0 },
  });

  // cleanTitle keeps halfwidth parens; no Genius result → kept as-is
  assert.equal(results[0].normalizedTitle, 'バッハの旋律を夜に聴いたせいです(DJ版)');
  assert.equal(results[0].lyricSource, null);
  assert.ok(results[0].notes[0].includes('No Genius match'));
});

test('researchAlbum gracefully handles Genius errors', async () => {
  const mockClient = createMockGeniusClient(new Error('Network error'));

  const tracks = [
    { number: 1, start: '01:07:23', rawTitle: '陽炎' },
  ];

  const results = await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { geniusClient: mockClient, rateLimitMs: 0 },
  });

  assert.equal(results[0].normalizedTitle, '陽炎');
  assert.equal(results[0].researchError, 'Network error');
  assert.ok(results[0].notes[0].includes('Genius search failed'));
});

test('researchAlbum search query includes artist prefix', async () => {
  let capturedQuery = null;
  const mockClient = {
    songs: {
      search: async (query) => {
        capturedQuery = query;
        return [{ title: '新宝島', url: 'https://genius.com/...', id: 456, result: {} }];
      },
    },
  };

  const tracks = [
    { number: 1, start: '01:37:26', rawTitle: '新宝島' },
  ];

  await researchAlbum({
    tracks,
    albumName: 'Test',
    options: { geniusClient: mockClient, rateLimitMs: 0 },
  });

  assert.ok(capturedQuery.includes('サカナクション'));
  assert.ok(capturedQuery.includes('新宝島'));
});

// ── isNonMusicTrack (continued) ──

test('isNonMusicTrack returns false for normal song titles', () => {
  assert.equal(isNonMusicTrack('陽炎'), false);
  assert.equal(isNonMusicTrack('Ame(B)'), false);
  assert.equal(isNonMusicTrack('新宝島'), false);
  assert.equal(isNonMusicTrack('バッハの旋律を夜に聴いたせいです(DJ版)'), false);
  assert.equal(isNonMusicTrack('ミュージック'), false);
  assert.equal(isNonMusicTrack('Aoi'), false);
});
