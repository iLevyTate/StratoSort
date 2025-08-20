const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function toBmp(
  srcPngPath,
  outBmpPath,
  width,
  height,
  background = { r: 255, g: 255, b: 255, alpha: 1 },
) {
  // Since sharp doesn't support BMP directly, we'll create high-quality PNGs
  // that NSIS can use (NSIS MUI2 accepts PNG files as well)
  const outputPath = outBmpPath.replace('.bmp', '.png');
  await sharp(srcPngPath)
    .resize(width, height, { fit: 'contain', background })
    .flatten({ background })
    .png()
    .toFile(outputPath);
  console.log(`  Generated: ${path.basename(outputPath)} (${width}x${height})`);
}

async function main() {
  const projectRoot = process.cwd();
  const assetsDir = path.join(projectRoot, 'assets');
  const logoPng = path.join(assetsDir, 'stratosort-logo.png');
  const outDir = path.join(assetsDir, 'installer');

  if (!fs.existsSync(logoPng)) {
    console.log('[nsis-assets] Logo not found, skipping generation:', logoPng);
    return;
  }

  await ensureDir(outDir);
  const headerBmp = path.join(outDir, 'header.bmp');
  const welcomeBmp = path.join(outDir, 'welcome.bmp');
  const finishBmp = path.join(outDir, 'finish.bmp');

  // Recommended sizes for NSIS MUI2
  // header.bmp ~150x57, welcome/finish left bitmap ~164x314
  await toBmp(logoPng, headerBmp, 150, 57);
  await toBmp(logoPng, welcomeBmp, 164, 314);
  await toBmp(logoPng, finishBmp, 164, 314);

  console.log('[nsis-assets] Generated:', { headerBmp, welcomeBmp, finishBmp });
}

main().catch((err) => {
  console.error('[nsis-assets] Error generating assets', err);
  process.exit(0); // Do not fail the build if generation fails
});
