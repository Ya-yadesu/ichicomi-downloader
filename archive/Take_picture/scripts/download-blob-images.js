(() => {
  const config = {
    prefix: "comic",
    minBytes: 10_000,
    delayMs: 350
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const extensionFromType = (type) => {
    switch ((type || "").toLowerCase()) {
      case "image/jpeg":
      case "image/jpg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      case "image/avif":
        return "avif";
      default:
        return "png";
    }
  };

  const walk = (root, output = []) => {
    for (const node of root.querySelectorAll("*")) {
      output.push(node);
      if (node.shadowRoot) {
        walk(node.shadowRoot, output);
      }
    }
    return output;
  };

  const unique = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      if (!item.src || seen.has(item.src)) {
        return false;
      }
      seen.add(item.src);
      return true;
    });
  };

  const collectNetworkBlobImages = () => {
    return performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.startsWith("blob:"))
      .map((entry) => ({
        src: entry.name,
        source: "network",
        size: entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0,
        startTime: entry.startTime
      }))
      .sort((a, b) => a.startTime - b.startTime);
  };

  const collectBlobImages = () => {
    const nodes = walk(document);
    return unique(nodes
      .filter((node) => node instanceof HTMLImageElement)
      .map((img) => ({
        src: img.currentSrc || img.src,
        source: "img",
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      }))
      .filter((item) => item.src.startsWith("blob:")));
  };

  const collectAllBlobImages = () => {
    return unique([
      ...collectNetworkBlobImages(),
      ...collectBlobImages()
    ]);
  };

  (async () => {
    const images = collectAllBlobImages();
    console.log(`Found ${images.length} blob image(s).`, images);

    if (images.length === 0) {
      console.warn("No blob images found. Scroll the page until the comic images are loaded, keep DevTools open, then run this script again.");
      return;
    }

    let success = 0;
    let skipped = 0;
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const response = await fetch(image.src);
        const blob = await response.blob();
        if (blob.size < config.minBytes) {
          skipped++;
          console.log(`[${i + 1}/${images.length}] skipped small image (${blob.size} bytes)`);
          continue;
        }

        const ext = extensionFromType(blob.type);
        const filename = `${config.prefix}-${String(i + 1).padStart(3, "0")}.${ext}`;

        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);

        success++;
        console.log(`[${i + 1}/${images.length}] saved ${filename} (${blob.size} bytes)`);
      } catch (error) {
        console.error(`[${i + 1}/${images.length}] failed`, image.src, error);
      }
      await sleep(config.delayMs);
    }

    console.log(`Done. ${success}/${images.length} blob image(s) requested for download. Skipped ${skipped} small item(s).`);
  })();
})();
