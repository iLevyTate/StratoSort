# 🚀 StratoSort Quick Start Guide

Welcome to StratoSort! This guide will help you get started in just a few minutes.

## 📦 Installation (5 minutes)

### Step 1: Download StratoSort

**Windows Users:**

1. Go to the [Releases page](https://github.com/stratosort/stratosort/releases/latest)
2. Download `StratoSort-Setup-1.0.0.exe`
3. The installer is also available at: `release/build/` after building

**Mac Users:**

- Download `StratoSort-1.0.0.dmg`

**Linux Users:**

- Download `StratoSort-1.0.0.AppImage`

### Step 2: Install

1. **Run the installer** (double-click the downloaded file)
2. **Follow the wizard** - Accept defaults for easy setup
3. **AI Setup** - The installer will:
   - Check for Ollama (AI engine)
   - Offer to install it if missing
   - Download required AI models (~6GB, one-time)

### Step 3: Launch

- Click **"Launch StratoSort"** at the end of installation
- Or find it in your Start Menu / Applications

---

## 🎯 Your First Organization (2 minutes)

### 1. Select Files to Organize

**Option A: Quick Start**

- Click **"Select Directory"**
- Choose your **Downloads** folder
- StratoSort will scan all files

**Option B: Specific Files**

- Click **"Select Files"**
- Choose individual files to organize

### 2. Analyze with AI

- Click **"Analyze Files"**
- Watch as AI examines your files:
  - ✅ Reads document content
  - ✅ Understands images
  - ✅ Identifies file types

### 3. Review Suggestions

The AI will suggest:

- **📁 Best folder** for each file
- **📝 Better filename** if needed
- **🎯 Confidence level** (Great/Good/Possible Match)

### 4. Organize!

- Click **"Organize Files"**
- Files move to suggested locations
- **Don't worry!** Full undo with `Ctrl+Z`

---

## 💡 Pro Tips

### Create Smart Folders

1. Go to **Setup** phase
2. Click **"Add Smart Folder"**
3. Give it a name and description
4. AI will automatically route matching files there!

**Examples:**

- **"Receipts"** - For shopping receipts and invoices
- **"Work Projects"** - For work-related documents
- **"Family Photos"** - For personal pictures

### Enable Auto-Organization

1. Go to **Settings** → **Auto-Organize**
2. Turn on **"Watch Downloads Folder"**
3. New downloads organize automatically!

### Keyboard Shortcuts

- **Undo**: `Ctrl+Z` (Windows) or `Cmd+Z` (Mac)
- **Redo**: `Ctrl+Y` (Windows) or `Cmd+Shift+Z` (Mac)
- **Select All**: `Ctrl+A` (Windows) or `Cmd+A` (Mac)

---

## 🔧 Troubleshooting

### "AI Models Not Found"

**Solution:**

1. Open Command Prompt/Terminal
2. Run: `ollama serve` (starts AI service)
3. Run: `ollama pull llama3.2:latest` (downloads text model)
4. Run: `ollama pull llava:latest` (downloads vision model)
5. Restart StratoSort

### "Files Not Moving"

**Check:**

- You have permission to move the files
- Destination folders exist
- Files aren't open in other programs

### "Slow Performance"

**Try:**

- Close other applications
- Check available disk space (need ~6GB free)
- Use Settings to select lighter AI models

---

## 📚 Learn More

### Understanding Confidence Levels

- **✅ Great Match (80-100%)** - AI is very confident
- **👍 Good Match (60-79%)** - AI is fairly sure
- **💡 Possible Match (40-59%)** - AI suggests reviewing

### Organization Strategies

StratoSort offers different strategies:

- **Content-Based** - By what's inside files
- **Project-Based** - Group related work
- **Date-Based** - By creation/modification date
- **Type-Based** - By file format
- **Custom** - Your own rules

### Privacy & Security

- ✅ **100% Local** - Nothing leaves your computer
- ✅ **No Internet** - Works completely offline
- ✅ **No Tracking** - We don't collect any data
- ✅ **Open Source** - Verify our code yourself

---

## 🎉 Ready to Organize!

You now know everything needed to:

1. **Clean up** messy folders
2. **Organize** downloads automatically
3. **Find** files quickly with smart folders

### Need Help?

- 📖 [Full Documentation](README.md)
- 🐛 [Report Issues](https://github.com/stratosort/stratosort/issues)
- 💬 [Community Support](https://github.com/stratosort/stratosort/discussions)

---

**Tip**: Start with a small folder to see how it works, then tackle bigger organization projects!

Happy organizing! 🚀
