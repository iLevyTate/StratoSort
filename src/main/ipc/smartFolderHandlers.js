const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const { IPC_CHANNELS } = require('../../shared/constants');
const { getOllamaModel } = require('../ollamaUtils');

let customFolders = [];
function getSmartFolders() { return customFolders; }
function setSmartFolders(folders){ customFolders = folders; }

function setupSmartFolderHandlers(ipcMain) {
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET, async () => {
  console.log('[SMART-FOLDERS] Getting Smart Folders for UI:', customFolders.length);
  
  // Check physical existence of each folder
  const foldersWithStatus = await Promise.all(
    customFolders.map(async (folder) => {
      try {
        const stats = await fs.stat(folder.path);
        return {
          ...folder,
          physicallyExists: stats.isDirectory()
        };
      } catch (error) {
        return {
          ...folder,
          physicallyExists: false
        };
      }
    })
  );
  
  return foldersWithStatus;
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.GET_CUSTOM, async () => {
  console.log('[SMART-FOLDERS] Getting Custom Folders for UI:', customFolders.length);
  return customFolders;
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.SAVE, async (event, folders) => {
  try {
    // Validate input
    if (!Array.isArray(folders)) {
      return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    
    try {
      customFolders = folders;
      await saveCustomFolders(folders);
      console.log('[SMART-FOLDERS] Saved Smart Folders:', folders.length);
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    console.error('[ERROR] Failed to save smart folders:', error);
    return { success: false, error: error.message, errorCode: 'SAVE_FAILED' };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.UPDATE_CUSTOM, async (event, folders) => {
  try {
    // Validate input
    if (!Array.isArray(folders)) {
      return { success: false, error: 'Folders must be an array', errorCode: 'INVALID_INPUT' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    
    try {
      customFolders = folders;
      await saveCustomFolders(folders);
      console.log('[SMART-FOLDERS] Updated Custom Folders:', folders.length);
      return { success: true, folders: customFolders };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    console.error('[ERROR] Failed to update custom folders:', error);
    return { success: false, error: error.message, errorCode: 'UPDATE_FAILED' };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.EDIT, async (event, folderId, updatedFolder) => {
  try {
    // Enhanced validation
    if (!folderId || typeof folderId !== 'string') {
      return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
    }

    if (!updatedFolder || typeof updatedFolder !== 'object') {
      return { success: false, error: 'Valid folder data is required', errorCode: 'INVALID_FOLDER_DATA' };
    }

    const folderIndex = customFolders.findIndex(f => f.id === folderId);
    if (folderIndex === -1) {
      return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
    }

    // Validate folder name if provided
    if (updatedFolder.name) {
      const illegalChars = /[<>:"|?*\x00-\x1f]/g;
      if (illegalChars.test(updatedFolder.name)) {
        return { 
          success: false, 
          error: 'Folder name contains invalid characters. Please avoid: < > : " | ? *',
          errorCode: 'INVALID_FOLDER_NAME_CHARS'
        };
      }

      // Check for duplicate names (excluding current folder)
      const existingFolder = customFolders.find(f => 
        f.id !== folderId && f.name.toLowerCase() === updatedFolder.name.trim().toLowerCase()
      );

      if (existingFolder) {
        return { 
          success: false, 
          error: `A smart folder with name "${updatedFolder.name}" already exists`,
          errorCode: 'FOLDER_NAME_EXISTS'
        };
      }
    }

    // Validate path if provided
    if (updatedFolder.path) {
      try {
        const normalizedPath = path.resolve(updatedFolder.path.trim());
        const parentDir = path.dirname(normalizedPath);
        
        // Check parent directory exists
        const parentStats = await fs.stat(parentDir);
        if (!parentStats.isDirectory()) {
          return { 
            success: false, 
            error: `Parent directory "${parentDir}" is not a directory`,
            errorCode: 'PARENT_NOT_DIRECTORY'
          };
        }
        
        updatedFolder.path = normalizedPath;
      } catch (pathError) {
        return { 
          success: false, 
          error: `Invalid path: ${pathError.message}`,
          errorCode: 'INVALID_PATH'
        };
      }
    }
    
    // Backup current state for rollback
    const originalFolder = { ...customFolders[folderIndex] };
    
    // If the path has changed, attempt to rename the directory on disk
    if (updatedFolder.path && updatedFolder.path !== originalFolder.path) {
      try {
        const oldPath = originalFolder.path;
        const newPath = updatedFolder.path;

        // Ensure old directory exists
        const oldStats = await fs.stat(oldPath);
        if (!oldStats.isDirectory()) {
          return { success: false, error: 'Original path is not a directory', errorCode: 'ORIGINAL_NOT_DIRECTORY' };
        }

        // Attempt rename
        await fs.rename(oldPath, newPath);
        console.log(`[SMART-FOLDERS] Renamed directory \"${oldPath}\" -> \"${newPath}\"`);
      } catch (renameErr) {
        console.error('[SMART-FOLDERS] Directory rename failed:', renameErr.message);
        return { success: false, error: 'Failed to rename directory', errorCode: 'RENAME_FAILED', details: renameErr.message };
      }
    }
    
    try {
      // Update folder with validation
      customFolders[folderIndex] = { 
        ...customFolders[folderIndex], 
        ...updatedFolder,
        updatedAt: new Date().toISOString()
      };
      
      await saveCustomFolders(customFolders);
      console.log('[SMART-FOLDERS] Edited Smart Folder:', folderId);
      
      return { 
        success: true, 
        folder: customFolders[folderIndex],
        message: 'Smart folder updated successfully'
      };
    } catch (saveError) {
      // Rollback on failure
      customFolders[folderIndex] = originalFolder;
      throw saveError;
    }
  } catch (error) {
    console.error('[ERROR] Failed to edit smart folder:', error);
    return { 
      success: false, 
      error: error.message,
      errorCode: 'EDIT_FAILED'
    };
  }
});

ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.DELETE, async (event, folderId) => {
  try {
    // Enhanced validation
    if (!folderId || typeof folderId !== 'string') {
      return { success: false, error: 'Valid folder ID is required', errorCode: 'INVALID_FOLDER_ID' };
    }

    const folderIndex = customFolders.findIndex(f => f.id === folderId);
    if (folderIndex === -1) {
      return { success: false, error: 'Folder not found', errorCode: 'FOLDER_NOT_FOUND' };
    }

    // Backup current state for rollback
    const originalFolders = [...customFolders];
    const deletedFolder = customFolders[folderIndex];
    
    try {
      customFolders = customFolders.filter(f => f.id !== folderId);
      await saveCustomFolders(customFolders);
      console.log('[SMART-FOLDERS] Deleted Smart Folder:', folderId);
      
      let directoryRemoved = false;
      let removalError = null;
      try {
        const stats = await fs.stat(deletedFolder.path);
        if (stats.isDirectory()) {
          // Attempt to remove only if empty to avoid accidental data loss
          const contents = await fs.readdir(deletedFolder.path);
          if (contents.length === 0) {
            await fs.rmdir(deletedFolder.path);
            directoryRemoved = true;
          }
        }
      } catch (dirErr) {
        // If directory missing, that's fine; otherwise record error
        if (dirErr.code !== 'ENOENT') {
          console.warn('[SMART-FOLDERS] Directory removal failed:', dirErr.message);
          removalError = dirErr.message;
        }
      }

      return { 
        success: true, 
        folders: customFolders,
        deletedFolder,
        directoryRemoved,
        removalError,
        message: `Smart folder \"${deletedFolder.name}\" deleted successfully` + (directoryRemoved ? ' and its empty directory was removed.' : '')
      };
    } catch (saveError) {
      // Rollback on failure
      customFolders = originalFolders;
      throw saveError;
    }
  } catch (error) {
    console.error('[ERROR] Failed to delete smart folder:', error);
    return { 
      success: false, 
      error: error.message,
      errorCode: 'DELETE_FAILED'
    };
  }
});

// NOTE: Old get-analysis-statistics handler removed - using IPC_CHANNELS.ANALYSIS_HISTORY.GET_STATISTICS instead

// NOTE: Old duplicate handlers removed - using IPC_CHANNELS constants instead

// Folder scanning
ipcMain.handle(IPC_CHANNELS.SMART_FOLDERS.ADD, async (event, folder) => {
  try {
    // Enhanced validation
    if (!folder || typeof folder !== 'object') {
      return { 
        success: false, 
        error: 'Invalid folder data provided',
        errorCode: 'INVALID_FOLDER_DATA'
      };
    }

    if (!folder.name || typeof folder.name !== 'string' || !folder.name.trim()) {
      return { 
        success: false, 
        error: 'Folder name is required and must be a non-empty string',
        errorCode: 'INVALID_FOLDER_NAME'
      };
    }

    if (!folder.path || typeof folder.path !== 'string' || !folder.path.trim()) {
      return { 
        success: false, 
        error: 'Folder path is required and must be a non-empty string',
        errorCode: 'INVALID_FOLDER_PATH'
      };
    }

    // Validate folder name for illegal characters
    const illegalChars = /[<>:"|?*\x00-\x1f]/g;
    if (illegalChars.test(folder.name)) {
      return { 
        success: false, 
        error: 'Folder name contains invalid characters. Please avoid: < > : " | ? *',
        errorCode: 'INVALID_FOLDER_NAME_CHARS'
      };
    }

    // Check for duplicate names or paths
    const existingFolder = customFolders.find(f => 
      f.name.toLowerCase() === folder.name.trim().toLowerCase() ||
      path.resolve(f.path) === path.resolve(folder.path.trim())
    );

    if (existingFolder) {
      return { 
        success: false, 
        error: `A smart folder with name "${existingFolder.name}" or path "${existingFolder.path}" already exists`,
        errorCode: 'FOLDER_ALREADY_EXISTS'
      };
    }

    // Normalize path for cross-platform compatibility
    const normalizedPath = path.resolve(folder.path.trim());
    
    // Validate parent directory exists and is writable
    const parentDir = path.dirname(normalizedPath);
    try {
      const parentStats = await fs.stat(parentDir);
      if (!parentStats.isDirectory()) {
        return { 
          success: false, 
          error: `Parent directory "${parentDir}" is not a directory`,
          errorCode: 'PARENT_NOT_DIRECTORY'
        };
      }
      
      // Test write permissions by attempting to create a temp file
      const tempFile = path.join(parentDir, `.stratotest_${Date.now()}`);
      try {
        await fs.writeFile(tempFile, 'test');
        await fs.unlink(tempFile);
      } catch (writeError) {
        return { 
          success: false, 
          error: `No write permission in parent directory "${parentDir}"`,
          errorCode: 'PARENT_NOT_WRITABLE'
        };
      }
    } catch (parentError) {
      return { 
        success: false, 
        error: `Parent directory "${parentDir}" does not exist or is not accessible`,
        errorCode: 'PARENT_NOT_ACCESSIBLE'
      };
    }

    // Enhanced LLM analysis for smart folder optimization
    let llmEnhancedData = {};
    try {
      // Use LLM to enhance folder metadata and suggest improvements
      const llmAnalysis = await enhanceSmartFolderWithLLM(folder, customFolders);
      if (llmAnalysis && !llmAnalysis.error) {
        llmEnhancedData = llmAnalysis;
      }
    } catch (llmError) {
      console.warn('[SMART-FOLDERS] LLM enhancement failed, continuing with basic data:', llmError.message);
    }
    
    const newFolder = {
      id: Date.now().toString(),
      name: folder.name.trim(),
      path: normalizedPath,
      description: llmEnhancedData.enhancedDescription || folder.description?.trim() || `Smart folder for ${folder.name.trim()}`,
      keywords: llmEnhancedData.suggestedKeywords || [],
      category: llmEnhancedData.suggestedCategory || 'general',
      isDefault: folder.isDefault || false,
      createdAt: new Date().toISOString(),
      // LLM-enhanced metadata
      semanticTags: llmEnhancedData.semanticTags || [],
      relatedFolders: llmEnhancedData.relatedFolders || [],
      confidenceScore: llmEnhancedData.confidence || 0.8,
      usageCount: 0,
      lastUsed: null
    };
    
    // Create the actual directory with enhanced error handling
    let directoryCreated = false;
    let directoryExisted = false;
    
    // First, check if directory already exists
    try {
      const existingStats = await fs.stat(normalizedPath);
      if (existingStats.isDirectory()) {
        console.log('[SMART-FOLDERS] Directory already exists:', normalizedPath);
        directoryExisted = true;
      } else {
        return { 
          success: false, 
          error: 'Path exists but is not a directory',
          errorCode: 'PATH_NOT_DIRECTORY'
        };
      }
    } catch (statError) {
      // Directory doesn't exist, proceed with creation
      if (statError.code === 'ENOENT') {
        try {
          await fs.mkdir(normalizedPath, { recursive: true });
          console.log('[SMART-FOLDERS] Created directory:', normalizedPath);
          directoryCreated = true;
          
          // Verify directory was created and is accessible
          const stats = await fs.stat(normalizedPath);
          if (!stats.isDirectory()) {
            throw new Error('Created path is not a directory');
          }
        } catch (dirError) {
          console.error('[SMART-FOLDERS] Directory creation failed:', dirError.message);
          return { 
            success: false, 
            error: 'Failed to create directory',
            errorCode: 'DIRECTORY_CREATION_FAILED',
            details: dirError.message
          };
        }
      } else {
        return { 
          success: false, 
          error: 'Failed to access directory path',
          errorCode: 'PATH_ACCESS_FAILED',
          details: statError.message
        };
      }
    }

    // Add to configuration with rollback capability
    const originalFolders = [...customFolders];
    try {
      customFolders.push(newFolder);
      await saveCustomFolders(customFolders);
      console.log('[SMART-FOLDERS] Added Smart Folder:', newFolder.id);
      
      return { 
        success: true, 
        folder: newFolder, 
        folders: customFolders,
        message: directoryCreated ? 'Smart folder created successfully' : 'Smart folder added (directory already existed)',
        directoryCreated,
        directoryExisted,
        llmEnhanced: !!llmEnhancedData.enhancedDescription
      };
    } catch (saveError) {
      // Rollback configuration
      customFolders.length = 0;
      customFolders.push(...originalFolders);
      
      // Rollback directory creation if we created it
      if (directoryCreated && !directoryExisted) {
        try {
          await fs.rmdir(normalizedPath);
          console.log('[SMART-FOLDERS] Rolled back directory creation:', normalizedPath);
        } catch (rollbackError) {
          console.error('[SMART-FOLDERS] Failed to rollback directory:', rollbackError.message);
        }
      }
      
      return { 
        success: false, 
        error: 'Failed to save configuration, changes rolled back',
        errorCode: 'CONFIG_SAVE_FAILED',
        details: saveError.message
      };
    }
  } catch (error) {
    console.error('[ERROR] Failed to add smart folder:', error);
    return { 
      success: false, 
      error: 'Failed to add smart folder',
      errorCode: 'ADD_FOLDER_FAILED',
      details: error.message
    };
  }
});

// Enhanced LLM integration for smart folder optimization
async function enhanceSmartFolderWithLLM(folderData, existingFolders) {
  try {
    console.log('[LLM-ENHANCEMENT] Analyzing smart folder for optimization:', folderData.name);
    
    // Build context about existing folders
    const existingFolderContext = existingFolders.map(f => ({
      name: f.name,
      description: f.description,
      keywords: f.keywords || [],
      category: f.category || 'general'
    }));

    const prompt = `You are an expert file organization system. Analyze this new smart folder and provide enhancements based on existing folder structure.

NEW FOLDER:
Name: "${folderData.name}"
Path: "${folderData.path}"
Description: "${folderData.description || ''}"

EXISTING FOLDERS:
${existingFolderContext.map(f => `- ${f.name}: ${f.description} (Category: ${f.category})`).join('\n')}

Please provide a JSON response with the following enhancements:
{
  "improvedDescription": "enhanced description",
  "suggestedKeywords": ["keyword1", "keyword2"],
  "organizationTips": "tips for better organization",
  "confidence": 0.8
}`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getOllamaModel(),
        prompt: prompt,
        stream: false,
        format: 'json',
        options: { 
          temperature: 0.3, 
          num_predict: 500 
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const enhancement = JSON.parse(data.response);
      
      // Validate the response structure
      if (enhancement && typeof enhancement === 'object') {
        console.log('[LLM-ENHANCEMENT] Successfully enhanced smart folder:', enhancement.reasoning);
        return enhancement;
      }
    }
    
    return { error: 'Invalid LLM response format' };
  } catch (error) {
    console.error('[LLM-ENHANCEMENT] Failed to enhance smart folder:', error.message);
    return { error: error.message };
  }
}
}

module.exports = { setupSmartFolderHandlers, getSmartFolders, setSmartFolders };
