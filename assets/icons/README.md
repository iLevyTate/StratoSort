# StratoSort Application Icons

This directory should contain platform-specific application icons for building the app.

## Required Icon Files:

### **Windows**
- `win/icon.ico` - Windows application icon (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)

### **macOS** 
- `mac/icon.icns` - macOS application icon (1024x1024 down to 16x16)

### **Linux**
- `icon.png` - Linux application icon (512x512 recommended)

## Icon Generation

You can generate these from the existing `stratosort-logo.png` using:

```bash
# Install electron-icon-builder if not already installed
npm install -g electron-icon-builder

# Generate all platform icons from source
eib -i ../stratosort-logo.png -o .
```

## Current Status

⚠️ **MISSING**: Platform-specific icons need to be generated for distribution builds.

The app will run in development mode without these icons, but they're required for:
- Production builds
- App store distribution  
- Proper OS integration

## Fallback

Currently using the main `stratosort-logo.png` as fallback for development. 