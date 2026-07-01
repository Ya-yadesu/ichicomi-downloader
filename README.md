# ichicomi-downloader 🗂️

English | [简体中文](README.zh-CN.md)

This repository manages scripts and tools for downloading and restoring manga images from Ichijinsha (ichicomi.com).

With the evolution of our technical solutions, we now primarily use the **Tampermonkey Userscript** as an all-in-one solution, which completely replaces the early console command-line tools.

---

## 🌟 Recommended Solution

### ⚡ [ichicomi-downloader](一迅社图片下载油猴脚本.user.js) (Tampermonkey Userscript)

[![Install Userscript](https://img.shields.io/badge/install-Userscript-green.svg?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js)

*   **Install Link**: 👉 [Click here to install the script](https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js) 👈 *(Make sure you have Tampermonkey or Violentmonkey installed)*
*   **Path**: [一迅社图片下载油猴脚本.user.js](一迅社图片下载油猴脚本.user.js)
*   **Version**: 4.0
*   **Features**: Runs directly in your browser, providing a floating "Download Chapter" button. Supports automatic packaging into a ZIP file or downloading pages individually.
*   **Advantages**:
    1.  **Bypasses network and anti-crawling restrictions**: Directly reuses your logged-in browser session, requiring no User-Agent or Cookie configurations.
    2.  **Supports Blob resources**: Intercepts and parses image data in memory, solving issues where traditional downloaders cannot fetch `blob:` temporary protocol images.
    3.  **Instant Decryption and Restoration**: Uses HTML5 Canvas on the client-side to execute a 4x4 GigaViewer slice transposition algorithm. The downloaded images are instantly restored to high-definition original images.
    4.  **Auto-ZIP Packaging & Naming**: Integrates the JSZip library to automatically package all restored pages into a `.zip` archive named after the manga and chapter title; configuration option `CONFIG.zipEnabled` at the top of the script allows toggling this packaging feature.
    5.  **RSS-based Auto-Check**: Adds a floating "RSS Poll" toggle. When enabled, the script periodically fetches the series RSS feed (just a few KB) to detect new episodes. Combined with the "Auto-Check" toggle, newly published episodes are automatically downloaded.
    6.  **Smart Time Window**: Only auto-downloads episodes published within the configured time window (default 24 hours), preventing accidental downloads of old episodes.

### Floating Button Controls

The script displays three buttons at the bottom-left of the page:

| Button | Left Click | Right Click |
|--------|------------|-------------|
| **Download Chapter** | Download current chapter | Toggle ZIP / single-page mode |
| **Auto-Check** | Toggle auto-download on/off | Cycle time window: 1h → 6h → 12h → 24h → 48h → 7d |
| **RSS Poll** | Toggle RSS polling on/off | Cycle poll interval: 30s → 1min → 5min → 10min → 30min → 60min |

Buttons show current settings at a glance (e.g. `一键下载整话(ZIP)`, `RSS：1分`, `自动：24时`).

- **ZIP Toggle**: Right-click the download button to switch between ZIP archive and single-page download modes. Auto-download follows the same setting.
- **RSS Progress Bar**: When RSS polling is enabled, the button displays a gradient progress bar that fills up over the poll interval, providing visual feedback.
- **Non-Episode Pages**: On non-episode pages (series list, homepage, etc.), buttons are grayed out and disabled with a tooltip.
- **Download Retry**: Failed page downloads automatically retry once after a 1-second delay.
- **Smart Time Window**: Auto-download only triggers for episodes published within the configured time window, preventing accidental downloads of old episodes.
- **Duplicate Prevention**: Auto-download silently skips previously downloaded episodes; manual download shows a floating toast notification.
- **Auto-Log Cleanup**: Download records older than 15 days are automatically cleaned up on page visit.
- All settings persist across page refreshes via `localStorage`.

---
## 📝 Changelog

### v4.0 (2026-07-02)
- **RSS-based auto-check**: Replaced page-refresh polling with lightweight RSS feed polling (~few KB per request)
- **Dual-toggle design**: Separate "RSS Poll" (discovers new episodes) and "Auto-Check" (downloads them) toggles
- **Right-click presets on all three buttons**: Right-click to toggle ZIP/single mode, cycle poll intervals (30s/1min/5min/10min/30min/60min), or cycle time windows (1h/6h/12h/24h/48h/7d)
- **RSS progress bar**: Animated gradient fills up over the poll interval for visual feedback
- **Non-episode page handling**: Buttons gray out and disable on non-episode pages
- **Download retry**: Failed page downloads retry once after a 1-second delay
- **Duplicate prevention**: Auto-download silently skips previously downloaded episodes; manual download shows a floating toast notification
- **Auto-log cleanup**: Download records older than 15 days are automatically removed
- **Simplified recording**: Download log uses episode URL as key instead of date comparison
- **30-second poll interval**: Added ultra-fast 30-second RSS polling preset

### v3.7
- Initial auto-check feature with page-refresh based polling
- Configurable download format (JPEG/PNG/WebP) and quality
- ZIP packaging with automatic naming

---

## 📦 Archived Early Solutions (Obsolete Java & CLI Tools)

The following console tools were used in early stages. They are now obsolete and fully replaced by the userscript. Kept in the `archive` directory for technical reference only:

### 1. 📥 [Take_picture](archive/Take_picture/) (Java & Node.js Downloader)
*   **App.java**: A dependency-free multi-threaded Java downloader for grabbing image links from standard HTML pages.
*   **scripts/extract-images-from-har.js**: Used when websites dynamically load images asynchronously via frontend JavaScript, extracting image URLs from browser `.har` network capture files.

### 2. 🧩 [manga](archive/manga/) (Java Image Restoration Tool)
*   **ReorderTiledImage.java**: A local image puzzle restorer. Since early downloaders retrieved scrambled 4x4 image tiles, this Java program reorganizes and merges tiles locally using matrix reordering.

### 3. 📂 [reference](archive/reference/) (Web Analysis and Reference)
*   **extract_page_urls.js**: Early experiment script trying to extract page image URLs.
*   **download_all_pages.js**: Experimental code for asynchronously requesting and downloading all pages client-side.
*   **linux_deployment_guide.md**: Detailed guide for Linux deployment and environment debugging, kept as reference for future server-side deployment experiments.
