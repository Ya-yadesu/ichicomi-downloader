# CLAUDE.md

## Project Overview

ichicomi-downloader is a Tampermonkey userscript that downloads and restores manga images from Ichijinsha (ichicomi.com). It runs entirely in the browser, reusing the logged-in session to bypass authentication and anti-crawling restrictions.

**Current version**: 4.0

## Repository Structure

```
一迅社图片下载油猴脚本.user.js   ← The entire project: a single userscript (~820 lines)
README.md                        ← English documentation
README.zh-CN.md                  ← Simplified Chinese documentation
greasyfork_readme.md             ← Greasy Fork listing description
archive/                         ← Obsolete early approaches (Java, Node.js, HAR parsing)
```

## Architecture (userscript internals)

The script is a self-contained IIFE with these sections:

1. **CONFIG block** (lines 25-31) — Default settings for format, quality, ZIP mode, and polling intervals
2. **localStorage keys** (lines 33-37) — Persistent state keys (`ichicomiDownloader.*`)
3. **Preset arrays** (lines 39-56) — Poll interval and time window options for right-click cycling
4. **Data extraction** — `getEpisodeData()` reads `#episode-json[data-value]` from the page DOM
5. **GigaViewer 4x4 restoration** — `restoreImage()` implements the slice transposition algorithm on Canvas
6. **Download pipeline** — `fetch(url)` → `processAndRestore()` (Canvas decode + reformat) → ZIP or single-file save
7. **RSS polling** — `fetchLatestFromRss()` fetches and parses `ichicomi.com/rss/series/{id}` with DOMParser
8. **UI** — Three fixed-position buttons created in `createDownloadButton()`

## Key Design Decisions

- **No GM_* APIs** — Uses `@grant none`; all features via standard DOM APIs and `fetch()`. RSS polling works because the RSS URL is same-origin with the manga pages.
- **localStorage for persistence** — All settings (poll interval, time window, ZIP mode, auto-download log) persist across sessions without server-side storage.
- **Episode URL as download key** — The download log uses full episode URLs as keys (not episode IDs or dates), making duplicate detection reliable.
- **Right-click for presets** — All three buttons support left-click (toggle on/off) and right-click (cycle through preset values). This avoids hidden settings menus.

## Button Layout (bottom-left, fixed position)

```
124px: RSS Poll (right-click: 30s → 1min → 5min → 10min → 30min → 60min)
 72px: Auto-Check (right-click: 1h → 6h → 12h → 24h → 48h → 7d)
 20px: Download Chapter (right-click: ZIP ↔ single-page)
```

- Non-episode pages: all buttons grayed out and disabled
- During download: all buttons disabled

## Download Flow

```
downloadAll({auto: bool})
  ├─ isDownloading? → skip
  ├─ hasAutoDownloaded()?
  │   ├─ auto → silent skip (return false)
  │   └─ manual → showToast('该章节已下载过') → continue
  ├─ fetch each page URL (250ms interval between pages)
  │   └─ first failure → wait 1s → retry once
  ├─ processAndRestore: fetch blob → Image → restoreImage (Canvas) → toBlob (configurable format/quality)
  └─ successCount > 0 → markAutoDownloaded(location.href)
      └─ ZIP mode: JSZip → generate blob → download .zip
      └─ Single mode: download each page individually
```

## RSS Polling Flow

```
pollRss()
  ├─ RSS disabled or downloading? → schedule next, return
  ├─ Non-episode page (no getRssUrl)? → schedule next, return
  ├─ fetchLatestFromRss() → DOMParser → first <item>
  ├─ Already downloaded? → skip
  ├─ Auto-check off? → skip (but log discovery)
  ├─ pubDate outside time window? → skip
  ├─ Current page IS latest? → downloadAll({auto:true})
  └─ Else → location.href = latest.link (navigate)
scheduleRssPoll() → setTimeout(pollRss, getPollIntervalMs())
```

## Configuration (CONFIG block)

```javascript
format: 'image/jpeg'       // 'image/jpeg' | 'image/png' | 'image/webp'
quality: 0.98              // 0.0–1.0 (JPEG/WebP only)
zipEnabled: true           // Default ZIP mode (buttons override at runtime)
autoCheckIntervalMs: ...   // Default poll interval (buttons override)
autoRecentWindowMs: ...    // Default time window (buttons override)
```

## Editing Conventions

- Comments and UI text use Chinese primarily (the target audience is Chinese-speaking)
- Console log prefix: `[一迅社复原]`
- Keep the script self-contained in a single file — no build step, no dependencies beyond JSZip CDN
- Version number in the `@version` userscript header matches the tag in README changelogs
- Update all three READMEs when adding user-facing features
