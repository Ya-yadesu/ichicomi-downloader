import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class App {
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) Chrome/125.0 Safari/537.36";

    private static final Pattern URL_PATTERN = Pattern.compile(
            "(?i)(?:https?:)?//[^\\s\"'<>\\\\]+?\\.(?:jpg|jpeg|png|webp|gif|avif)(?:\\?[^\\s\"'<>\\\\]*)?");
    private static final Pattern VIEWER_URL_PATTERN = Pattern.compile(
            "(?i)(?:(?:https?:)?//[^\\s\"'<>\\\\]+)?/?(?:episode/)?images/viewer/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Pattern ATTR_PATTERN = Pattern.compile(
            "(?is)(?:src|data-src|data-original|data-lazy-src|content|href|srcset)\\s*=\\s*([\"'])(.*?)\\1");

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
            printUsage();
            return;
        }

        if (args[0].startsWith("blob:")) {
            System.out.println("A blob: URL only exists inside the browser tab that created it.");
            System.out.println("Open the comic page, wait for the images to load, then paste scripts/download-blob-images.js into DevTools Console.");
            return;
        }

        URI pageUri = normalizeInputUri(args[0]);
        Path outputDir = getOutputDir(args, pageUri);

        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(20))
                .build();

        String html = fetchText(client, pageUri);
        List<URI> imageUris = extractImageUris(pageUri, html);

        if (imageUris.isEmpty()) {
            System.out.println("No image URLs were found in the initial HTML.");
            System.out.println("This page may render images only after JavaScript runs. Open DevTools, find the API request that returns page data, and pass that API URL to this tool.");
            return;
        }

        Files.createDirectories(outputDir);
        System.out.printf("Found %d image URL(s). Downloading to %s%n", imageUris.size(), outputDir.toAbsolutePath());

        int index = 1;
        int success = 0;
        for (URI imageUri : imageUris) {
            Path target = outputDir.resolve(buildFileName(index, imageUri));
            try {
                Path savedPath = download(client, imageUri, pageUri, target);
                System.out.printf("[%03d/%03d] saved %s%n", index, imageUris.size(), savedPath.getFileName());
                success++;
            } catch (Exception e) {
                System.out.printf("[%03d/%03d] failed %s (%s)%n", index, imageUris.size(), imageUri, e.getMessage());
            }
            index++;
        }

        System.out.printf("Done. %d/%d image(s) downloaded.%n", success, imageUris.size());
    }

    private static void printUsage() {
        System.out.println("Usage:");
        System.out.println("  java -cp bin App <comic-page-url> [output-dir]");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp bin App https://ichicomi.com/episode/12207421983797044657");
        System.out.println("  java -cp bin App https://ichicomi.com/episode/12207421983797044657 downloads/ichicomi-episode");
    }

    private static boolean hasFlag(String[] args, String flag) {
        for (String arg : args) {
            if (flag.equals(arg)) {
                return true;
            }
        }
        return false;
    }

    private static URI normalizeInputUri(String value) throws URISyntaxException {
        URI uri = new URI(value);
        if (uri.getScheme() == null) {
            uri = new URI("https://" + value);
        }
        return uri;
    }

    private static Path getOutputDir(String[] args, URI pageUri) {
        if (args.length >= 2 && !args[1].startsWith("-")) {
            return Paths.get(args[1]);
        }

        String lastSegment = "comic-images";
        String path = pageUri.getPath();
        if (path != null && !path.isBlank()) {
            String[] segments = path.split("/");
            for (int i = segments.length - 1; i >= 0; i--) {
                if (!segments[i].isBlank()) {
                    lastSegment = sanitizeFileName(segments[i]);
                    break;
                }
            }
        }
        return Paths.get("downloads", lastSegment);
    }

    private static String fetchText(HttpClient client, URI uri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("HTTP " + response.statusCode() + " while fetching " + uri);
        }
        return response.body();
    }

    private static List<URI> extractImageUris(URI pageUri, String html) {
        Set<String> candidates = new LinkedHashSet<>();

        Matcher attrMatcher = ATTR_PATTERN.matcher(html);
        while (attrMatcher.find()) {
            addImageCandidates(candidates, attrMatcher.group(2));
        }

        addImageCandidates(candidates, html);

        List<URI> uris = new ArrayList<>();
        for (String candidate : candidates) {
            String decoded = decodeCommonEscapes(candidate);
            try {
                URI resolved = resolve(pageUri, decoded);
                if (isLikelyImage(resolved)) {
                    uris.add(resolved);
                }
            } catch (Exception ignored) {
                // Skip malformed URLs discovered in page scripts.
            }
        }
        return uris;
    }

    private static void addImageCandidates(Set<String> candidates, String text) {
        String decoded = decodeCommonEscapes(text);
        Matcher matcher = URL_PATTERN.matcher(decoded);
        while (matcher.find()) {
            candidates.add(matcher.group());
        }

        Matcher viewerMatcher = VIEWER_URL_PATTERN.matcher(decoded);
        while (viewerMatcher.find()) {
            candidates.add(viewerMatcher.group());
        }

        for (String token : decoded.split("[,\\s]+")) {
            String cleaned = token.trim();
            int widthDescriptor = cleaned.lastIndexOf(' ');
            if (widthDescriptor > 0) {
                cleaned = cleaned.substring(0, widthDescriptor);
            }
            if (looksLikeImagePath(cleaned) || looksLikeViewerPath(cleaned)) {
                candidates.add(cleaned);
            }
        }
    }

    private static URI resolve(URI pageUri, String raw) {
        String cleaned = stripWrappingPunctuation(raw.trim());
        if (cleaned.startsWith("//")) {
            cleaned = pageUri.getScheme() + ":" + cleaned;
        }
        return pageUri.resolve(cleaned);
    }

    private static boolean isLikelyImage(URI uri) {
        return looksLikeImagePath(uri.getPath()) || looksLikeViewerPath(uri.getPath());
    }

    private static boolean looksLikeImagePath(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        int queryStart = lower.indexOf('?');
        if (queryStart >= 0) {
            lower = lower.substring(0, queryStart);
        }
        return lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".png")
                || lower.endsWith(".webp")
                || lower.endsWith(".gif")
                || lower.endsWith(".avif");
    }

    private static boolean looksLikeViewerPath(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        int queryStart = lower.indexOf('?');
        if (queryStart >= 0) {
            lower = lower.substring(0, queryStart);
        }
        return lower.matches(".*/(?:episode/)?images/viewer/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
                || lower.matches("(?:episode/)?images/viewer/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    }

    private static String decodeCommonEscapes(String value) {
        return value
                .replace("\\u002F", "/")
                .replace("\\/", "/")
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#34;", "\"")
                .replace("&#39;", "'");
    }

    private static String stripWrappingPunctuation(String value) {
        while (!value.isEmpty() && "([{'\"".indexOf(value.charAt(0)) >= 0) {
            value = value.substring(1);
        }
        while (!value.isEmpty() && ")]}'\";".indexOf(value.charAt(value.length() - 1)) >= 0) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static Path download(HttpClient client, URI imageUri, URI pageUri, Path target)
            throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(imageUri)
                .timeout(Duration.ofSeconds(60))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
                .header("Referer", pageUri.toString())
                .GET()
                .build();

        HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("HTTP " + response.statusCode());
        }

        Path finalTarget = targetWithResponseExtension(target, response);
        Files.createDirectories(target.getParent());
        try (InputStream in = response.body()) {
            Files.copy(in, finalTarget, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        return finalTarget;
    }

    private static String buildFileName(int index, URI uri) {
        String path = uri.getPath();
        String extension = ".jpg";
        int dot = path.lastIndexOf('.');
        if (dot >= 0) {
            extension = path.substring(dot).toLowerCase(Locale.ROOT);
            if (extension.length() > 6) {
                extension = ".jpg";
            }
        }
        return String.format("%03d%s", index, extension);
    }

    private static Path targetWithResponseExtension(Path target, HttpResponse<?> response) {
        String contentType = response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
        String extension = extensionFromContentType(contentType);
        if (extension == null || target.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(extension)) {
            return target;
        }

        String fileName = target.getFileName().toString();
        int dot = fileName.lastIndexOf('.');
        String base = dot >= 0 ? fileName.substring(0, dot) : fileName;
        return target.resolveSibling(base + extension);
    }

    private static String extensionFromContentType(String contentType) {
        if (contentType.contains("image/jpeg") || contentType.contains("image/jpg")) {
            return ".jpg";
        }
        if (contentType.contains("image/png")) {
            return ".png";
        }
        if (contentType.contains("image/webp")) {
            return ".webp";
        }
        if (contentType.contains("image/gif")) {
            return ".gif";
        }
        if (contentType.contains("image/avif")) {
            return ".avif";
        }
        return null;
    }

    private static String sanitizeFileName(String value) {
        return value.replaceAll("[\\\\/:*?\"<>|]", "_");
    }
}
