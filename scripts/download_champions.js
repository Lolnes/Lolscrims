import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destDir = path.join(__dirname, '../public/champions');

// Ensure directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status: ${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching latest version from Data Dragon...');
  try {
    const versions = await getJSON(`${DDRAGON_BASE}/api/versions.json`);
    const version = versions[0];
    console.log(`Latest patch version: ${version}`);

    console.log('Fetching champion list...');
    const champData = await getJSON(`${DDRAGON_BASE}/cdn/${version}/data/es_ES/champion.json`);
    const champions = Object.keys(champData.data);
    console.log(`Found ${champions.length} champions to download.`);

    let downloaded = 0;
    let failed = 0;

    // Download in chunks/concurrency of 10 to avoid overloading
    const concurrency = 10;
    for (let i = 0; i < champions.length; i += concurrency) {
      const chunk = champions.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (id) => {
        const url = `${DDRAGON_BASE}/cdn/${version}/img/champion/${id}.png`;
        const dest = path.join(destDir, `${id}.png`);
        
        // Skip if already exists and is not empty
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
          downloaded++;
          return;
        }

        try {
          await downloadFile(url, dest);
          downloaded++;
          if (downloaded % 20 === 0 || downloaded === champions.length) {
            console.log(`Downloaded ${downloaded}/${champions.length}...`);
          }
        } catch (err) {
          console.error(`Failed to download ${id}:`, err.message);
          failed++;
        }
      }));
    }

    console.log(`Download finished. Success: ${downloaded}, Failed: ${failed}`);
  } catch (err) {
    console.error('Fatal error in download script:', err);
  }
}

main();
