// ==UserScript==
// @name         ichicomi-downloader
// @name:zh-CN   一迅社图片下载油猴脚本
// @namespace    https://github.com/Ya-yadesu/ichicomi-downloader
// @version      3.7
// @description  Manga image downloader and restorer for Ichijinsha (ichicomi.com). Supports 4x4 image restoration, auto-ZIP packaging, and automatic update checks.
// @description:zh-CN 精简版一迅社漫画图片复原下载脚本。提供“一键下载整话”悬浮按钮，支持后台静默下载、4x4对齐复原及边缘像素保留。支持自定义导出画质、自动打包为zip，以及自动刷新检查近一天更新并下载。
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
        autoCheckIntervalMs: 30 * 60 * 1000,      // 自动检查开启后，每隔多久刷新页面检查一次更新
        autoRecentWindowMs: 24 * 60 * 60 * 1000   // 自动下载的更新时间窗口：近 24 小时
    };

    const AUTO_ENABLED_KEY = 'ichicomiDownloader.autoCheckEnabled';
    const AUTO_DOWNLOAD_LOG_KEY = 'ichicomiDownloader.autoDownloadedEpisodes';

    let btn = null;
    let autoBtn = null;
    let pageUrls = null;
    let episodeData = null;
    let autoTimer = null;
    let isDownloading = false;

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

    function parseDateValue(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') {
            const timestamp = value < 1000000000000 ? value * 1000 : value;
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? null : date;
        }
        if (typeof value !== 'string') return null;

        const normalized = value
            .trim()
            .replace(/[年月]/g, '/')
            .replace(/日/g, '')
            .replace(/\./g, '/');

        if (/^\d+$/.test(normalized)) {
            return parseDateValue(Number(normalized));
        }

        const date = new Date(normalized);
        return isNaN(date.getTime()) ? null : date;
    }

    function collectDateCandidates(source, candidates) {
        if (!source || typeof source !== 'object') return;
        const dateKeyPattern = /(publish|published|release|released|start|update|updated|created|date|opened|available|begin|delivery|display)/i;

        Object.keys(source).forEach(key => {
            const value = source[key];
            if (dateKeyPattern.test(key)) {
                const parsed = parseDateValue(value);
                if (parsed) candidates.push({ key, date: parsed });
            }
            if (value && typeof value === 'object') {
                collectDateCandidates(value, candidates);
            }
        });
    }

    function extractDateFromPageText() {
        const text = document.body ? document.body.innerText : "";
        if (!text) return null;

        const patterns = [
            /\b20\d{2}[/-]\d{1,2}[/-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\b/g,
            /20\d{2}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (!matches) continue;
            for (const match of matches) {
                const parsed = parseDateValue(match);
                if (parsed) return parsed;
            }
        }
        return null;
    }

    function getEpisodeUpdatedAt() {
        const candidates = [];
        const data = getEpisodeData();
        if (data) collectDateCandidates(data, candidates);

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
            console.log(`[一迅社复原] 检测到章节时间字段 ${candidates[0].key}: ${candidates[0].date.toISOString()}`);
            return candidates[0].date;
        }

        const fallbackDate = extractDateFromPageText();
        if (fallbackDate) {
            console.log(`[一迅社复原] 从页面文本检测到章节时间: ${fallbackDate.toISOString()}`);
        }
        return fallbackDate;
    }

    function getEpisodeKey() {
        const data = getEpisodeData();
        const prod = data && data.readableProduct;
        const rawKey = prod && (prod.id || prod.readableProductId || prod.productId || prod.episodeId || prod.title);
        return String(rawKey || `${location.origin}${location.pathname}`);
    }

    function getAutoDownloadedLog() {
        try {
            const parsed = JSON.parse(localStorage.getItem(AUTO_DOWNLOAD_LOG_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function markAutoDownloaded(updatedAt) {
        const log = getAutoDownloadedLog();
        log[getEpisodeKey()] = {
            title: getEpisodeTitle(),
            updatedAt: updatedAt ? updatedAt.toISOString() : null,
            downloadedAt: new Date().toISOString()
        };
        localStorage.setItem(AUTO_DOWNLOAD_LOG_KEY, JSON.stringify(log));
    }

    function hasAutoDownloaded(updatedAt) {
        const record = getAutoDownloadedLog()[getEpisodeKey()];
        if (!record) return false;
        if (!updatedAt || !record.updatedAt) return true;
        return record.updatedAt === updatedAt.toISOString();
    }

    function isAutoCheckEnabled() {
        return localStorage.getItem(AUTO_ENABLED_KEY) === 'true';
    }

    function setAutoCheckEnabled(enabled) {
        localStorage.setItem(AUTO_ENABLED_KEY, enabled ? 'true' : 'false');
        updateAutoButton();
        scheduleAutoRefresh();
        if (enabled) {
            runAutoCheck();
        }
    }

    // 一键下载整话逻辑
    async function downloadAll(options = {}) {
        const isAuto = Boolean(options.auto);
        if (isDownloading) {
            console.log("[一迅社复原] 下载任务已在运行，跳过重复触发。");
            return false;
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

        console.log(`[一迅社复原] 开始一键下载，共 ${pageUrls.length} 页。`);

        let zip = null;
        if (CONFIG.zipEnabled) {
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
                const res = await fetch(url);
                const blob = await res.blob();
                const result = await processAndRestore(blob, pageIndex);
                
                if (CONFIG.zipEnabled && zip) {
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

        if (CONFIG.zipEnabled && zip && successCount > 0) {
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
        btn.innerText = "一键下载整话";
        btn.style.backgroundColor = 'rgba(30, 136, 229, 0.85)';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
        if (autoBtn) {
            autoBtn.disabled = false;
            updateAutoButton();
        }
    }

    function updateAutoButton() {
        if (!autoBtn) return;
        const enabled = isAutoCheckEnabled();
        autoBtn.innerText = enabled ? "自动检查：开" : "自动检查：关";
        autoBtn.style.backgroundColor = enabled ? 'rgba(46, 125, 50, 0.9)' : 'rgba(80, 80, 80, 0.82)';
    }

    function scheduleAutoRefresh() {
        if (autoTimer) {
            clearTimeout(autoTimer);
            autoTimer = null;
        }
        if (!isAutoCheckEnabled()) return;
        if (!document.getElementById('episode-json')) {
            console.log("[一迅社复原] 自动检查：当前页面不是可识别的章节页，不安排自动刷新。");
            return;
        }

        autoTimer = setTimeout(() => {
            if (isDownloading) {
                scheduleAutoRefresh();
                return;
            }
            console.log("[一迅社复原] 自动检查：刷新页面以检查更新。");
            location.reload();
        }, CONFIG.autoCheckIntervalMs);
    }

    async function runAutoCheck() {
        if (!isAutoCheckEnabled() || isDownloading) return;

        const updatedAt = getEpisodeUpdatedAt();
        if (!updatedAt) {
            console.log("[一迅社复原] 自动检查：未检测到章节更新时间，本轮不自动下载。");
            scheduleAutoRefresh();
            return;
        }

        const ageMs = Date.now() - updatedAt.getTime();
        if (ageMs < 0 || ageMs > CONFIG.autoRecentWindowMs) {
            console.log(`[一迅社复原] 自动检查：${getEpisodeTitle()} 不在近 24 小时更新窗口内。`);
            scheduleAutoRefresh();
            return;
        }

        if (hasAutoDownloaded(updatedAt)) {
            console.log(`[一迅社复原] 自动检查：${getEpisodeTitle()} 已自动下载过，跳过。`);
            scheduleAutoRefresh();
            return;
        }

        console.log(`[一迅社复原] 自动检查：发现近 24 小时内更新，开始自动下载 ${getEpisodeTitle()}。`);
        const downloaded = await downloadAll({ auto: true });
        if (downloaded) {
            markAutoDownloaded(updatedAt);
        }
        scheduleAutoRefresh();
    }

    // 创建悬浮下载按钮
    function createDownloadButton() {
        if (btn) return;
        btn = document.createElement('button');
        btn.innerText = "一键下载整话";
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

        btn.addEventListener('click', downloadAll);
        document.body.appendChild(btn);

        autoBtn = document.createElement('button');
        autoBtn.style.position = 'fixed';
        autoBtn.style.bottom = '68px';
        autoBtn.style.left = '20px';
        autoBtn.style.zIndex = '99999';
        autoBtn.style.padding = '10px 18px';
        autoBtn.style.color = '#fff';
        autoBtn.style.border = 'none';
        autoBtn.style.borderRadius = '30px';
        autoBtn.style.cursor = 'pointer';
        autoBtn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        autoBtn.style.fontSize = '13px';
        autoBtn.style.fontWeight = 'bold';
        autoBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        autoBtn.style.backdropFilter = 'blur(8px)';
        autoBtn.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        autoBtn.addEventListener('click', () => {
            setAutoCheckEnabled(!isAutoCheckEnabled());
        });
        document.body.appendChild(autoBtn);
        updateAutoButton();

        // 尝试提前加载页面结构数据
        loadPageUrls();
        runAutoCheck();
        scheduleAutoRefresh();
    }

    // 页面加载完成后挂载悬浮按钮
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDownloadButton);
    } else {
        createDownloadButton();
    }
})();
