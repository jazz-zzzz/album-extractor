const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFlacCommand, buildAlacCommand, buildTrackFileName } = require('../src/ffmpeg');

const defaultTrack = {
  number: 1,
  start: '00:02:34',
  end: '00:07:02',
  normalizedTitle: 'Ame (B)',
  lyricText: null,
};

const defaultOpts = {
  sourceAudioPath: 'source.flac',
  coverPath: 'cover.jpg',
  track: defaultTrack,
  albumTitle: 'SAKANAQUARIUM 2024 turn',
  artist: 'サカナクション',
  year: '2025',
};

test('buildFlacCommand includes required metadata', () => {
  const cmd = buildFlacCommand({ ...defaultOpts, outputPath: 'tracks/01_Ame (B).flac' });

  assert.ok(cmd.includes('-c:a'));
  assert.equal(cmd[cmd.indexOf('-c:a') + 1], 'flac');
  assert.ok(cmd.includes('-ss'));
  assert.ok(cmd.includes('-to'));
  assert.ok(cmd.includes('-metadata'));
  assert.ok(cmd.includes('title=Ame (B)'));
  assert.ok(cmd.includes('album=SAKANAQUARIUM 2024 turn'));
  assert.ok(cmd.includes('artist=サカナクション'));
  assert.ok(cmd.includes('date=2025'));
  assert.ok(cmd.includes('track=1'));
});

test('buildAlacCommand includes attached_pic disposition', () => {
  const cmd = buildAlacCommand({ ...defaultOpts, outputPath: 'ALAC/01_Ame (B).m4a' });

  assert.ok(cmd.includes('-c:a'));
  assert.equal(cmd[cmd.indexOf('-c:a') + 1], 'alac');
  assert.ok(cmd.includes('-disposition:v:0'));
  assert.equal(cmd[cmd.indexOf('-disposition:v:0') + 1], 'attached_pic');
});

test('buildFlacCommand omits -to when track.end is null', () => {
  const track = { ...defaultTrack, end: null };
  const cmd = buildFlacCommand({ ...defaultOpts, track, outputPath: 'out.flac' });

  assert.ok(!cmd.includes('-to'));
});

test('both commands embed lyrics when present', () => {
  const track = { ...defaultTrack, lyricText: 'lyrics content' };

  const flacCmd = buildFlacCommand({ ...defaultOpts, track, outputPath: 'out.flac' });
  assert.ok(flacCmd.includes('LYRICS=lyrics content'));

  const alacCmd = buildAlacCommand({ ...defaultOpts, track, outputPath: 'out.m4a' });
  assert.ok(alacCmd.includes('lyrics=lyrics content'));
});

test('both commands omit lyrics metadata when lyricText is null', () => {
  const flacCmd = buildFlacCommand({ ...defaultOpts, outputPath: 'out.flac' });
  assert.ok(!flacCmd.some((a) => a.startsWith('LYRICS=')));

  const alacCmd = buildAlacCommand({ ...defaultOpts, outputPath: 'out.m4a' });
  assert.ok(!alacCmd.some((a) => a.startsWith('lyrics=')));
});

test('buildTrackFileName pads track number and sanitizes title', () => {
  assert.equal(buildTrackFileName(defaultTrack, 'flac'), '01_Ame (B).flac');

  const track2 = { ...defaultTrack, number: 10, normalizedTitle: 'ショック！' };
  assert.equal(buildTrackFileName(track2, 'm4a'), '10_ショック！.m4a');
});

test('buildTrackFileName replaces path-unsafe characters', () => {
  const track = { number: 1, normalizedTitle: 'title:with:colons' };
  assert.equal(buildTrackFileName(track, 'flac'), '01_title_with_colons.flac');
});
