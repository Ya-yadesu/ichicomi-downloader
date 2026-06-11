# Linux 服务器漫画自动更新与下载部署指南

要在您的 Linux 服务器上实现 **自动检测漫画更新、自动下载并复原图片**，我们需要将浏览器脚本的逻辑转译为无界面的 **Python 自动化脚本**，并使用 Linux 内置的 **Crontab（定时任务）** 或 **Systemd** 进行周期性调度。

以下是完整的部署方案与代码实现。

---

## 1. 服务器环境准备

在 Linux 服务器上，我们需要安装 **Python 3** 以及两个核心依赖包：
* `requests`：用于发送 HTTP 网络请求，抓取网页和图片。
* `Pillow`：用于图像处理，执行 4x4 对齐切片转置复原。

在终端中运行以下命令安装依赖：
```bash
sudo apt update
sudo apt install -y python3 python3-pip
pip install requests pillow
```

---

## 2. 自动化下载脚本实现

请在服务器的部署目录下新建一个名为 `auto_downloader.py` 的文件，并将以下代码复制进去：

```python
import os
import re
import json
import time
import requests
from html import unescape
from PIL import Image

# ==========================================
# 自动化配置
# ==========================================
SERIES_ID = "2550912965923183980"  # 目标漫画 Series ID
BASE_URL = "https://ichicomi.com"
SERIES_URL = f"{BASE_URL}/series/{SERIES_ID}"
DOWNLOAD_DIR = "./downloads"       # 漫画下载保存的主目录
STATE_FILE = "./downloaded_episodes.json"  # 已下载话数的记录文件

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": BASE_URL
}

# 确保文件夹存在
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_state(downloaded_set):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(list(downloaded_set), f, ensure_ascii=False, indent=4)

def descramble_and_save(scrambled_bytes, output_path):
    """GigaViewer 4x4 对齐转置复原算法"""
    from io import BytesIO
    scrambled = Image.open(BytesIO(scrambled_bytes))
    width, height = scrambled.size
    
    # 1. 创建新画布并将原图作为背景写入（保留不被切片覆盖的边缘）
    restored = Image.new("RGB", (width, height))
    restored.paste(scrambled, (0, 0))
    
    # 2. 计算 8 像素对齐的切片大小
    DIVIDE_NUM = 4
    MULTIPLE = 8
    cell_width = (width // (DIVIDE_NUM * MULTIPLE)) * MULTIPLE
    cell_height = (height // (DIVIDE_NUM * MULTIPLE)) * MULTIPLE
    
    # 3. 循环还原 16 个转置切片
    for e in range(DIVIDE_NUM * DIVIDE_NUM):
        src_row = e // DIVIDE_NUM
        src_col = e % DIVIDE_NUM
        src_x = src_col * cell_width
        src_y = src_row * cell_height
        
        # 矩阵转置关系
        n = src_col * DIVIDE_NUM + src_row
        dest_x = (n % DIVIDE_NUM) * cell_width
        dest_y = (n // DIVIDE_NUM) * cell_height
        
        tile = scrambled.crop((src_x, src_y, src_x + cell_width, src_y + cell_height))
        restored.paste(tile, (dest_x, dest_y))
        
    restored.save(output_path, "JPEG", quality=98)

def download_episode(episode_id):
    episode_url = f"{BASE_URL}/episode/{episode_id}"
    print(f"[*] 正在解析话数页面: {episode_url}")
    
    res = requests.get(episode_url, headers=HEADERS)
    if res.status_code != 200:
        print(f"[!] 话数页面 {episode_id} 加载失败，状态码: {res.status_code}")
        return False
        
    html = res.text
    # 匹配并提取 json 配置
    match = re.search(r"type=['\"]text/json['\"] data-value=['\"](.*?)['\"]", html)
    if not match:
        print("[!] 未能在页面中找到 episode-json 配置")
        return False
        
    json_raw = unescape(match.group(1))
    data = json.loads(json_raw)
    
    # 提取漫画信息用于生成文件夹
    series_title = data["readableProduct"]["series"]["title"]
    episode_title = data["readableProduct"]["title"]
    pages = data["readableProduct"]["pageStructure"]["pages"]
    cho_ju_giga = data["readableProduct"]["pageStructure"].get("choJuGiga", "usagi")
    
    # 清洗特殊文件夹字符
    clean_folder_name = re.sub(r'[\\/*?:"<>|]', "_", f"{series_title}_{episode_title}")
    save_path = os.path.join(DOWNLOAD_DIR, clean_folder_name)
    os.makedirs(save_path, exist_ok=True)
    
    # 筛选有效的漫画页面
    urls = [p["src"] for p in pages if p.get("type") == "main" and p.get("src")]
    print(f"[*] 检测到共 {len(urls)} 页漫画，混淆模式: {cho_ju_giga}")
    
    for i, img_url in enumerate(urls):
        page_num = i + 1
        filename = f"{page_num:03d}.jpg"
        file_path = os.path.join(save_path, filename)
        
        # 避免重复下载本话的部分页面
        if os.path.exists(file_path):
            continue
            
        print(f"    -> 正在下载第 {page_num}/{len(urls)} 页...")
        
        # 请求切片图片
        img_res = requests.get(img_url, headers=HEADERS)
        if img_res.status_code != 200:
            print(f"    [!] 下载第 {page_num} 页失败")
            continue
            
        # 根据混淆参数选择保存策略
        if cho_ju_giga == "baku":
            descramble_and_save(img_res.content, file_path)
        else:
            with open(file_path, "wb") as f:
                f.write(img_res.content)
                
        time.sleep(0.3) # 缓冲间隔防限流
        
    print(f"[+] 成功保存话数: {episode_title} 到目录 {save_path}")
    return True

def main():
    print("[*] 正在扫描作品页是否有更新...")
    res = requests.get(SERIES_URL, headers=HEADERS)
    if res.status_code != 200:
        print(f"[!] 无法访问漫画主页: {SERIES_URL}，状态码: {res.status_code}")
        return
        
    html = res.text
    # 正则提取页面中所有的 episode ID
    episode_ids = re.findall(r"/episode/(\d+)", html)
    # 保持发现的顺序（通常页面底部是旧话，顶部是新话，去重并保持相对顺序）
    unique_ids = []
    for ep in episode_ids:
        if ep not in unique_ids:
            unique_ids.append(ep)
            
    # 从旧到新排序（反转数组，方便按顺序依次下载）
    unique_ids.reverse()
    
    downloaded = load_state()
    new_episodes = [ep for ep in unique_ids if ep not in downloaded]
    
    if not new_episodes:
        print("[*] 没有检测到新话更新。")
        return
        
    print(f"[+] 检测到新更新！共 {len(new_episodes)} 话待下载: {new_episodes}")
    
    for ep in new_episodes:
        success = download_episode(ep)
        if success:
            downloaded.add(ep)
            save_state(downloaded)
            print(f"[+] 已将话数 ID {ep} 添加至已下载记录。")
            time.sleep(2) # 话与话之间延迟

if __name__ == "__main__":
    main()
```

---

## 3. 定时任务调度 (Crontab)

要让脚本自动在后台运行（例如**每小时检查一次更新**），我们可以使用 Linux 内置的定时任务服务。

1. 打开 crontab 编辑器：
   ```bash
   crontab -e
   ```
2. 在文件底部添加以下一行（假设您的脚本放置在 `/home/user/manga` 目录下，请根据实际情况修改路径）：
   ```text
   0 * * * * cd /home/user/manga && python3 auto_downloader.py >> downloader.log 2>&1
   ```
   * `0 * * * *` 表示**每小时的第 0 分钟**执行一次。
   * `>> downloader.log 2>&1` 会将运行日志和可能出现的错误输出到当前目录下的 `downloader.log` 中，方便您随时查看服务状态。

保存并退出即可，服务已成功在后台周期性运行。
