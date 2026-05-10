// Pure title helpers — no network, no side effects.

const VERSION_KEYWORDS = /\b(DJ|版|ver\.?|version|live|acoustic|mix|remix|arrange|edit|201\d|202\d)\b/i;
const NON_MUSIC_PATTERN = /MC|MC环节|MC×\d|讲话|成员介绍|开场|揭幕|开幕|開場|開幕|幕間|Interlude|Talk|メンバー紹介|エムシー/i;

function cleanTitle(rawTitle) {
  let title = rawTitle.trim();

  // Strip Japanese corner brackets
  title = title.replace(/^『|』$/g, '');

  // Strip slash-separated translations (keep first segment)
  if (title.includes('/')) {
    title = title.split('/')[0].trim();
  }

  // Strip fullwidth parenthetical translations (not version markers)
  title = title.replace(/\s*（([^）]*)）$/u, (_full, inner) => {
    if (VERSION_KEYWORDS.test(inner)) return _full;
    return '';
  });

  title = title.trim();
  if (!title) return rawTitle.trim();
  return title;
}

function isNonMusicTrack(rawTitle) {
  return NON_MUSIC_PATTERN.test(rawTitle.trim());
}

module.exports = { cleanTitle, isNonMusicTrack };
