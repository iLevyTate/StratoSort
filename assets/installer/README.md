Installer theming (optional)

Place any of the following BMP files in this folder to brand the NSIS wizard. If a file is missing, the default NSIS images are used.

- welcome.bmp: 164x314 px, 24-bit BMP. Appears on the left of the Welcome/Finish pages.
- finish.bmp: 164x314 px, 24-bit BMP. Appears on the left of Uninstall/Finish pages.
- header.bmp: 150x57 px, 24-bit BMP. Appears in the header area of all pages.

Notes
- File format must be uncompressed Windows BMP (24-bit recommended).
- Keep file names exactly as listed. Do not change extensions.
- Files live under `assets/installer/` because `electron-builder.json` sets `buildResources` to `assets`, and the script looks in `${BUILD_RESOURCES_DIR}\installer`.
- To enable theming, change `nsis.include` in `electron-builder.json` from `build/installer.nsh` to `build/installer-themed.nsh`.


