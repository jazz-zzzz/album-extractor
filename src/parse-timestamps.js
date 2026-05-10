const TIME_PATTERN = /\d{1,2}:\d{2}(?::\d{2})?/;
const TIME_FIRST_PATTERN = new RegExp(`^(${TIME_PATTERN.source})\\s*(.+)$`);
const TITLE_FIRST_PATTERN = new RegExp(`^(.+?)\\s*(${TIME_PATTERN.source})$`);

function normalizeTime(raw) {
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [minutes, seconds] = raw.split(':');
    return `00:${minutes.padStart(2, '0')}:${seconds}`;
  }

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    const [hours, minutes, seconds] = raw.split(':');
    return `${hours.padStart(2, '0')}:${minutes}:${seconds}`;
  }

  throw new Error(`Unsupported timestamp format: ${raw}`);
}

const TIMESTAMP_ONLY = /^\d{1,2}:\d{2}(:\d{2})?\s*$/;

function parseTimestamps(markdownText) {
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSeparatorLine(line))
    .filter((line) => !TIMESTAMP_ONLY.test(line));

  return lines.map((line, index) => parseTimestampLine(line, index));
}

function parseTimestampLine(line, index) {
  const parsedPipeRow = parsePipeRow(line);

  if (parsedPipeRow) {
    return buildTrack(index, parsedPipeRow.start, parsedPipeRow.rawTitle);
  }

  if (line.includes('|')) {
    throw new Error(`Unable to parse timestamp line: ${line}`);
  }

  const timeFirstMatch = line.match(TIME_FIRST_PATTERN);

  if (timeFirstMatch) {
    const [, rawTime, rawTitle] = timeFirstMatch;
    return buildTrack(index, rawTime, rawTitle.trim());
  }

  const titleFirstMatch = line.match(TITLE_FIRST_PATTERN);

  if (titleFirstMatch) {
    const [, rawTitle, rawTime] = titleFirstMatch;
    return buildTrack(index, rawTime, rawTitle.trim());
  }

  throw new Error(`Unable to parse timestamp line: ${line}`);
}

function parsePipeRow(line) {
  if (!line.includes('|')) {
    return null;
  }

  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length !== 2) {
    return null;
  }

  const timeCell = cells.find((cell) => TIME_PATTERN.test(cell));
  const titleCell = cells.find((cell) => !TIME_PATTERN.test(cell));

  if (!timeCell || !titleCell) {
    return null;
  }

  if (!new RegExp(`^${TIME_PATTERN.source}$`).test(timeCell)) {
    return null;
  }

  return {
    start: timeCell,
    rawTitle: titleCell,
  };
}

function buildTrack(index, rawTime, rawTitle) {
  return {
    number: index + 1,
    start: normalizeTime(rawTime),
    rawTitle,
  };
}

function isSeparatorLine(line) {
  return (
    line.includes('\u5206\u5272\u7ebf') ||
    /^[\s|:-]+$/.test(line)
  );
}

module.exports = {
  normalizeTime,
  parseTimestamps,
};
