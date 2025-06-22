# StratoSort - Working Branch Configuration

## ✅ Current Status: WORKING
**Branch**: AddTests (local)  
**Date**: December 21, 2024  
**Status**: Fully functional application

## 🏗️ Working Architecture

### Main Files (DO NOT MODIFY):
- `src/main/simple-main.js` (77KB) - Main process entry point
- `src/renderer/App.js` (170KB) - Monolithic React app with all components
- `src/preload/preload.js` (14KB) - Preload script with secure API exposure

### Configuration:
- `package.json` main: `"./src/main/simple-main.js"` ✅
- `webpack.config.js` entry: `"./src/renderer/App.js"` ✅

## 🚀 Confirmed Working Features:
- ✅ Application launches successfully
- ✅ React app loads with all components
- ✅ File selection and analysis working
- ✅ AI-powered document analysis (tested with 66MB DOCX)
- ✅ Smart folder matching and organization
- ✅ Undo/Redo system integrated
- ✅ All IPC channels functioning
- ✅ Ollama AI integration working
- ✅ Phase navigation system working

## 🚨 DO NOT MERGE FROM MAIN BRANCH
The main branch contains a broken refactoring that:
- Splits App.js into multiple files
- Breaks React rendering
- Causes blank screen on startup
- Has missing dependencies and broken imports

## 📋 Development Guidelines:
1. **Stay on this branch** for all development
2. **Test thoroughly** before any major changes
3. **Backup working files** before refactoring
4. **Document any changes** to preserve functionality
5. **Keep monolithic structure** until proven stable

## 🔧 Quick Start Commands:
```bash
npm run dev          # Development mode with logging
npm run start:quick  # Quick launch without checks
npm test            # Run test suite
```

## 📊 Performance Metrics:
- Bundle size: ~1.48 MiB (development)
- Startup time: ~2-3 seconds
- AI analysis: ~20 seconds per document
- Memory usage: Stable during operation

## 🎯 Next Steps:
- Continue feature development on this branch
- Consider this the "stable" branch
- Only merge to main when refactoring is proven stable 