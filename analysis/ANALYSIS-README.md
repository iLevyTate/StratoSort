# StratoSort Analysis Scripts

## 🚀 Quick Start Scripts

### Option 1: Simple Batch Script (Windows)

```bash
# Run this single command:
start-analysis-simple.bat
```

**What it does:**

1. ✅ Runs system diagnostics
2. ✅ Starts app with full logging
3. ✅ Runs GPU profiling
4. ✅ Shows instructions for DevTools

### Option 2: Advanced PowerShell Script

```bash
# Run this for complete analysis:
./start-with-analysis.ps1
```

**What it does:**

1. ✅ System health check
2. ✅ Starts app with monitoring
3. ✅ GPU profiling
4. ✅ Real-time log monitoring commands
5. ✅ DevTools instructions
6. ✅ Clean shutdown

## 🛑 How to Stop Analysis

### ✅ **YES, you can just close it!**

**When you're done analyzing:**

1. **Close the StratoSort application window** (the main app)
2. **All logs are automatically saved** to the `logs/` folder
3. **No data is lost** - everything is preserved for later review

## 📊 What Gets Recorded

### 📁 Log Files Created:

```
logs/
├── performance/performance_2025-08-25.log  # System events & timings
├── actions/actions_2025-08-25.log          # User interactions
├── errors/errors_2025-08-25.log           # Error tracking
└── ollama/ollama_2025-08-25.log           # AI operations
```

### 📋 Data Recorded:

- ✅ **GPU utilization** and memory usage
- ✅ **Ollama response times** and model performance
- ✅ **File operation timings** and success rates
- ✅ **Memory usage patterns** and heap snapshots
- ✅ **IPC call performance** between processes
- ✅ **User interactions** and UI responsiveness
- ✅ **System health metrics** and error rates

## 🔍 After Analysis

### Check Your Results:

```bash
# Recent errors
Get-Content logs/**/*.log | Select-String -Pattern 'error' -Last 10

# Performance data
Get-Content logs/performance/*.log | Select-String -Pattern 'responseTime' -Last 15

# All log files by size
Get-ChildItem logs -Recurse -File | Sort-Object Length -Descending | Select-Object FullName, Length
```

## 📈 DevTools Analysis (While App is Running)

1. **Press F12** in the StratoSort app
2. **Performance Tab**: Record during file operations
3. **Memory Tab**: Take heap snapshots before/after
4. **Network Tab**: Monitor IPC calls and timing
5. **Console Tab**: Real-time error and performance logs

## 🎯 Pro Tips

- **Run analysis during typical usage** for realistic data
- **Test with different file sizes** (small, large, batches)
- **Monitor GPU usage** during AI operations
- **Check memory patterns** for potential leaks
- **Review logs** for performance bottlenecks

---

## 📞 Need Help?

- **Check logs**: All data is saved automatically
- **Re-run scripts**: Safe to run multiple times
- **DevTools**: Available anytime app is running
- **Logs persist**: Data remains after closing app
