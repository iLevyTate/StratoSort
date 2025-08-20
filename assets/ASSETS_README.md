# StratoSort Assets Documentation

## Overview
This directory contains all visual assets for the StratoSort application, including icons, logos, and installer graphics.

## Asset Generation

### Quick Start
To regenerate all assets from the source logo:
```bash
npm run generate:assets
```

This command will:
1. Generate all icon sizes for all platforms
2. Create installer graphics (NSIS, DMG backgrounds)
3. Generate favicons for web usage

### Individual Commands
- `npm run generate:icons` - Generate only icons
- `npm run generate:nsis` - Generate only NSIS installer assets

## Directory Structure

```
assets/
├── stratosort-logo.png      # Source logo (master file)
├── icons/
│   ├── win/
│   │   └── icon.ico         # Windows application icon
│   ├── mac/
│   │   ├── icon.icns        # macOS application icon
│   │   └── icon.iconset/    # macOS iconset source files
│   ├── png/                 # All PNG sizes (16x16 to 1024x1024)
│   ├── square/              # Square logo variants
│   └── favicon/             # Web favicon files
└── installer/
    ├── dmg-background.png   # macOS DMG installer background
    ├── header.png           # Windows NSIS header (150x57)
    ├── welcome.png          # Windows NSIS welcome (164x314)
    └── finish.png           # Windows NSIS finish (164x314)
```

## Platform Requirements

### Windows
- **Application Icon**: `icons/win/icon.ico`
  - Contains: 16, 24, 32, 48, 64, 128, 256px sizes
  - Used for: Desktop shortcuts, taskbar, file explorer

### macOS
- **Application Icon**: `icons/mac/icon.icns`
  - Contains: All required sizes from 16x16 to 1024x1024
  - Includes @2x variants for Retina displays
  - Note: ICNS file must be generated on macOS for full compatibility

### Linux
- **Application Icons**: `icons/png/*.png`
  - Various sizes for different desktop environments
  - Most commonly used: 256x256, 512x512

## Icon Sizes

### Generated PNG Sizes
- 16x16 - Smallest UI elements, file lists
- 24x24 - Toolbar icons
- 32x32 - Small desktop icons
- 48x48 - Medium desktop icons
- 64x64 - Large toolbar/dock icons
- 128x128 - Large desktop icons
- 256x256 - Extra large icons, store listings
- 512x512 - macOS Retina displays, Linux
- 1024x1024 - App stores, macOS maximum size

### Favicon Sizes
- 16x16 - Browser tabs
- 32x32 - Taskbar, bookmarks
- 48x48 - Windows site icons
- 64x64, 96x96 - Various uses
- 128x128 - Chrome Web Store
- 192x192 - Android home screen
- 256x256, 512x512 - PWA splash screens

## Installer Graphics

### Windows NSIS
- **header.png** (150x57): Top banner during installation
- **welcome.png** (164x314): Left side of welcome/finish screens
- **finish.png** (164x314): Left side of finish screen

### macOS DMG
- **dmg-background.png** (540x380): Background image for DMG window
- Shows app icon with arrow pointing to Applications folder

## Design Guidelines

### Logo Requirements
- **Source File**: `stratosort-logo.png`
- **Minimum Size**: 1024x1024 pixels
- **Format**: PNG with transparency
- **Color Space**: sRGB

### Best Practices
1. Always regenerate all assets after logo changes
2. Test icons at small sizes for clarity
3. Ensure adequate padding around logo
4. Maintain consistent visual weight across sizes

## Troubleshooting

### Windows ICO Issues
If ICO generation fails:
1. Ensure `png-to-ico` is installed: `npm install --save-dev png-to-ico`
2. Fallback uses 256x256 PNG renamed as ICO

### macOS ICNS Generation
- Must be built on macOS for proper ICNS generation
- On Windows/Linux: iconset folder is created for manual conversion
- Use `iconutil` on macOS: `iconutil -c icns -o icon.icns icon.iconset`

### Missing Assets
If assets are missing after generation:
1. Check source logo exists: `assets/stratosort-logo.png`
2. Ensure sufficient disk space
3. Run with verbose output: `node scripts/generate-icons.js`

## CI/CD Integration

The GitHub Actions workflow automatically generates assets during builds:
- Assets are generated before packaging
- Ensures consistent icons across all builds
- No manual intervention required

## Manual Asset Creation

For custom assets not covered by the generator:
1. Place files in appropriate directories
2. Follow naming conventions
3. Update this documentation

## License

All assets in this directory are part of the StratoSort project and subject to the project's MIT license.
