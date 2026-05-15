// Batch test: fetch Genius lyrics for 光 ONLINE tracks 2-6
const { fetchGeniusLyrics } = require('../src/lyrics');
const fs = require('node:fs');
const path = require('node:path');

const TRACKS = [
  { num: '02', title: 'グッドバイ', url: 'https://genius.com/Sakanaction-good-bye-lyrics' },
  { num: '03', title: 'マッチとピーナッツ', url: 'https://genius.com/Sakanaction-match-to-peanut-lyrics' },
  { num: '04', title: '「聴きたかったダンスミュージック、リキッドルームに」', url: 'https://genius.com/Sakanaction-kikitakatta-dance-music-liquidroom-ni-lyrics' },
  { num: '05', title: 'ユリイカ', url: 'https://genius.com/Sakanaction-eureka-lyrics' },
  { num: '06', title: 'ネイティブダンサー', url: 'https://genius.com/Sakanaction-native-dancer-lyrics' },
];

async function main() {
  for (const track of TRACKS) {
    process.stdout.write(`${track.num} ${track.title} ... `);
    try {
      const lyrics = await fetchGeniusLyrics(track.url);
      if (lyrics) {
        console.log(`OK (${lyrics.split('\n').length} lines)`);
        // Save to lyrics dir for inspection
        const dir = path.join(__dirname, '..', '..', 'albums', 'SAKANAQUARIUM 光 ONLINE', 'lyrics');
        fs.mkdirSync(dir, { recursive: true });
        const filename = `${track.num}-${track.title.replace(/[<>:"/\\|?*]/g, '_')}.txt`;
        fs.writeFileSync(path.join(dir, filename), lyrics, 'utf8');
      } else {
        console.log('NOT FOUND (no lyrics in page)');
      }
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    // Small delay to not hammer Genius
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('\nDone.');
}

main();
