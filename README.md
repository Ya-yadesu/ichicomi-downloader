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
*   **Features**: Runs directly in your browser, providing a floating "Download Chapter" button. Supports automatic packaging into a ZIP file or downloading pages individually.
*   **Advantages**:
    1.  **Bypasses network and anti-crawling restrictions**: Directly reuses your logged-in browser session, requiring no User-Agent or Cookie configurations.
    2.  **Supports Blob resources**: Intercepts and parses image data in memory, solving issues where traditional downloaders cannot fetch `blob:` temporary protocol images.
    3.  **Instant Decryption and Restoration**: Uses HTML5 Canvas on the client-side to execute a 4x4 GigaViewer slice transposition algorithm. The downloaded images are instantly restored to high-definition original images.
    4.  **Auto-ZIP Packaging & Naming**: Integrates the JSZip library to automatically package all restored pages into a `.zip` archive named after the manga and chapter title; configuration option `CONFIG.zipEnabled` at the top of the script allows toggling this packaging feature.

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
