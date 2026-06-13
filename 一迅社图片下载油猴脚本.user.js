// ==UserScript==
// @name         一迅社图片下载油猴脚本
// @namespace    https://github.com/Ya-yadesu/ichicomi-downloader
// @version      3.5
// @description  精简版一迅社漫画图片复原下载脚本。提供“一键下载整话”悬浮按钮，支持后台静默下载、4x4对齐复原及边缘像素保留。支持自定义导出画质，支持自动打包为zip。
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
        zipEnabled: true       // 是否开启自动打包为 ZIP 文件 (true: 开启打包, false: 依次下载单张图片)
    };

    let btn = null;
    let pageUrls = null;

    // 获取并解析页面 URLs 结构
    function loadPageUrls() {
        const el = document.getElementById('episode-json');
        if (el) {
            try {
                const data = JSON.parse(el.getAttribute('data-value'));
                const pages = data.readableProduct.pageStructure.pages;
                pageUrls = pages.filter(p => p.type === 'main' && p.src).map(p => p.src);
                console.log(`[一迅社复原] 成功获取页面结构，共 ${pageUrls.length} 页。`);
            } catch (e) {
                console.error("[一迅社复原] 解析页面 JSON 失败", e);
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
        const el = document.getElementById('episode-json');
        if (el) {
            try {
                const data = JSON.parse(el.getAttribute('data-value'));
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

    // 一键下载整话逻辑
    async function downloadAll() {
        if (!pageUrls) {
            loadPageUrls();
        }
        if (!pageUrls || pageUrls.length === 0) {
            alert("未找到漫画页面结构，请等待页面完全加载后再试。");
            return;
        }

        btn.disabled = true;
        btn.style.backgroundColor = 'rgba(128, 128, 128, 0.8)';
        btn.style.cursor = 'not-allowed';

        console.log(`[一迅社复原] 开始一键下载，共 ${pageUrls.length} 页。`);

        let zip = null;
        if (CONFIG.zipEnabled) {
            if (typeof JSZip === 'undefined') {
                alert("JSZip 库未加载成功，请检查网络或脚本声明。");
                resetButton();
                return;
            }
            zip = new JSZip();
        }

        let successCount = 0;

        for (let i = 0; i < pageUrls.length; i++) {
            const pageIndex = i + 1;
            btn.innerText = `下载中 (${pageIndex}/${pageUrls.length})`;

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
            btn.innerText = "正在打包 ZIP...";
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
                alert("打包 ZIP 失败，请查看控制台错误。");
            }
        }

        btn.innerText = "下载完成";
        btn.style.backgroundColor = 'rgba(76, 175, 80, 0.85)';

        setTimeout(() => {
            resetButton();
        }, 3000);
    }

    function resetButton() {
        btn.innerText = "一键下载整话";
        btn.style.backgroundColor = 'rgba(30, 136, 229, 0.85)';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
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

        // 尝试提前加载页面结构数据
        loadPageUrls();
    }

    // 页面加载完成后挂载悬浮按钮
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDownloadButton);
    } else {
        createDownloadButton();
    }
})();