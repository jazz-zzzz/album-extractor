// Test: Netease lyrics for 光 ONLINE tracks 2-6
const { searchNetease, fetchNeteaseLyrics, lrcToPlain } = require('../src/lyrics');
const fs = require('node:fs');
const path = require('node:path');

const TRACKS = [
  { num: '02', title: 'グッドバイ', lookup: 'サカナクション グッドバイ' },
  { num: '03', title: 'マッチとピーナッツ', lookup: 'サカナクション マッチとピーナッツ' },
  { num: '04', title: '聴きたかったダンスミュージック、リキッドルームに', lookup: 'サカナクション 聴きたかったダンスミュージック、リキッドルームに' },
  { num: '05', title: 'ユリイカ', lookup: 'サカナクション ユリイカ' },
  { num: '06', title: 'ネイティブダンサー', lookup: 'サカナクション ネイティブダンサー' },
];

async function main() {
  for (const track of TRACKS) {
    process.stdout.write(`${track.num} ${track.title.substring(0, 20)} ... search `);
    try {
      const results = await searchNetease(track.lookup);
      if (results.length === 0) {
        console.log('NOT FOUND');
        continue;
      }
      const best = results[0];
      process.stdout.write(`→ ${best.title} (id=${best.id}) ... `);

      const lyricData = await fetchNeteaseLyrics(best.id);
      if (!lyricData || !lyricData.lrc) {
        console.log('NO LYRICS');
        continue;
      }

      const plain = lrcToPlain(lyricData.lrc);
      const dir = path.join(__dirname, '..', '..', 'albums', 'SAKANAQUARIUM 光 ONLINE', 'lyrics-netease');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${track.num}-${track.title.replace(/[<>:"/\\|?*]/g, '_')}.txt`;
      fs.writeFileSync(path.join(dir, filename), plain, 'utf8');
      console.log(`OK (${plain.split('\n').length} lines)`);

      // Also save raw LRC for inspection
      const lrcDir = path.join(__dirname, '..', '..', 'albums', 'SAKANAQUARIUM 光 ONLINE', 'lyrics-netease-lrc');
      fs.mkdirSync(lrcDir, { recursive: true });
      fs.writeFileSync(path.join(lrcDir, filename.replace('.txt', '.lrc')), lyricData.lrc, 'utf8');
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\nDone.');
}

main();
