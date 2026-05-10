const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanTitle, isNonMusicTrack } = require('../src/normalize');

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

test('cleanTitle keeps halfwidth parenthetical content', () => {
  assert.equal(cleanTitle('Ame(B)'), 'Ame(B)');
  assert.equal(cleanTitle('バッハの旋律を夜に聴いたせいです(DJ版)'), 'バッハの旋律を夜に聴いたせいです(DJ版)');
  assert.equal(cleanTitle('ネイティブダンサー(DJ版)'), 'ネイティブダンサー(DJ版)');
});

test('cleanTitle preserves fullwidth version markers like （DJ）', () => {
  assert.equal(cleanTitle('サンプル（DJ）'), 'サンプル（DJ）');
});

test('cleanTitle strips Japanese corner brackets', () => {
  assert.equal(cleanTitle('『新宝島』'), '新宝島');
  assert.equal(cleanTitle('『Ame(B)』'), 'Ame(B)');
});

test('cleanTitle handles titles with no noise (identity)', () => {
  assert.equal(cleanTitle('陽炎'), '陽炎');
  assert.equal(cleanTitle('新宝島'), '新宝島');
  assert.equal(cleanTitle('ネイティブダンサー'), 'ネイティブダンサー');
});

test('cleanTitle handles MC/talk titles', () => {
  assert.equal(cleanTitle('MC环节'), 'MC环节');
  assert.equal(cleanTitle('MC #01'), 'MC #01');
});

test('cleanTitle returns original when result would be empty', () => {
  assert.equal(cleanTitle('（DJ）'), '（DJ）');
});

// ── isNonMusicTrack ──

test('isNonMusicTrack returns true for MC and talk patterns', () => {
  assert.equal(isNonMusicTrack('MC'), true);
  assert.equal(isNonMusicTrack('MC环节'), true);
  assert.equal(isNonMusicTrack('MC #01'), true);
  assert.equal(isNonMusicTrack('Talk'), true);
  assert.equal(isNonMusicTrack('Interlude'), true);
  assert.equal(isNonMusicTrack('メンバー紹介'), true);
  assert.equal(isNonMusicTrack('開場'), true);
  assert.equal(isNonMusicTrack('幕間'), true);
});

test('isNonMusicTrack returns false for normal song titles', () => {
  assert.equal(isNonMusicTrack('陽炎'), false);
  assert.equal(isNonMusicTrack('Ame(B)'), false);
  assert.equal(isNonMusicTrack('新宝島'), false);
  assert.equal(isNonMusicTrack('バッハの旋律を夜に聴いたせいです(DJ版)'), false);
  assert.equal(isNonMusicTrack('ミュージック'), false);
  assert.equal(isNonMusicTrack('Aoi'), false);
});
