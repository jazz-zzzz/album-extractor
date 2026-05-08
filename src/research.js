const Genius = require('genius-lyrics');

// ── pure helpers ──

const VERSION_KEYWORDS = /\b(DJ|版|ver\.?|version|live|acoustic|mix|remix|arrange|edit|201\d|202\d)\b/i;
const NON_MUSIC_PATTERN = /MC|MC环节|MC×\d|讲话|成员介绍|开场|揭幕|开幕|開場|開幕|幕間|Interlude|Talk|メンバー紹介|エムシー/i;

function cleanTitle(rawTitle) {
  let title = rawTitle.trim();

  // 1. Strip Japanese corner brackets
  title = title.replace(/^『|』$/g, '');

  // 2. Strip slash-separated translations (keep first segment — the Japanese original)
  //    e.g. "モス/moth/蛾" → "モス", "マッチとピーナッツ /花生与火柴" → "マッチとピーナッツ"
  if (title.includes('/')) {
    title = title.split('/')[0].trim();
  }

  // 3. Strip fullwidth parenthetical translations (Chinese/English after Japanese)
  //    e.g. "グッドバイ（Good Bye）" → "グッドバイ", "ユリイカ（Eureka）" → "ユリイカ"
  //    Only strip if content looks like a translation (not a version marker)
  title = title.replace(/\s*（([^）]*)）$/u, (_full, inner) => {
    if (VERSION_KEYWORDS.test(inner)) return _full; // keep version markers
    return ''; // strip translations
  });

  // 4. Final trim
  title = title.trim();

  // 5. If we stripped everything, return original
  if (!title) return rawTitle.trim();

  return title;
}

function isNonMusicTrack(rawTitle) {
  return NON_MUSIC_PATTERN.test(rawTitle.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Genius client ──

let _geniusClient = null;
function getGeniusClient() {
  if (!_geniusClient) {
    _geniusClient = new Genius.Client();
  }
  return _geniusClient;
}

// ── async research ──

async function searchGenius(query, geniusClient) {
  const searches = await geniusClient.songs.search(query, { sanitizeQuery: false });
  if (!searches || searches.length === 0) return null;
  const song = searches[0];
  return {
    title: song.title,
    url: song.url,
    id: song.id,
    artist: song.artist?.name ?? null,
    image: song.image ?? null,
  };
}

async function researchTrack(track, artist, geniusClient) {
  // MC/talk segments — skip all network calls
  if (isNonMusicTrack(track.rawTitle)) {
    return {
      ...track,
      normalizedTitle: track.rawTitle,
      evidenceUrl: null,
      lyricLookupTitle: null,
      lyricSource: null,
      isNonMusic: true,
      researchError: null,
      notes: ['MC/talk segment — no lyrics lookup'],
    };
  }

  const cleaned = cleanTitle(track.rawTitle);
  const query = `${artist} ${cleaned}`;

  let geniusResult = null;
  let researchError = null;

  try {
    geniusResult = await searchGenius(query, geniusClient);
  } catch (err) {
    researchError = err.message;
  }

  if (researchError) {
    return {
      ...track,
      normalizedTitle: cleaned,
      evidenceUrl: null,
      lyricLookupTitle: query,
      lyricSource: null,
      isNonMusic: false,
      researchError,
      notes: [`Genius search failed: ${researchError}`],
    };
  }

  if (!geniusResult) {
    return {
      ...track,
      normalizedTitle: cleaned,
      evidenceUrl: null,
      lyricLookupTitle: query,
      lyricSource: null,
      isNonMusic: false,
      researchError: null,
      notes: ['No Genius match found — review needed'],
    };
  }

  return {
    ...track,
    normalizedTitle: geniusResult.title,
    evidenceUrl: geniusResult.url,
    lyricLookupTitle: query,
    lyricSource: 'genius',
    isNonMusic: false,
    researchError: null,
    geniusId: geniusResult.id,
    notes: [],
  };
}

async function researchAlbum({ tracks, albumName, artist = 'サカナクション', options = {} }) {
  const {
    rateLimitMs = 1000,
    geniusClient = null,
    offline = false,
  } = options;

  if (offline) {
    return tracks.map((track) => {
      if (isNonMusicTrack(track.rawTitle)) {
        return {
          ...track,
          normalizedTitle: track.rawTitle,
          evidenceUrl: null,
          lyricLookupTitle: null,
          lyricSource: null,
          isNonMusic: true,
          researchError: null,
          notes: ['MC/talk segment — no lyrics lookup (offline)'],
        };
      }
      const cleaned = cleanTitle(track.rawTitle);
      return {
        ...track,
        normalizedTitle: cleaned,
        evidenceUrl: null,
        lyricLookupTitle: `${artist} ${cleaned}`,
        lyricSource: null,
        isNonMusic: false,
        researchError: null,
        notes: ['Offline mode — title cleaned locally, not verified against Genius'],
      };
    });
  }

  const client = geniusClient ?? getGeniusClient();
  const results = [];

  for (let i = 0; i < tracks.length; i++) {
    const result = await researchTrack(tracks[i], artist, client);
    results.push(result);

    // Rate limit between requests (skip after last)
    if (i < tracks.length - 1) {
      await sleep(rateLimitMs);
    }
  }

  return results;
}

module.exports = {
  cleanTitle,
  isNonMusicTrack,
  researchAlbum,
};
