const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { execSync } = require('child_process');

// Icon sizes required for different platforms
const ICON_SIZES = {
  // Windows ICO should contain these sizes
  windows: [16, 24, 32, 48, 64, 128, 256],
  // macOS ICNS requires these sizes (will use png2icns or iconutil)
  macos: [16, 32, 64, 128, 256, 512, 1024],
  // Linux and general PNG sizes
  png: [16, 24, 32, 48, 64, 128, 256, 512, 1024],
  // Favicon sizes for web
  favicon: [16, 32, 48, 64, 96, 128, 192, 256, 512],
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function generatePngIcon(sourcePath, outputPath, size) {
  console.log(`  Generating ${size}x${size} PNG...`);
  await sharp(sourcePath)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
}

async function generateWindowsIco(sourcePath, outputDir) {
  console.log('Generating Windows ICO file...');

  const tempDir = path.join(outputDir, 'temp-ico');
  await ensureDir(tempDir);

  // Generate PNG files for each size
  const pngFiles = [];
  for (const size of ICON_SIZES.windows) {
    const pngPath = path.join(tempDir, `icon_${size}x${size}.png`);
    await generatePngIcon(sourcePath, pngPath, size);
    pngFiles.push(pngPath);
  }

  // Try to use png2ico if available, otherwise use png-to-ico package
  const icoPath = path.join(outputDir, 'win', 'icon.ico');
  await ensureDir(path.dirname(icoPath));

  try {
    // Check if png-to-ico is installed
    require.resolve('png-to-ico');
    const pngToIco = require('png-to-ico');

    const buffers = await Promise.all(
      pngFiles.map((file) => fs.readFile(file)),
    );

    const icoBuffer = await pngToIco(buffers);
    await fs.writeFile(icoPath, icoBuffer);
    console.log('  ✓ Windows ICO created using png-to-ico');
  } catch (e) {
    // Fallback: copy the 256x256 PNG and rename as ICO (basic fallback)
    console.log('  ⚠ png-to-ico not found, using fallback ICO generation');
    console.log(
      '  Run "npm install --save-dev png-to-ico" for better ICO support',
    );

    // At minimum, ensure we have an ICO file even if it's not multi-resolution
    const fallbackPng = path.join(tempDir, 'icon_256x256.png');
    await fs.copyFile(fallbackPng, icoPath);
  }

  // Clean up temp directory
  for (const file of pngFiles) {
    await fs.unlink(file).catch(() => {});
  }
  await fs.rmdir(tempDir).catch(() => {});
}

async function generateMacIcns(sourcePath, outputDir) {
  console.log('Generating macOS ICNS file...');

  const icnsDir = path.join(outputDir, 'mac');
  await ensureDir(icnsDir);

  const iconsetDir = path.join(icnsDir, 'icon.iconset');
  await ensureDir(iconsetDir);

  // Generate required PNG files for iconset
  const sizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' },
  ];

  for (const { size, name } of sizes) {
    const outputPath = path.join(iconsetDir, name);
    await generatePngIcon(sourcePath, outputPath, size);
  }

  const icnsPath = path.join(icnsDir, 'icon.icns');

  // Try to use iconutil on macOS
  if (process.platform === 'darwin') {
    try {
      execSync(`iconutil -c icns -o "${icnsPath}" "${iconsetDir}"`);
      console.log('  ✓ macOS ICNS created using iconutil');
    } catch (e) {
      console.log('  ⚠ iconutil failed, ICNS not created');
      console.log('    Build on macOS to generate proper ICNS file');
    }
  } else {
    console.log('  ⚠ Not on macOS, cannot generate ICNS file');
    console.log(
      '    The iconset folder has been created for manual conversion',
    );
    // Copy largest PNG as placeholder
    const fallbackPng = path.join(iconsetDir, 'icon_512x512@2x.png');
    const placeholderIcns = path.join(icnsDir, 'icon.png');
    await fs.copyFile(fallbackPng, placeholderIcns);
  }

  // Note: Keep iconset for reference
  console.log(`  Iconset saved at: ${iconsetDir}`);
}

async function generateAllPngSizes(sourcePath, outputDir) {
  console.log('Generating PNG files for all sizes...');

  const pngDir = path.join(outputDir, 'png');
  await ensureDir(pngDir);

  for (const size of ICON_SIZES.png) {
    const outputPath = path.join(pngDir, `${size}x${size}.png`);
    await generatePngIcon(sourcePath, outputPath, size);
  }

  // Also create square logo variants
  const squareDir = path.join(outputDir, 'square');
  await ensureDir(squareDir);

  for (const size of [192, 512, 1024]) {
    const outputPath = path.join(squareDir, `logo-${size}x${size}.png`);
    await generatePngIcon(sourcePath, outputPath, size);
  }

  console.log('  ✓ All PNG sizes generated');
}

async function generateFavicons(sourcePath, outputDir) {
  console.log('Generating favicon files...');

  const faviconDir = path.join(outputDir, 'favicon');
  await ensureDir(faviconDir);

  // Generate favicon.ico with multiple sizes
  const sizes = [16, 32, 48];
  const pngFiles = [];

  for (const size of sizes) {
    const pngPath = path.join(faviconDir, `favicon-${size}x${size}.png`);
    await generatePngIcon(sourcePath, pngPath, size);
    pngFiles.push(pngPath);
  }

  // Generate web app manifest icons
  for (const size of ICON_SIZES.favicon) {
    const outputPath = path.join(faviconDir, `icon-${size}x${size}.png`);
    await generatePngIcon(sourcePath, outputPath, size);
  }

  console.log('  ✓ Favicon files generated');
}

async function generateDmgBackground(sourcePath, outputDir) {
  console.log('Generating DMG background image...');

  const installerDir = path.join(outputDir, '..', 'installer');
  await ensureDir(installerDir);

  const dmgBgPath = path.join(installerDir, 'dmg-background.png');

  // Create a 540x380 background with logo centered
  await sharp(sourcePath)
    .resize(200, 200, {
      fit: 'contain',
      background: { r: 245, g: 245, b: 247, alpha: 1 },
    })
    .extend({
      top: 90,
      bottom: 90,
      left: 170,
      right: 170,
      background: { r: 245, g: 245, b: 247, alpha: 1 },
    })
    .png()
    .toFile(dmgBgPath);

  console.log('  ✓ DMG background generated');
}

async function main() {
  const projectRoot = process.cwd();
  const sourceLogo = path.join(projectRoot, 'assets', 'stratosort-logo.png');
  const outputDir = path.join(projectRoot, 'assets', 'icons');

  // Check if source logo exists
  try {
    await fs.access(sourceLogo);
  } catch (e) {
    console.error('❌ Source logo not found:', sourceLogo);
    console.error('   Please ensure assets/stratosort-logo.png exists');
    process.exit(1);
  }

  console.log('🎨 StratoSort Icon Generator');
  console.log('============================');
  console.log(`Source: ${sourceLogo}`);
  console.log(`Output: ${outputDir}\n`);

  try {
    // Generate icons for all platforms
    await generateWindowsIco(sourceLogo, outputDir);
    await generateMacIcns(sourceLogo, outputDir);
    await generateAllPngSizes(sourceLogo, outputDir);
    await generateFavicons(sourceLogo, outputDir);
    await generateDmgBackground(sourceLogo, outputDir);

    console.log('\n✅ All icons generated successfully!');
    console.log('\nGenerated assets:');
    console.log('  • Windows: assets/icons/win/icon.ico');
    console.log('  • macOS: assets/icons/mac/icon.icns (or iconset)');
    console.log('  • PNG: assets/icons/png/ (all sizes)');
    console.log('  • Favicons: assets/icons/favicon/');
    console.log('  • DMG Background: assets/installer/dmg-background.png');

    // Also run NSIS assets generation
    console.log('\nGenerating NSIS installer assets...');
    require('./generate-nsis-assets');
  } catch (error) {
    console.error('\n❌ Error generating icons:', error);
    process.exit(1);
  }
}

// Check if png-to-ico is installed and suggest installation if not
async function checkDependencies() {
  try {
    require.resolve('png-to-ico');
  } catch (e) {
    console.log('📦 Optional dependency missing: png-to-ico');
    console.log('   Install it for better Windows ICO support:');
    console.log('   npm install --save-dev png-to-ico\n');
  }
}

// Run the script
checkDependencies().then(() => {
  if (require.main === module) {
    main().catch(console.error);
  }
});

module.exports = { generatePngIcon, generateWindowsIco, generateMacIcns };
