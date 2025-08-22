import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useMemo,
} from 'react';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
  UI_WORKFLOW,
} from '../../shared/constants';

function phaseReducer(state, action) {
  switch (action.type) {
    case 'ADVANCE_PHASE': {
      const { targetPhase, data = {} } = action.payload;
      const allowedTransitions = PHASE_TRANSITIONS[state.currentPhase] || [];
      if (
        targetPhase !== state.currentPhase &&
        !allowedTransitions.includes(targetPhase)
      ) {
        console.warn(
          `Invalid transition from ${state.currentPhase} to ${targetPhase}`,
        );
        return state;
      }
      return {
        ...state,
        currentPhase: targetPhase,
        phaseData: { ...state.phaseData, ...data },
      };
    }
    case 'SET_PHASE_DATA':
      return {
        ...state,
        phaseData: {
          ...state.phaseData,
          [action.payload.key]: action.payload.value,
        },
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.isLoading };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'RESTORE_STATE':
      return {
        ...state,
        currentPhase: action.payload.currentPhase,
        phaseData: action.payload.phaseData,
      };
    case 'RESET_WORKFLOW':
      return {
        ...state,
        currentPhase: PHASES.WELCOME,
        phaseData: {
          smartFolders: [],
          selectedFiles: [],
          analysisResults: [],
          organizedFiles: [],
        },
      };
    default:
      return state;
  }
}

const PhaseContext = createContext(null);

export function PhaseProvider({ children }) {
  const [state, dispatch] = useReducer(phaseReducer, {
    currentPhase: PHASES.WELCOME,
    phaseData: {
      smartFolders: [],
      selectedFiles: [],
      analysisResults: [],
      organizedFiles: [],
    },
    isLoading: false,
    showSettings: false,
  });

  useEffect(() => {
    try {
      const savedState = localStorage.getItem('stratosort_workflow_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        const age = Date.now() - parsed.timestamp;

        console.log('[PHASE] Found saved workflow state:', {
          phase: parsed.currentPhase,
          age: Math.round(age / 1000) + 's ago',
          selectedFiles: parsed.phaseData?.selectedFiles?.length || 0,
          analysisResults: parsed.phaseData?.analysisResults?.length || 0,
          organizedFiles: parsed.phaseData?.organizedFiles?.length || 0,
          version: parsed.version || '1.0',
        });

        if (age < UI_WORKFLOW.RESTORE_MAX_AGE_MS) {
          // Enhanced restoration with data validation
          const validatedPhaseData = {
            smartFolders: Array.isArray(parsed.phaseData?.smartFolders)
              ? parsed.phaseData.smartFolders
              : [],
            selectedFiles: Array.isArray(parsed.phaseData?.selectedFiles)
              ? parsed.phaseData.selectedFiles
              : [],
            analysisResults: Array.isArray(parsed.phaseData?.analysisResults)
              ? parsed.phaseData.analysisResults
              : [],
            organizedFiles: Array.isArray(parsed.phaseData?.organizedFiles)
              ? parsed.phaseData.organizedFiles
              : [],
            fileStates:
              parsed.phaseData?.fileStates &&
              typeof parsed.phaseData.fileStates === 'object'
                ? parsed.phaseData.fileStates
                : {},
            namingConvention:
              parsed.phaseData?.namingConvention &&
              typeof parsed.phaseData.namingConvention === 'object'
                ? parsed.phaseData.namingConvention
                : {},
            ...parsed.phaseData,
          };

          dispatch({
            type: 'RESTORE_STATE',
            payload: {
              currentPhase: parsed.currentPhase,
              phaseData: validatedPhaseData,
            },
          });

          console.log('[PHASE] Workflow state restored successfully');
        } else {
          console.log('[PHASE] Workflow state too old, not restoring');
          localStorage.removeItem('stratosort_workflow_state');
        }
      } else {
        console.log('[PHASE] No saved workflow state found');
      }
    } catch (error) {
      console.error('[PHASE] Failed to load workflow state:', error);
      // Clear corrupted state
      try {
        localStorage.removeItem('stratosort_workflow_state');
      } catch {}
    }
  }, []);

  useEffect(() => {
    const save = () => {
      try {
        if (state.currentPhase !== PHASES.WELCOME) {
          // Enhanced persistence with more comprehensive data
          const workflowState = {
            currentPhase: state.currentPhase,
            phaseData: {
              ...state.phaseData,
              // Ensure critical data is always preserved
              smartFolders: state.phaseData.smartFolders || [],
              selectedFiles: state.phaseData.selectedFiles || [],
              analysisResults: state.phaseData.analysisResults || [],
              organizedFiles: state.phaseData.organizedFiles || [],
              fileStates: state.phaseData.fileStates || {},
              namingConvention: state.phaseData.namingConvention || {},
            },
            timestamp: Date.now(),
            version: '1.1', // Version for future compatibility
          };

          localStorage.setItem(
            'stratosort_workflow_state',
            JSON.stringify(workflowState),
          );

          // Log state save for debugging persistence issues
          console.log('[PHASE] Workflow state saved:', {
            phase: state.currentPhase,
            selectedFiles: state.phaseData.selectedFiles?.length || 0,
            analysisResults: state.phaseData.analysisResults?.length || 0,
            organizedFiles: state.phaseData.organizedFiles?.length || 0,
            timestamp: new Date(workflowState.timestamp).toLocaleTimeString(),
          });
        }
      } catch (error) {
        console.error('Failed to save workflow state:', error);
      }
    };
    const timeoutId = setTimeout(save, UI_WORKFLOW.SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state.currentPhase, state.phaseData]);

  const advancePhase = useCallback(
    (targetPhase, data) => {
      console.log(
        `[PHASE] Advancing from ${state.currentPhase} to ${targetPhase}`,
      );
      dispatch({ type: 'ADVANCE_PHASE', payload: { targetPhase, data } });

      // Immediately save state when advancing phases (critical transitions)
      setTimeout(() => {
        try {
          const currentState = JSON.parse(
            localStorage.getItem('stratosort_workflow_state') || '{}',
          );
          const workflowState = {
            ...currentState,
            currentPhase: targetPhase,
            phaseData: {
              ...currentState.phaseData,
              ...data,
            },
            timestamp: Date.now(),
            version: '1.1',
          };
          localStorage.setItem(
            'stratosort_workflow_state',
            JSON.stringify(workflowState),
          );
          console.log(
            `[PHASE] Immediately saved state for phase transition to ${targetPhase}`,
          );
        } catch (error) {
          console.error(
            '[PHASE] Failed to immediately save phase transition:',
            error,
          );
        }
      }, 50); // Small delay to ensure dispatch has completed
    },
    [dispatch, state.currentPhase],
  );
  const setPhaseData = useCallback(
    (key, value) =>
      dispatch({ type: 'SET_PHASE_DATA', payload: { key, value } }),
    [dispatch],
  );
  const setLoading = useCallback(
    (isLoading) => dispatch({ type: 'SET_LOADING', payload: { isLoading } }),
    [dispatch],
  );
  const toggleSettings = useCallback(
    () => dispatch({ type: 'TOGGLE_SETTINGS' }),
    [dispatch],
  );
  const resetWorkflow = useCallback(() => {
    try {
      localStorage.removeItem('stratosort_workflow_state');
    } catch {}
    dispatch({ type: 'RESET_WORKFLOW' });
  }, [dispatch]);

  const actions = useMemo(
    () => ({
      advancePhase,
      setPhaseData,
      setLoading,
      toggleSettings,
      resetWorkflow,
    }),
    [advancePhase, setPhaseData, setLoading, toggleSettings, resetWorkflow],
  );

  // Listen for 'open-settings' event from main process
  useEffect(() => {
    const handleOpenSettings = () => {
      if (!state.showSettings) {
        toggleSettings();
      }
    };

    // Add event listener for main process settings request
    try {
      window.electronAPI?.events?.onOpenSettings?.(handleOpenSettings);
    } catch (error) {
      console.warn('Failed to register open-settings listener:', error);
    }

    return () => {
      // Cleanup if needed
    };
  }, [state.showSettings, toggleSettings]);

  return (
    <PhaseContext.Provider
      value={useMemo(() => {
        const getCurrentMetadata = () => PHASE_METADATA[state.currentPhase];
        return { ...state, actions, getCurrentMetadata };
      }, [state, actions])}
    >
      {children}
    </PhaseContext.Provider>
  );
}

export function usePhase() {
  const context = useContext(PhaseContext);
  if (!context) throw new Error('usePhase must be used within a PhaseProvider');
  return context;
}
