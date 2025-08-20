# Organization Suggestions Enhancement Guide

## Overview

StratoSort now includes an advanced organization suggestion system that provides intelligent, multi-strategy recommendations for organizing your files. This system learns from your preferences and provides confidence-scored suggestions with explanations.

## Smart Folders Integration

The suggestion system is **fully integrated with Smart Folders**:

- **Smart folders are prioritized** in all suggestions
- **Semantic matching** uses smart folder embeddings for accurate placement
- **Improvement suggestions** help optimize your existing folder structure
- **New folder suggestions** when files don't fit existing categories
- **Usage tracking** to identify underutilized folders

## Key Features

### 1. **Multi-Strategy Organization**

The system supports multiple organization strategies:

- **Project-Based**: Organize files by project or client
- **Date-Based**: Organize files chronologically
- **Type-Based**: Organize by file type and purpose
- **Workflow-Based**: Organize by workflow stage (draft, review, final)
- **Hierarchical**: Multi-level categorization

### 2. **Intelligent Suggestion Sources**

Suggestions are generated from multiple sources:

- **Semantic Matching**: Uses embeddings to find similar content
- **Strategy-Based**: Applies organization patterns
- **User Patterns**: Learns from your previous organization choices
- **LLM-Powered**: AI-generated creative alternatives

### 3. **Confidence Scoring**

Each suggestion includes:

- Confidence percentage (0-100%)
- Visual indicators (color-coded)
- Human-readable explanations
- Source attribution

### 4. **Batch Organization**

Analyze multiple files together to:

- Identify common patterns
- Group related files
- Apply consistent strategies
- Get batch-level recommendations

## Smart Folder Improvements

The system analyzes your current smart folder structure and provides:

### Improvement Categories

1. **Missing Categories**: Suggests common folders you might need
   - Projects, Archive, Templates, Reports
   - Based on detected file types and patterns
   - Priority: High when relevant files are found

2. **Folder Overlaps**: Identifies similar folders that could be merged
   - Detects >70% similarity in purpose
   - Suggests consolidation strategies
   - Priority: Medium for efficiency

3. **Underutilized Folders**: Finds rarely used folders
   - Tracks usage statistics
   - Suggests removal or broadening scope
   - Priority: Low for cleanup

4. **Hierarchy Improvements**: Optimizes folder structure
   - Suggests parent folders for related items
   - Improves navigation and organization
   - Priority: Medium for better structure

### FolderImprovementSuggestions Component

Displays comprehensive folder structure analysis:

```jsx
import { FolderImprovementSuggestions } from './components/organize';

<FolderImprovementSuggestions
  improvements={folderAnalysis}
  smartFolders={currentFolders}
  onAcceptImprovement={handleAcceptImprovement}
  onCreateFolder={handleCreateFolder}
  onMergeFolders={handleMergeFolders}
/>;
```

Features:

- Health score calculation (0-100%)
- Priority-based recommendations
- Interactive improvement actions
- Export analysis reports

## UI Components

### OrganizationSuggestions

Displays suggestions for individual files with:

- Primary recommendation with confidence
- Alternative suggestions (expandable)
- Available organization strategies
- Accept/Reject actions

```jsx
import { OrganizationSuggestions } from './components/organize';

<OrganizationSuggestions
  file={currentFile}
  suggestions={fileSuggestions}
  onAccept={handleAcceptSuggestion}
  onReject={handleRejectSuggestion}
  onStrategyChange={handleStrategyChange}
/>;
```

### BatchOrganizationSuggestions

For organizing multiple files:

- Pattern analysis
- File grouping visualization
- Strategy recommendations
- Batch actions

```jsx
import { BatchOrganizationSuggestions } from './components/organize';

<BatchOrganizationSuggestions
  batchSuggestions={batchResults}
  onAcceptStrategy={handleStrategyAccept}
  onCustomizeGroup={handleGroupCustomization}
  onRejectAll={handleRejectAll}
/>;
```

### OrganizationPreview

Preview how files will be organized:

- Visual tree structure
- Before/After comparison
- Statistics (files moved, renamed)
- Folder structure visualization

```jsx
import { OrganizationPreview } from './components/organize';

<OrganizationPreview
  files={selectedFiles}
  strategy={selectedStrategy}
  suggestions={organizationPlan}
  onConfirm={handleConfirmOrganization}
  onCancel={handleCancel}
/>;
```

## API Usage

### Get Suggestions for a Single File

```javascript
const suggestions = await window.electronAPI.suggestions.getFileSuggestions(
  file,
  { includeAlternatives: true }
);

// Response structure:
{
  success: true,
  primary: {
    folder: "Projects/ClientA",
    confidence: 0.85,
    path: "/Documents/Projects/ClientA"
  },
  alternatives: [...],
  strategies: [...],
  explanation: "Based on content similarity with 'Projects/ClientA' folder"
}
```

### Get Batch Suggestions

```javascript
const batchSuggestions = await window.electronAPI.suggestions.getBatchSuggestions(
  selectedFiles,
  { analyzePatterns: true }
);

// Response includes:
{
  groups: [...],        // Files grouped by suggested folders
  patterns: {...},      // Common patterns identified
  recommendations: [...], // Strategic recommendations
  suggestedStrategy: {...} // Best overall strategy
}
```

### Record User Feedback

```javascript
// When user accepts a suggestion
await window.electronAPI.suggestions.recordFeedback(
  file,
  acceptedSuggestion,
  true, // accepted
);

// When user rejects a suggestion
await window.electronAPI.suggestions.recordFeedback(
  file,
  rejectedSuggestion,
  false, // rejected
);
```

### Apply Organization Strategy

```javascript
const results = await window.electronAPI.suggestions.applyStrategy(
  files,
  'project-based', // strategy ID
);
```

## How It Works

### 1. File Analysis

When a file is selected, the system:

- Analyzes file content and metadata
- Generates semantic embeddings
- Extracts key information (project, date, type)

### 2. Suggestion Generation

Multiple algorithms work in parallel:

- **Semantic Search**: Finds folders with similar content
- **Pattern Matching**: Identifies naming/organization patterns
- **Strategy Application**: Applies predefined organization rules
- **LLM Analysis**: Generates creative alternatives

### 3. Ranking & Scoring

Suggestions are ranked by:

- Content similarity score
- User preference history
- Strategy applicability
- Source reliability weighting

### 4. Learning & Improvement

The system learns from:

- User feedback (accept/reject)
- Organization patterns
- Folder usage frequency
- Successful organizations

## Configuration

### Organization Strategies

Strategies can be customized in the app settings:

```javascript
{
  "organizationStrategies": {
    "project-based": {
      "enabled": true,
      "priority": ["project", "client", "task"],
      "pattern": "Projects/{project_name}/{file_type}"
    },
    // ... more strategies
  }
}
```

### Confidence Thresholds

Adjust confidence thresholds:

```javascript
{
  "suggestionThresholds": {
    "highConfidence": 0.8,   // Green indicator
    "mediumConfidence": 0.5, // Yellow indicator
    "lowConfidence": 0.3     // Orange indicator
  }
}
```

## Best Practices

1. **Review Suggestions**: Always review AI suggestions before applying
2. **Provide Feedback**: Accept/reject suggestions to improve accuracy
3. **Use Batch Mode**: Process related files together for better organization
4. **Preview Changes**: Use the preview feature before confirming
5. **Customize Strategies**: Adapt strategies to your workflow

## Technical Details

### Service Architecture

```
OrganizationSuggestionService
├── Semantic Matching (ChromaDB embeddings)
├── Strategy Engine (pattern-based rules)
├── User Pattern Learning (feedback loop)
└── LLM Integration (Ollama models)
```

### Performance Optimizations

- Parallel suggestion generation
- Embedding caching
- Batch processing support
- Incremental learning

### Data Privacy

- All processing happens locally
- No data sent to external services
- User patterns stored locally
- Can be reset anytime

## Troubleshooting

### Low Confidence Scores

- Ensure folders have descriptive names
- Add folder descriptions in setup
- Process more files to build patterns

### Incorrect Suggestions

- Provide feedback using accept/reject
- Check folder descriptions are accurate
- Consider adjusting strategy priorities

### Performance Issues

- Limit batch size to 50 files
- Clear old patterns periodically
- Rebuild embeddings if needed

## Future Enhancements

- Custom strategy templates
- Rule-based automation
- Conflict resolution UI
- Organization history tracking
- Bulk undo/redo support

## Support

For issues or questions about the organization suggestion system, please refer to the main StratoSort documentation or create an issue on GitHub.
