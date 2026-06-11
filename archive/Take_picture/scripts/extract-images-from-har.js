const fs = require("fs");
const path = require("path");

const input = process.argv[2];
const outputDir = process.argv[3] || "downloads/har-images";

if (!input) {
  console.log("Usage:");
  console.log("  node scripts/extract-images-from-har.js <network.har> [output-dir]");
  process.exit(1);
}

const mimeToExt = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

const har = JSON.parse(fs.readFileSync(input, "utf8"));
const entries = har.log && Array.isArray(har.log.entries) ? har.log.entries : [];
const hasViewerImages = entries.some((entry) => String(entry.request && entry.request.url || "").includes("/images/viewer/"));

fs.mkdirSync(outputDir, { recursive: true });

let saved = 0;
let skipped = 0;

for (const entry of entries) {
  const requestUrl = String(entry.request && entry.request.url || "");
  if (hasViewerImages && !requestUrl.includes("/images/viewer/")) {
    skipped++;
    continue;
  }

  const response = entry.response || {};
  const content = response.content || {};
  const mimeType = String(content.mimeType || "").split(";")[0].toLowerCase();
  const ext = mimeToExt[mimeType];

  if (!ext) {
    skipped++;
    continue;
  }

  if (!content.text) {
    skipped++;
    continue;
  }

  const buffer = content.encoding === "base64"
    ? Buffer.from(content.text, "base64")
    : Buffer.from(content.text, "binary");

  if (buffer.length === 0) {
    skipped++;
    continue;
  }

  saved++;
  const fileName = `${String(saved).padStart(3, "0")}.${ext}`;
  fs.writeFileSync(path.join(outputDir, fileName), buffer);
  console.log(`saved ${fileName} (${buffer.length} bytes)`);
}

console.log(`Done. Saved ${saved} image(s). Skipped ${skipped} HAR entrie(s).`);

if (saved === 0) {
  console.log("No embedded image content was found. In DevTools, use Network > Export HAR with content, not a content-free HAR.");
}
