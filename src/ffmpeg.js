function sanitizeFilename(title) {
  return title.replace(/[<>:"/\\|?*]/g, '_');
}

function buildFlacCommand({
  sourceAudioPath,
  coverPath,
  outputPath,
  track,
  albumTitle,
  artist,
  year,
}) {
  const args = [
    '-y',
    '-ss', track.start,
  ];

  if (track.end) args.push('-to', track.end);

  args.push(
    '-i', sourceAudioPath,
    '-i', coverPath,
    '-map', '0:a',
    '-map', '1:v',
    '-c:a', 'flac',
    '-compression_level', '8',
    '-c:v', 'copy',
    '-disposition:v:0', 'attached_pic',
    '-metadata', `title=${track.normalizedTitle}`,
    '-metadata', `track=${String(track.number)}`,
    '-metadata', `album=${albumTitle}`,
    '-metadata', `artist=${artist}`,
  );

  if (year) args.push('-metadata', `date=${String(year)}`);
  if (track.lyricText) args.push('-metadata', `LYRICS=${track.lyricText}`);

  args.push(outputPath);
  return args;
}

function buildAlacCommand({
  sourceAudioPath,
  coverPath,
  outputPath,
  track,
  albumTitle,
  artist,
  year,
}) {
  const args = [
    '-y',
    '-ss', track.start,
  ];

  if (track.end) args.push('-to', track.end);

  args.push(
    '-i', sourceAudioPath,
    '-i', coverPath,
    '-map', '0:a',
    '-map', '1:v',
    '-c:a', 'alac',
    '-c:v', 'copy',
    '-disposition:v:0', 'attached_pic',
    '-metadata', `title=${track.normalizedTitle}`,
    '-metadata', `track=${String(track.number)}`,
    '-metadata', `album=${albumTitle}`,
    '-metadata', `artist=${artist}`,
  );

  if (year) args.push('-metadata', `date=${String(year)}`);
  if (track.lyricText) args.push('-metadata', `lyrics=${track.lyricText}`);

  args.push(outputPath);
  return args;
}

function buildTrackFileName(track, ext) {
  const safe = sanitizeFilename(track.normalizedTitle);
  return `${String(track.number).padStart(2, '0')}_${safe}.${ext}`;
}

module.exports = {
  buildFlacCommand,
  buildAlacCommand,
  buildTrackFileName,
  sanitizeFilename,
};
