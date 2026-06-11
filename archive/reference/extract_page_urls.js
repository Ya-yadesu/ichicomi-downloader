const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\张文烨\\.gemini\\antigravity-cli\\brain\\bbde1a9b-1116-4a61-9532-192e9e0f207d\\.system_generated\\steps\\20\\content.md', 'utf8');

const startIdx = html.indexOf("type='text/json' data-value='");
if (startIdx !== -1) {
    const endIdx = html.indexOf("'>", startIdx);
    const jsonStr = html.slice(startIdx + "type='text/json' data-value='".length, endIdx);
    // decode html entities
    const decoded = jsonStr.replace(/&quot;/g, '"');
    const data = JSON.parse(decoded);
    const pages = data.readableProduct.pageStructure.pages;
    const urls = pages.filter(p => p.type === 'main' && p.src).map(p => p.src);
    console.log(`Found ${urls.length} main pages.`);
    console.log(JSON.stringify(urls, null, 2));
} else {
    console.log("JSON not found!");
}
