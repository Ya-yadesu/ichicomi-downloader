// ==UserScript==
// @name         ichicomi-downloader
// @name:zh-CN   一迅社图片下载油猴脚本
// @namespace    https://github.com/Ya-yadesu/ichicomi-downloader
// @version      4.0
// @description  Manga image downloader and restorer for Ichijinsha (ichicomi.com). Supports 4x4 image restoration, auto-ZIP packaging, and RSS-based automatic update checks.
// @description:zh-CN 精简版一迅社漫画图片复原下载脚本。提供”一键下载整话”悬浮按钮，支持后台静默下载、4x4对齐复原及边缘像素保留。支持自定义导出画质、自动打包为zip，以及基于RSS的自动更新检查并下载。
// @license      MIT
// @match        https://ichicomi.com/*
// @run-at       document-end
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @updateURL    https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js
// @downloadURL  https://raw.githubusercontent.com/Ya-yadesu/ichicomi-downloader/main/%E4%B8%80%E8%BF%85%E7%A4%BE%E5%9B%BE%E7%89%87%E4%B8%8B%E8%BD%BD%E6%B2%B9%E7%8C%B4%E8%84%9A%E6%9C%AC.user.js
// ==/UserScript==

/* jshint esversion: 8 */

(function() {
    'use strict';
    
    // ==========================================
    // 脚本自定义配置项（在此调整下载画质 and 格式）
    // ==========================================
    const CONFIG = {
        format: 'image/jpeg',  // 导出格式可选: 'image/jpeg' (默认), 'image/png' (完全无损但体积大), 'image/webp' (高压缩无损/有损)
        quality: 0.98,         // 导出质量 (仅对 jpeg 和 webp 生效，范围 0.0 ~ 1.0)
        zipEnabled: true,      // 是否开启自动打包为 ZIP 文件 (true: 开启打包, false: 依次下载单张图片)
        autoCheckIntervalMs: 1 * 60 * 1000,        // RSS 轮询间隔（分钟 * 秒 * 毫秒），当前 = 1 分钟
        autoRecentWindowMs: 24 * 60 * 60 * 1000   // 自动下载的时间窗口（小时 * 分钟 * 秒 * 毫秒），仅下载近 N 小时内更新的新话
    };

    const AUTO_ENABLED_KEY = 'ichicomiDownloader.autoCheckEnabled';
    const RSS_POLL_ENABLED_KEY = 'ichicomiDownloader.rssPollEnabled';
    const RSS_POLL_INTERVAL_KEY = 'ichicomiDownloader.rssPollIntervalMs';
    const AUTO_WINDOW_KEY = 'ichicomiDownloader.autoRecentWindowMs';
    const ZIP_ENABLED_KEY = 'ichicomiDownloader.zipEnabled';
    const AUTO_DOWNLOAD_LOG_KEY = 'ichicomiDownloader.autoDownloadedEpisodes';

    // RSS 轮询间隔预设（毫秒）
    const POLL_INTERVAL_PRESETS = [
        { label: '30秒', ms: 30 * 1000 },
        { label: '1分', ms: 1 * 60 * 1000 },
        { label: '5分', ms: 5 * 60 * 1000 },
        { label: '10分', ms: 10 * 60 * 1000 },
        { label: '30分', ms: 30 * 60 * 1000 },
        { label: '60分', ms: 60 * 60 * 1000 },
    ];

    // 自动下载时间窗口预设（毫秒）
    const AUTO_WINDOW_PRESETS = [
        { label: '1时', ms: 1 * 60 * 60 * 1000 },
        { label: '6时', ms: 6 * 60 * 60 * 1000 },
        { label: '12时', ms: 12 * 60 * 60 * 1000 },
        { label: '24时', ms: 24 * 60 * 60 * 1000 },
        { label: '48时', ms: 48 * 60 * 60 * 1000 },
        { label: '7天', ms: 7 * 24 * 60 * 60 * 1000 },
    ];

    let btn = null;
    let autoBtn = null;
    let rssBtn = null;
    let pageUrls = null;
    let episodeData = null;
    let autoTimer = null;
    let isDownloading = false;
    let rssProgressTimer = null;
    let pollStartTime = 0;

    function getEpisodeData() {
        if (episodeData) return episodeData;
        const el = document.getElementById('episode-json');
        if (!el) return null;
        try {
            episodeData = JSON.parse(el.getAttribute('data-value'));
            return episodeData;
        } catch (e) {
            console.error("[一迅社复原] 解析页面 JSON 失败", e);
            return null;
        }
    }

    // 获取并解析页面 URLs 结构
    function loadPageUrls() {
        const data = getEpisodeData();
        if (data) {
            try {
                const pages = data.readableProduct.pageStructure.pages;
                pageUrls = pages.filter(p => p.type === 'main' && p.src).map(p => p.src);
                console.log(`[一迅社复原] 成功获取页面结构，共 ${pageUrls.length} 页。`);
            } catch (e) {
                console.error("[一迅社复原] 获取页面结构失败", e);
            }
        }
    }

    function isEpisodePage() {
        return Boolean(document.getElementById('episode-json'));
    }

    /**
     * GigaViewer 4x4 还原算法
     */
    function restoreImage(srcImg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const imgW = srcImg.naturalWidth;
        const imgH = srcImg.naturalHeight;
        canvas.width = imgW;
        canvas.height = imgH;

        const DIVIDE_NUM = 4;
        const MULTIPLE = 8;
        const blockW = Math.floor(imgW / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;
        const blockH = Math.floor(imgH / (DIVIDE_NUM * MULTIPLE)) * MULTIPLE;

        // 1. 先绘制完整原图做背景，保留未参与切割的边缘区
        ctx.drawImage(srcImg, 0, 0, imgW, imgH);

        // 2. 根据转置关系拼回原处
        for (let e = 0; e < 16; e++) {
            const srcRow = Math.floor(e / 4);
            const srcCol = e % 4;
            const srcX = srcCol * blockW;
            const srcY = srcRow * blockH;

            const n = srcCol * 4 + srcRow;
            const destX = (n % 4) * blockW;
            const destY = Math.floor(n / 4) * blockH;

            ctx.drawImage(srcImg, srcX, srcY, blockW, blockH, destX, destY, blockW, blockH);
        }
        return canvas;
    }

    /**
     * 执行图片解密并返回复原后的 Blob
     */
    function processAndRestore(blob, pageIndex) {
        return new Promise((resolve, reject) => {
            // 根据格式配置确定文件后缀
            let ext = 'jpg';
            if (CONFIG.format === 'image/png') ext = 'png';
            if (CONFIG.format === 'image/webp') ext = 'webp';

            const finalName = String(pageIndex).padStart(3, '0') + '.' + ext;
            const blobUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.src = blobUrl;
            img.onload = () => {
                const restoredCanvas = restoreImage(img);
                
                // 统一的保存下载回调
                const callback = (restoredBlob) => {
                    URL.revokeObjectURL(blobUrl);
                    resolve({ blob: restoredBlob, filename: finalName });
                };

                // 根据不同格式调用 toBlob
                if (CONFIG.format === 'image/png') {
                    restoredCanvas.toBlob(callback, CONFIG.format);
                } else {
                    restoredCanvas.toBlob(callback, CONFIG.format, CONFIG.quality);
                }
            };
            img.onerror = () => {
                console.error(`[一迅社复原] 加载图片失败: 第 ${pageIndex} 页`);
                URL.revokeObjectURL(blobUrl);
                reject(new Error(`加载图片失败: 第 ${pageIndex} 页`));
            };
        });
    }

    // 获取安全的 Zip 文件名
    function getZipFilename() {
        let title = "";
        const data = getEpisodeData();
        if (data) {
            try {
                const prod = data.readableProduct;
                if (prod) {
                    const seriesName = prod.series && prod.series.name ? prod.series.name : "";
                    const epTitle = prod.title ? prod.title : "";
                    if (seriesName && epTitle) {
                        title = `${seriesName} - ${epTitle}`;
                    } else {
                        title = seriesName || epTitle || "";
                    }
                }
            } catch (e) {}
        }
        if (!title && document.title) {
            title = document.title.replace(/\s*\|\s*ichicomi/i, '').trim();
        }
        if (!title) {
            title = "manga_episode";
        }
        // 过滤掉文件名中的非法字符
        return title.replace(/[\\/:*?"<>|]/g, "_") + ".zip";
    }

    function getEpisodeTitle() {
        const data = getEpisodeData();
        const prod = data && data.readableProduct;
        if (prod) {
            const seriesName = prod.series && (prod.series.name || prod.series.title) ? (prod.series.name || prod.series.title) : "";
            const epTitle = prod.title || prod.name || "";
            if (seriesName && epTitle) return `${seriesName} - ${epTitle}`;
            if (seriesName || epTitle) return seriesName || epTitle;
        }
        return document.title ? document.title.replace(/\s*\|\s*ichicomi/i, '').trim() : location.pathname;
    }

    function getSeriesId() {
        const data = getEpisodeData();
        const prod = data && data.readableProduct;
        if (prod && prod.series && prod.series.id) {
            return prod.series.id;
        }
        return null;
    }

    function getRssUrl() {
        const seriesId = getSeriesId();
        if (!seriesId) return null;
        return `https://ichicomi.com/rss/series/${seriesId}`;
    }

    async function fetchLatestFromRss() {
        const rssUrl = getRssUrl();
        if (!rssUrl) return null;
        try {
            const res = await fetch(rssUrl);
            if (!res.ok) return null;
            const xmlText = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'text/xml');
            const firstItem = doc.querySelector('item');
            if (!firstItem) return null;
            const title = firstItem.querySelector('title')?.textContent?.trim() || '';
            const link = firstItem.querySelector('link')?.textContent?.trim() || '';
            const pubDate = firstItem.querySelector('pubDate')?.textContent?.trim() || '';
            if (!link) return null;
            return { title, link, pubDate };
        } catch (e) {
            console.error('[一迅社复原] RSS 获取失败:', e);
            return null;
        }
    }

    function getAutoDownloadedLog() {
        try {
            const parsed = JSON.parse(localStorage.getItem(AUTO_DOWNLOAD_LOG_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function markAutoDownloaded(episodeUrl) {
        const log = getAutoDownloadedLog();
        const url = episodeUrl || location.href;
        log[url] = {
            title: getEpisodeTitle(),
            downloadedAt: new Date().toISOString()
        };
        localStorage.setItem(AUTO_DOWNLOAD_LOG_KEY, JSON.stringify(log));
    }

    function hasAutoDownloaded(episodeUrl) {
        const url = episodeUrl || location.href;
        return Boolean(getAutoDownloadedLog()[url]);
    }

    // 清理超过 15 天的下载记录
    function cleanOldDownloadLog() {
        const log = getAutoDownloadedLog();
        const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
        let cleaned = false;
        Object.keys(log).forEach(url => {
            const record = log[url];
            if (record && record.downloadedAt) {
                const ts = new Date(record.downloadedAt).getTime();
                if (!isNaN(ts) && ts < cutoff) {
                    delete log[url];
                    cleaned = true;
                }
            }
        });
        if (cleaned) {
            localStorage.setItem(AUTO_DOWNLOAD_LOG_KEY, JSON.stringify(log));
            console.log('[一迅社复原] 已清理超过 15 天的下载记录。');
        }
    }

    function isAutoCheckEnabled() {
        return localStorage.getItem(AUTO_ENABLED_KEY) === 'true';
    }

    // ---- RSS 轮询间隔 ----

    function getPollIntervalMs() {
        const stored = localStorage.getItem(RSS_POLL_INTERVAL_KEY);
        if (stored) {
            const ms = parseInt(stored, 10);
            if (!isNaN(ms) && POLL_INTERVAL_PRESETS.some(p => p.ms === ms)) return ms;
        }
        return CONFIG.autoCheckIntervalMs;
    }

    function cyclePollInterval() {
        const current = getPollIntervalMs();
        const idx = POLL_INTERVAL_PRESETS.findIndex(p => p.ms === current);
        const next = POLL_INTERVAL_PRESETS[(idx + 1) % POLL_INTERVAL_PRESETS.length];
        localStorage.setItem(RSS_POLL_INTERVAL_KEY, String(next.ms));
        updateRssButton();
        // 重新安排下一次轮询
        if (isRssPollEnabled()) scheduleRssPoll();
    }

    // ---- 自动下载时间窗口 ----

    function getAutoWindowMs() {
        const stored = localStorage.getItem(AUTO_WINDOW_KEY);
        if (stored) {
            const ms = parseInt(stored, 10);
            if (!isNaN(ms) && AUTO_WINDOW_PRESETS.some(p => p.ms === ms)) return ms;
        }
        return CONFIG.autoRecentWindowMs;
    }

    function cycleAutoWindow() {
        const current = getAutoWindowMs();
        const idx = AUTO_WINDOW_PRESETS.findIndex(p => p.ms === current);
        const next = AUTO_WINDOW_PRESETS[(idx + 1) % AUTO_WINDOW_PRESETS.length];
        localStorage.setItem(AUTO_WINDOW_KEY, String(next.ms));
        updateAutoButton();
    }

    function setAutoCheckEnabled(enabled) {
        localStorage.setItem(AUTO_ENABLED_KEY, enabled ? 'true' : 'false');
        updateAutoButton();
        scheduleRssPoll();
        if (enabled) {
            pollRss();
        }
    }

    function isRssPollEnabled() {
        return localStorage.getItem(RSS_POLL_ENABLED_KEY) !== 'false';
    }

    function setRssPollEnabled(enabled) {
        localStorage.setItem(RSS_POLL_ENABLED_KEY, enabled ? 'true' : 'false');
        updateRssButton();
        if (enabled) {
            pollRss();
        } else {
            if (autoTimer) {
                clearTimeout(autoTimer);
                autoTimer = null;
            }
        }
    }

    function updateRssButton() {
        if (!rssBtn) return;
        const enabled = isRssPollEnabled();
        const intervalMs = getPollIntervalMs();
        const preset = POLL_INTERVAL_PRESETS.find(p => p.ms === intervalMs);
        const label = preset ? preset.label : '?';

        if (!isEpisodePage()) {
            rssBtn.innerText = 'RSS：--';
            stopRssProgress();
            rssBtn.style.background = '';
            rssBtn.style.backgroundColor = 'rgba(80, 80, 80, 0.5)';
        } else if (enabled) {
            rssBtn.innerText = `RSS：${label}`;
            startRssProgress();
        } else {
            rssBtn.innerText = 'RSS：关';
            stopRssProgress();
            rssBtn.style.background = '';
            rssBtn.style.backgroundColor = 'rgba(80, 80, 80, 0.82)';
        }
    }

    function startRssProgress() {
        stopRssProgress();
        if (!isEpisodePage()) return;
        pollStartTime = Date.now();
        rssProgressTimer = setInterval(() => {
            if (!rssBtn) { stopRssProgress(); return; }
            const elapsed = Date.now() - pollStartTime;
            const intervalMs = getPollIntervalMs();
            const pct = Math.min(100, (elapsed / intervalMs) * 100);
            rssBtn.style.background = `linear-gradient(to right, rgba(46, 125, 50, 0.9) ${pct}%, rgba(80, 80, 80, 0.82) ${pct}%)`;
        }, 60);
    }

    function stopRssProgress() {
        if (rssProgressTimer) {
            clearInterval(rssProgressTimer);
            rssProgressTimer = null;
        }
        if (rssBtn) {
            rssBtn.style.background = '';
        }
        pollStartTime = 0;
    }

    // ---- ZIP 打包模式 ----

    function isZipEnabled() {
        const stored = localStorage.getItem(ZIP_ENABLED_KEY);
        if (stored !== null) return stored === 'true';
        return CONFIG.zipEnabled;
    }

    function toggleZipMode() {
        const next = !isZipEnabled();
        localStorage.setItem(ZIP_ENABLED_KEY, next ? 'true' : 'false');
        updateDownloadButton();
    }

    function updateDownloadButton() {
        if (!btn) return;
        const zip = isZipEnabled();
        btn.innerText = zip ? '一键下载整话(ZIP)' : '一键下载整话(单张)';
    }

    function showToast(msg, durationMs = 2000) {
        const toast = document.createElement('div');
        toast.innerText = msg;
        toast.style.position = 'fixed';
        toast.style.bottom = '80px';
        toast.style.left = '20px';
        toast.style.zIndex = '100000';
        toast.style.padding = '10px 20px';
        toast.style.backgroundColor = 'rgba(255, 152, 0, 0.9)';
        toast.style.color = '#fff';
        toast.style.borderRadius = '20px';
        toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        toast.style.fontSize = '13px';
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, durationMs);
    }

    // 一键下载整话逻辑
    async function downloadAll(options = {}) {
        const isAuto = Boolean(options.auto);
        if (isDownloading) {
            console.log("[一迅社复原] 下载任务已在运行，跳过重复触发。");
            return false;
        }

        // 重复下载检查
        if (hasAutoDownloaded()) {
            if (isAuto) {
                // 自动下载：有记录则静默跳过
                console.log("[一迅社复原] 该章节已下载过，跳过自动下载。");
                return false;
            } else {
                // 手动下载：短暂漂浮提示，不阻止
                showToast('该章节已下载过');
            }
        }

        if (!pageUrls) {
            loadPageUrls();
        }
        if (!pageUrls || pageUrls.length === 0) {
            if (!isAuto) {
                alert("未找到漫画页面结构，请等待页面完全加载后再试。");
            }
            return false;
        }

        isDownloading = true;
        if (btn) {
            btn.disabled = true;
            btn.style.backgroundColor = 'rgba(128, 128, 128, 0.8)';
            btn.style.cursor = 'not-allowed';
        }
        if (autoBtn) {
            autoBtn.disabled = true;
        }
        if (rssBtn) {
            rssBtn.disabled = true;
        }

        console.log(`[一迅社复原] 开始一键下载，共 ${pageUrls.length} 页。`);

        let zip = null;
        if (isZipEnabled()) {
            if (typeof JSZip === 'undefined') {
                if (!isAuto) {
                    alert("JSZip 库未加载成功，请检查网络或脚本声明。");
                }
                resetButton();
                return false;
            }
            zip = new JSZip();
        }

        let successCount = 0;

        for (let i = 0; i < pageUrls.length; i++) {
            const pageIndex = i + 1;
            if (btn) {
                btn.innerText = `${isAuto ? '自动下载' : '下载中'} (${pageIndex}/${pageUrls.length})`;
            }

            try {
                const url = pageUrls[i];
                let result;
                const fetchAndRestore = async () => {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    return await processAndRestore(blob, pageIndex);
                };
                try {
                    result = await fetchAndRestore();
                } catch (firstErr) {
                    // 失败后等 1 秒重试一次
                    console.warn(`[一迅社复原] 第 ${pageIndex} 页首次下载失败，1秒后重试:`, firstErr);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    result = await fetchAndRestore();
                }

                if (isZipEnabled() && zip) {
                    zip.file(result.filename, result.blob);
                    console.log(`[一迅社复原] 已加入 ZIP: ${result.filename}`);
                } else {
                    const restoredUrl = URL.createObjectURL(result.blob);
                    const a = document.createElement('a');
                    a.href = restoredUrl;
                    a.download = result.filename;
                    a.click();
                    console.log(`[一迅社复原] 成功保存: ${result.filename} (${CONFIG.format})`);
                    setTimeout(() => {
                        URL.revokeObjectURL(restoredUrl);
                    }, 1000);
                }
                successCount++;
            } catch (err) {
                console.error(`[一迅社复原] 下载第 ${pageIndex} 页失败:`, err);
            }
            // 250ms 间隔防限流
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (isZipEnabled() && zip && successCount > 0) {
            if (btn) {
                btn.innerText = "正在打包 ZIP...";
            }
            try {
                const zipBlob = await zip.generateAsync({type: "blob"});
                const zipFilename = getZipFilename();
                const zipUrl = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = zipUrl;
                a.download = zipFilename;
                a.click();
                console.log(`[一迅社复原] ZIP 打包下载成功: ${zipFilename}`);
                setTimeout(() => {
                    URL.revokeObjectURL(zipUrl);
                }, 1000);
            } catch (zipErr) {
                console.error("[一迅社复原] 打包 ZIP 失败:", zipErr);
                if (!isAuto) {
                    alert("打包 ZIP 失败，请查看控制台错误。");
                }
            }
        }

        if (successCount > 0) {
            markAutoDownloaded();
        }

        if (btn) {
            btn.innerText = "下载完成";
            btn.style.backgroundColor = 'rgba(76, 175, 80, 0.85)';
        }

        setTimeout(() => {
            resetButton();
        }, 3000);

        return successCount > 0;
    }

    function resetButton() {
        isDownloading = false;
        if (!btn) return;
        updateDownloadButton();
        btn.style.backgroundColor = 'rgba(30, 136, 229, 0.85)';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
        if (autoBtn) {
            autoBtn.disabled = false;
            updateAutoButton();
        }
        if (rssBtn) {
            rssBtn.disabled = false;
            updateRssButton();
        }
    }

    function updateAutoButton() {
        if (!autoBtn) return;
        if (!isEpisodePage()) {
            autoBtn.innerText = '自动：--';
            autoBtn.style.backgroundColor = 'rgba(80, 80, 80, 0.5)';
            return;
        }
        const enabled = isAutoCheckEnabled();
        const windowMs = getAutoWindowMs();
        const preset = AUTO_WINDOW_PRESETS.find(p => p.ms === windowMs);
        const label = preset ? preset.label : '?';
        autoBtn.innerText = enabled ? `自动：${label}` : '自动：关';
        autoBtn.style.backgroundColor = enabled ? 'rgba(46, 125, 50, 0.9)' : 'rgba(80, 80, 80, 0.82)';
    }

    function scheduleRssPoll() {
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
        if (!isRssPollEnabled()) return;

        autoTimer = setTimeout(pollRss, getPollIntervalMs());
    }

    async function pollRss() {
        if (!isRssPollEnabled() || isDownloading) {
            scheduleRssPoll();
            return;
        }

        // 非章节页，跳过 RSS 轮询
        if (!getRssUrl()) {
            console.log('[一迅社复原] 自动检查：当前页面非章节页，不执行 RSS 轮询。');
            scheduleRssPoll();
            return;
        }

        const latest = await fetchLatestFromRss();

        // 轮询完成，重置进度条
        pollStartTime = Date.now();

        if (!latest) {
            console.log('[一迅社复原] 自动检查：RSS 获取失败，下次重试。');
            scheduleRssPoll();
            return;
        }

        const pubDate = new Date(latest.pubDate);
        let ageText = '?';
        if (!isNaN(pubDate.getTime())) {
            const hours = Math.round((Date.now() - pubDate.getTime()) / (60 * 60 * 1000));
            if (hours >= 24) {
                const days = Math.floor(hours / 24);
                const remain = hours % 24;
                ageText = remain > 0 ? `${days}天${remain}小时` : `${days}天`;
            } else {
                ageText = `${hours}小时`;
            }
        }

        console.log(`[一迅社复原] 自动检查：RSS 最新话 "${latest.title}" (${ageText} 前更新)`);

        // 最新话已下载过，跳过
        if (hasAutoDownloaded(latest.link)) {
            console.log('[一迅社复原] 自动检查：最新话已下载过，跳过。');
            scheduleRssPoll();
            return;
        }

        // 发现新话，但自动下载未开启，仅记录
        if (!isAutoCheckEnabled()) {
            console.log(`[一迅社复原] 自动检查：发现新话 "${latest.title}"，但自动下载未开启，跳过。`);
            scheduleRssPoll();
            return;
        }

        // 检查发布时间是否在时间窗口内
        if (!isNaN(pubDate.getTime())) {
            const ageMs = Date.now() - pubDate.getTime();
            if (ageMs < 0 || ageMs > getAutoWindowMs()) {
                console.log(`[一迅社复原] 自动检查：发现新话 "${latest.title}"，但发布于 ${ageText} 前，超出时间窗口，跳过。`);
                scheduleRssPoll();
                return;
            }
        }

        // 当前页面就是最新话，直接下载
        if (location.href === latest.link) {
            console.log('[一迅社复原] 自动检查：当前页面即是最新话，开始自动下载。');
            await downloadAll({ auto: true });
        } else {
            // 发现新话，跳转过去
            console.log(`[一迅社复原] 自动检查：发现新话，跳转到 ${latest.link}`);
            location.href = latest.link;
            return;
        }

        scheduleRssPoll();
    }

    function applyNonEpisodeState() {
        if (isEpisodePage()) return;
        if (btn) {
            btn.style.backgroundColor = 'rgba(80, 80, 80, 0.5)';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
            btn.title = '当前页面非章节页，无法下载';
        }
        if (autoBtn) {
            autoBtn.style.cursor = 'not-allowed';
            autoBtn.disabled = true;
            autoBtn.title = '当前页面非章节页';
        }
        if (rssBtn) {
            rssBtn.style.cursor = 'not-allowed';
            rssBtn.disabled = true;
            rssBtn.title = '当前页面非章节页';
        }
    }

    // 创建悬浮下载按钮
    function createDownloadButton() {
        if (btn) return;
        btn = document.createElement('button');
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.left = '20px';
        btn.style.zIndex = '99999';
        btn.style.padding = '12px 24px';
        btn.style.backgroundColor = 'rgba(30, 136, 229, 0.85)';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '30px';
        btn.style.cursor = 'pointer';
        btn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        btn.style.backdropFilter = 'blur(8px)';
        btn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.backgroundColor = 'rgba(30, 136, 229, 0.95)';
            btn.style.boxShadow = '0 6px 16px rgba(30, 136, 229, 0.3)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'none';
            btn.style.backgroundColor = 'rgba(30, 136, 229, 0.85)';
            btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        });

        updateDownloadButton();

        btn.addEventListener('click', downloadAll);
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            toggleZipMode();
        });
        document.body.appendChild(btn);

        autoBtn = document.createElement('button');
        autoBtn.style.position = 'fixed';
        autoBtn.style.bottom = '72px';
        autoBtn.style.left = '20px';
        autoBtn.style.zIndex = '99999';
        autoBtn.style.padding = '12px 24px';
        autoBtn.style.color = '#fff';
        autoBtn.style.border = 'none';
        autoBtn.style.borderRadius = '30px';
        autoBtn.style.cursor = 'pointer';
        autoBtn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        autoBtn.style.fontSize = '14px';
        autoBtn.style.fontWeight = 'bold';
        autoBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        autoBtn.style.backdropFilter = 'blur(8px)';
        autoBtn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        autoBtn.addEventListener('click', () => {
            setAutoCheckEnabled(!isAutoCheckEnabled());
        });
        autoBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            cycleAutoWindow();
            // 如果当前是关闭状态，顺便开启
            if (!isAutoCheckEnabled()) {
                setAutoCheckEnabled(true);
            }
        });
        document.body.appendChild(autoBtn);
        updateAutoButton();

        // RSS 轮询开关按钮
        rssBtn = document.createElement('button');
        rssBtn.style.position = 'fixed';
        rssBtn.style.bottom = '124px';
        rssBtn.style.left = '20px';
        rssBtn.style.zIndex = '99999';
        rssBtn.style.padding = '12px 24px';
        rssBtn.style.color = '#fff';
        rssBtn.style.border = 'none';
        rssBtn.style.borderRadius = '30px';
        rssBtn.style.cursor = 'pointer';
        rssBtn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        rssBtn.style.fontSize = '14px';
        rssBtn.style.fontWeight = 'bold';
        rssBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        rssBtn.style.backdropFilter = 'blur(8px)';
        rssBtn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        rssBtn.addEventListener('click', () => {
            setRssPollEnabled(!isRssPollEnabled());
        });
        rssBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            cyclePollInterval();
            // 如果当前是关闭状态，顺便开启
            if (!isRssPollEnabled()) {
                setRssPollEnabled(true);
            }
        });
        document.body.appendChild(rssBtn);
        updateRssButton();

        // 清理过期记录 + 加载页面数据
        cleanOldDownloadLog();
        loadPageUrls();
        applyNonEpisodeState();
        pollRss();
    }

    // 页面加载完成后挂载悬浮按钮
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDownloadButton);
    } else {
        createDownloadButton();
    }
})();
