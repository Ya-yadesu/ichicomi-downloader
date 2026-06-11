# Take_picture

一个无第三方依赖的 Java 漫画图片下载小工具。

## 功能

- 输入漫画前端页面 URL，自动抓取页面 HTML 中的图片地址。
- 支持 `img/srcset/data-src/data-original` 等常见属性。
- 支持脚本 JSON 中常见的 `.jpg/.jpeg/.png/.webp/.gif/.avif` 图片 URL。
- 下载时自动携带浏览器 `User-Agent` 和页面 `Referer`。
- 默认输出到 `downloads/<页面最后一段路径>/`。

## 编译

```powershell
javac -encoding UTF-8 -d bin src\App.java
```

## 使用

### 普通图片 URL

```powershell
java -cp bin App https://ichicomi.com/episode/12207421983797044657
```

指定输出目录：

```powershell
java -cp bin App https://ichicomi.com/episode/12207421983797044657 downloads\ichicomi-test
```

下载完成后，图片会按发现顺序命名为：

```text
001.jpg
002.jpg
003.jpg
...
```

### blob 图片 URL

如果你在 F12 里看到的图片地址是这种形式：

```text
blob:https://ichicomi.com/06c59ff1-72e8-4267-b6f...
```

不要把这个 `blob:` 地址直接传给 Java 程序。`blob:` 地址是浏览器内存里的临时地址，离开当前页面就无法用普通 HTTP 请求下载。

处理方法：

1. 在浏览器打开漫画页面。
2. 等漫画图片加载出来。如果页面是懒加载，先滚动到需要下载的图片都出现。
3. 打开 F12 的 Console。
4. 把 `scripts/download-blob-images.js` 的全部内容粘贴进去并回车。
5. 浏览器会按页面顺序触发下载，文件名类似 `comic-001.png`、`comic-002.png`。

脚本默认只下载宽高都不小于 `200px` 的 `blob:` 图片，用来避开图标和很小的装饰图。如果需要调整，可以修改脚本顶部：

```javascript
const config = {
  prefix: "comic",
  minWidth: 200,
  minHeight: 200,
  delayMs: 350
};
```

## 注意

如果 Java 程序下载到的只是小图标、缩略图或装饰图，说明正文漫画图片很可能是前端运行后生成的 `blob:` 图片，请改用上面的 Console 脚本。

### 从 Network 批量提取正文图

如果你已经在 DevTools 的 Network 或 Sources 里看到正文图位于：

```text
https://ichicomi.com/episode/images/viewer/<uuid>
```

但 Java 程序只下载到小图，说明这些正文图是页面运行后才请求的，初始 HTML 里没有它们。推荐用 HAR 文件批量提取：

1. 打开 DevTools 的 Network。
2. 勾选 `Preserve log`。
3. 刷新漫画页面。
4. 滚动页面，直到所有需要的漫画图都加载出来。
5. 在 Network 列表空白处右键，选择 `Save all as HAR with content`。
6. 把 HAR 文件保存到本项目目录，例如 `network.har`。
7. 运行：

```powershell
node scripts\extract-images-from-har.js network.har downloads\comic-from-har
```

脚本会从 HAR 里提取 `image/jpeg`、`image/png`、`image/webp` 等图片响应，按顺序保存为：

```text
001.jpg
002.jpg
003.jpg
...
```

请只下载你有权保存的内容，并遵守目标网站的使用条款。
