const fs = require('fs');
const https = require('https');
const path = require('path');

const htmlPath = 'C:\\Users\\张文烨\\.gemini\\antigravity-cli\\brain\\bbde1a9b-1116-4a61-9532-192e9e0f207d\\.system_generated\\steps\\20\\content.md';
const outputDir = path.join(__dirname, 'manga', 'src', 'picture');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Clean target directory first
const existingFiles = fs.readdirSync(outputDir);
for (const file of existingFiles) {
    if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
        fs.unlinkSync(path.join(outputDir, file));
    }
}

const html = fs.readFileSync(htmlPath, 'utf8');
const startIdx = html.indexOf("type='text/json' data-value='");
if (startIdx === -1) {
    console.error("JSON config not found in HTML!");
    process.exit(1);
}
const endIdx = html.indexOf("'>", startIdx);
const jsonStr = html.slice(startIdx + "type='text/json' data-value='".length, endIdx);
const decoded = jsonStr.replace(/&quot;/g, '"');
const data = JSON.parse(decoded);
const pages = data.readableProduct.pageStructure.pages;
const urls = pages.filter(p => p.type === 'main' && p.src).map(p => p.src);

console.log(`Starting download of ${urls.length} pages...`);

function downloadPage(url, index) {
    const filename = String(index).padStart(3, '0') + '.jpg';
    const dest = path.join(outputDir, filename);
    const file = fs.createWriteStream(dest);

    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://ichicomi.com/'
        }
    };

    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download page ${index}: Status ${res.statusCode}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded page ${index}: ${filename}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

(async () => {
    let successCount = 0;
    for (let i = 0; i < urls.length; i++) {
        try {
            await downloadPage(urls[i], i + 1);
            successCount++;
        } catch (e) {
            console.error(`Error page ${i + 1}: ${e.message}`);
        }
        // Small delay to prevent rate limiting
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(`Finished: successfully downloaded ${successCount} of ${urls.length} pages.`);
})();
