# StratoSort Auto-Organization Flow

## Overview

StratoSort maintains its original **automatic organization** capability while using the suggestion system behind the scenes for improved accuracy. Files are organized automatically without requiring user intervention for high-confidence matches.

## How It Works

### 1. Automatic Organization (Default Flow)

The system **automatically organizes files** when confidence is high:

```
Files → Analysis → Suggestions (Behind the Scenes) → Auto-Organization
```

#### Confidence Thresholds:

- **≥80% Confidence**: Automatic organization without user intervention
- **50-79% Confidence**: Flagged for optional review (but still organized)
- **<50% Confidence**: Uses fallback logic based on file type

### 2. The Auto-Organize Service

The `AutoOrganizeService` bridges the gap between the original automatic flow and the new suggestion system:

1. **Analyzes files** using existing analysis pipeline
2. **Gets suggestions** silently in the background
3. **Auto-approves** high-confidence matches
4. **Falls back** to original logic for low-confidence files
5. **Records feedback** automatically for learning

### 3. User Experience

#### Quick Mode (Default)

- User selects files to organize
- System analyzes and organizes automatically
- Only notifies about files needing review
- **No manual intervention required** for most files

#### Detailed Mode (Optional)

- User can review suggestions before organizing
- See confidence scores and alternatives
- Make manual adjustments if desired

### 4. Downloads Folder Monitoring

When enabled, the system:

1. **Watches Downloads folder** for new files
2. **Analyzes immediately** upon detection
3. **Auto-organizes** if confidence ≥90%
4. **Leaves in place** if confidence is lower

```javascript
// Auto-organize configuration
{
  autoOrganize: true,           // Enable automatic organization
  confidenceThreshold: 0.9,     // Very high threshold for Downloads
  defaultLocation: 'Documents',  // Base location for organization
}
```

## Integration Points

### 1. OrganizePhase Component

```javascript
// Uses auto-organize service automatically
const result = await window.electronAPI.organize.auto({
  files: filesToProcess,
  smartFolders,
  options: {
    defaultLocation,
    confidenceThreshold: 0.7, // Medium confidence for manual trigger
    preserveNames: false,
  },
});
```

### 2. Batch Operations

```javascript
// Batch organize with automatic approval
const result = await window.electronAPI.organize.batch({
  files: selectedFiles,
  smartFolders,
  options: {
    autoApproveThreshold: 0.8,
    groupByStrategy: true,
  },
});
```

### 3. Download Watcher

```javascript
// Process new downloads automatically
const result = await window.electronAPI.organize.processNew({
  filePath: downloadedFile,
  options: {
    autoOrganizeEnabled: settings.autoOrganize,
    confidenceThreshold: 0.9,
  },
});
```

## Confidence-Based Actions

| Confidence | Action                           | User Involvement                |
| ---------- | -------------------------------- | ------------------------------- |
| ≥90%       | Auto-organize immediately        | None                            |
| 80-89%     | Auto-organize with notification  | Optional review                 |
| 70-79%     | Organize with review option      | Can modify before applying      |
| 50-69%     | Suggest but require confirmation | Must approve                    |
| <50%       | Use fallback organization        | Automatic with type-based logic |

## Fallback Logic

When suggestions have low confidence, the system falls back to:

1. **Smart Folder Matching**: Match by category from analysis
2. **File Type Folders**: Organize by file type (Documents, Images, etc.)
3. **Category Folders**: Create folders based on analyzed category
4. **Default Folders**: Place in "Uncategorized" as last resort

## Learning & Improvement

The system automatically:

- **Records successful organizations** as positive feedback
- **Learns from patterns** over time
- **Improves confidence** with usage
- **Adapts to user preferences** without configuration

## Settings

### Auto-Organize Settings

```javascript
{
  // Core Settings
  autoOrganize: false,        // Enable/disable auto-organization
  backgroundMode: false,      // Run in background

  // Confidence Thresholds
  autoApproveThreshold: 0.8,  // Auto-approve above this
  reviewThreshold: 0.5,       // Require review below this
  rejectThreshold: 0.3,       // Reject below this

  // Behavior
  preserveNames: false,       // Keep original file names
  defaultLocation: 'Documents', // Base organization location
  maxConcurrentAnalysis: 3,   // Parallel processing limit
}
```

## Benefits

### Preserved Original Functionality

- ✅ **Automatic organization** still works as designed
- ✅ **Minimal user intervention** required
- ✅ **Batch operations** supported
- ✅ **Downloads folder monitoring** intact

### Enhanced with Suggestions

- ✅ **Better accuracy** through multiple algorithms
- ✅ **Learning system** improves over time
- ✅ **Confidence scoring** for transparency
- ✅ **Alternative options** when needed

### Backward Compatible

- ✅ **Falls back** to original logic when needed
- ✅ **No breaking changes** to existing workflow
- ✅ **Optional manual review** for control
- ✅ **Settings preserved** from original system

## Summary

The auto-organize system maintains StratoSort's original vision of **automatic file organization** while enhancing it with:

1. **Intelligent suggestions** working silently in the background
2. **Confidence-based automation** that reduces manual work
3. **Learning capabilities** that improve accuracy over time
4. **Fallback logic** ensuring files are always organized

Users get the best of both worlds: **automatic organization that just works**, with the option to review and customize when desired.
