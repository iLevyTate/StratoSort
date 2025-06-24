import React, { useState, useCallback } from 'react';
import { useErrorHandler } from '../utils/ErrorHandling';

/**
 * Custom hook for managing file analysis state and operations
 * Extracted from DiscoverPhase to reduce component complexity
 */
export function useFileAnalysis() {
  const { handleError, handleWarning } = useErrorHandler();
  const [analysisResults, setAnalysisResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysisFile, setCurrentAnalysisFile] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
  const [fileStates, setFileStates] = useState({});

  // Update file state helper with error recovery
  const updateFileState = useCallback((filePath, state, metadata = {}) => {
    try {
      setFileStates((prev) => {
        // Validate previous state
        if (!prev || typeof prev !== 'object') {
          handleWarning('Invalid fileStates detected, resetting...', 'File State Update', false);
          prev = {};
        }
        
        let newStates = { ...prev };
        
        // Cleanup old entries (keep only last 100 entries to prevent memory issues)
        const entries = Object.entries(newStates);
        if (entries.length > 100) {
          const sortedEntries = entries.sort((a, b) => 
            new Date(b[1].timestamp) - new Date(a[1].timestamp)
          );
          const keepEntries = sortedEntries.slice(0, 100);
          newStates = Object.fromEntries(keepEntries);
        }
        
        newStates[filePath] = {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        };
        
        return newStates;
      });
    } catch (error) {
      handleError(error, 'File State Update', false);
      // Reset file states if corrupted
      setFileStates({
        [filePath]: {
          state,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      });
    }
  }, [handleError, handleWarning]);

  // Get current file state
  const getFileState = useCallback((filePath) => {
    return fileStates[filePath]?.state || 'pending';
  }, [fileStates]);

  // Get file state display info
  const getFileStateDisplay = useCallback((filePath, hasAnalysis) => {
    const state = getFileState(filePath);
    
    if (state === 'analyzing') {
      return { icon: '🔄', label: 'Analyzing...', color: 'text-blue-600', spinning: true };
    } else if (state === 'error') {
      return { icon: '❌', label: 'Error', color: 'text-red-600', spinning: false };
    } else if (hasAnalysis && state === 'ready') {
      return { icon: '✅', label: 'Ready', color: 'text-green-600', spinning: false };
    } else if (state === 'pending') {
      return { icon: '⏳', label: 'Pending', color: 'text-yellow-600', spinning: false };
    } else {
      return { icon: '❌', label: 'Failed', color: 'text-red-600', spinning: false };
    }
  }, [getFileState]);

  // Analyze files function
  const analyzeFiles = useCallback(async (files) => {
    if (!files || files.length === 0) {
      handleWarning('No files provided for analysis', 'File Analysis', false);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ current: 0, total: files.length });
    
    const newResults = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentAnalysisFile(file.name || file.path);
        setAnalysisProgress({ current: i + 1, total: files.length });
        
        // Store analysis start time
        const analysisStartTime = Date.now();
        
        // Update file state to analyzing
        updateFileState(file.path, 'analyzing');
        
        try {
          // Call the actual analysis function
          const analysisPromise = window.electronAPI.files.analyze(file.path);
          
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timeout')), 60000); // Reduced from 5 minutes to 1 minute
          });
          
          const result = await Promise.race([analysisPromise, timeoutPromise]);
          
          if (result && !result.error) {
            // Format the analysis result to match expected structure
            const analysisResult = {
              suggestedName: result.subject || file.name,
              suggestedCategory: result.category || 'Documents',
              confidence: Math.round((result.confidence || 0) * 100),
              keywords: result.tags || [],
              summary: result.summary || 'File analyzed successfully'
            };
            
            newResults.push({
              file,
              analysis: analysisResult,
              timestamp: new Date().toISOString()
            });
            
            // Calculate accurate processing time
            const processingTime = Date.now() - analysisStartTime;
            
            // Update file state to ready
            updateFileState(file.path, 'ready', { 
              analysis: analysisResult,
              processingTime
            });
          } else {
            handleWarning(`No analysis result for file: ${file.path}`, 'File Analysis', false);
            updateFileState(file.path, 'error', { error: result?.error || 'No analysis result' });
          }
        } catch (error) {
          handleError(error, `Analysis for file ${file.path}`, false);
          updateFileState(file.path, 'error', { error: error.message });
        }
      }
      
      // Update analysis results
      setAnalysisResults((prev) => {
        // Merge with existing results, avoiding duplicates
        const existingPaths = new Set(prev.map((r) => r.file.path));
        const uniqueNewResults = newResults.filter((r) => !existingPaths.has(r.file.path));
        return [...prev, ...uniqueNewResults];
      });
      
    } catch (error) {
      handleError(error, 'Batch Analysis');
    } finally {
      setIsAnalyzing(false);
      setCurrentAnalysisFile('');
      setAnalysisProgress({ current: 0, total: 0 });
    }
  }, [updateFileState, handleError, handleWarning]);

  // Reset analysis state
  const resetAnalysis = useCallback(() => {
    setAnalysisResults([]);
    setFileStates({});
    setIsAnalyzing(false);
    setCurrentAnalysisFile('');
    setAnalysisProgress({ current: 0, total: 0 });
  }, []);

  // Load persisted analysis data
  const loadPersistedAnalysis = useCallback((persistedData) => {
    if (persistedData.analysisResults?.length > 0) {
      setAnalysisResults(persistedData.analysisResults);
      setFileStates(persistedData.fileStates || {});
    }
  }, []);

  return {
    // State
    analysisResults,
    isAnalyzing,
    currentAnalysisFile,
    analysisProgress,
    fileStates,
    
    // Actions
    analyzeFiles,
    updateFileState,
    getFileState,
    getFileStateDisplay,
    resetAnalysis,
    loadPersistedAnalysis,
    
    // Setters (for external control)
    setAnalysisResults,
    setFileStates
  };
} 