import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public class ReorderTiledImage {
    static int ROWS = 4, COLS = 4;
    static int[][] CURRENT = {
        { 1,  5,  9, 13},
        { 2,  6, 10, 14},
        { 3,  7, 11, 15},
        { 4,  8, 12, 16}
    };

    public static void main(String[] args) throws Exception {
        // 如果没传参数，就默认处理当前目录下的所有 .jpg 文件
        String targetDir;
        if (args.length == 0) {
            targetDir = "."; // 当前文件夹
        } else {
            targetDir = args[0];
        }

        File dir = new File(targetDir);
        if (!dir.exists()) {
            System.out.println("路径不存在: " + dir.getAbsolutePath());
            return;
        }

        // 找出所有 JPG / JPEG 文件
        File[] files = dir.listFiles(f ->
            f.isFile() && (f.getName().toLowerCase().endsWith(".jpg")
                        || f.getName().toLowerCase().endsWith(".jpeg"))
                        && !f.getName().toLowerCase().contains("_fixed")
        );

        if (files == null || files.length == 0) {
            System.out.println("未找到要处理的图片文件。");
            return;
        }

        System.out.println("共找到 " + files.length + " 个文件，开始处理...\n");

        for (File inputFile : files) {
            try {
                reorderImage(inputFile);
            } catch (Exception e) {
                System.out.println("处理失败: " + inputFile.getName() + " → " + e.getMessage());
            }
        }

        System.out.println("\n全部处理完成。");
    }

    private static void reorderImage(File inputFile) throws Exception {
        BufferedImage src = ImageIO.read(inputFile);
        int W = src.getWidth(), H = src.getHeight();
        int tileW = W / COLS, tileH = H / ROWS;

        BufferedImage[][] tiles = new BufferedImage[ROWS][COLS];
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                tiles[r][c] = src.getSubimage(c * tileW, r * tileH, tileW, tileH);
            }
        }

        // 建立编号 → 原位置映射
        int[][] pos = new int[ROWS * COLS + 1][2];
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                int idx = CURRENT[r][c];
                pos[idx][0] = r;
                pos[idx][1] = c;
            }
        }

        BufferedImage out = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        for (int r = 0; r < ROWS; r++) {
            for (int c = 0; c < COLS; c++) {
                int idx = r * COLS + c + 1;
                int sr = pos[idx][0], sc = pos[idx][1];
                g.drawImage(tiles[sr][sc], c * tileW, r * tileH, null);
            }
        }
        g.dispose();

        String name = inputFile.getName();
        int dot = name.lastIndexOf('.');
        String base = (dot == -1) ? name : name.substring(0, dot);
        String ext  = (dot == -1) ? "jpg" : name.substring(dot + 1);
        File outputFile = new File(inputFile.getParent(), base + "_fixed." + ext);

        ImageIO.write(out, "jpg", outputFile);
        System.out.println("✔ 已输出: " + outputFile.getName());
    }
}
