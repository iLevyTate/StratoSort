import React, { createContext, useReducer, useEffect, useCallback, useContext } from "react";
const { PHASES, PHASE_TRANSITIONS, PHASE_METADATA } = require("../../shared/constants");

function phaseReducer(state, action) {
  switch (action.type) {
    case 'ADVANCE_PHASE':
      const { targetPhase, data = {} } = action.payload;
      const allowedTransitions = PHASE_TRANSITIONS[state.currentPhase] || [];
      
      // Allow self-transitions (staying in the same phase) or valid transitions
      if (targetPhase !== state.currentPhase && !allowedTransitions.includes(targetPhase)) {
        console.warn(`Invalid transition from ${state.currentPhase} to ${targetPhase}`);
        return state;
      }

      return {
        ...state,
        currentPhase: targetPhase,
        phaseData: { ...state.phaseData, ...data }
      };

    case 'SET_PHASE_DATA':
      return {
        ...state,
        phaseData: { ...state.phaseData, [action.payload.key]: action.payload.value }
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.isLoading };

    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };

    case 'RESTORE_STATE':
      return {
        ...state,
        currentPhase: action.payload.currentPhase,
        phaseData: action.payload.phaseData
      };

    case 'RESET_WORKFLOW':
      return {
        ...state,
        currentPhase: PHASES.WELCOME,
        phaseData: {
          smartFolders: [],
          selectedFiles: [],
          analysisResults: [],
          organizedFiles: []
        }
      };

    default:
      return state;
  }
}

const PhaseContext = createContext(null);

function PhaseProvider({ children }) {
  const [state, dispatch] = useReducer(phaseReducer, {
    currentPhase: PHASES.WELCOME,
    phaseData: {
      smartFolders: [],
      selectedFiles: [],
      analysisResults: [],
      organizedFiles: []
    },
    isLoading: false,
    showSettings: false
  });

  // Load saved workflow state on mount (using localStorage like vanilla HTML)
  useEffect(() => {
    const loadWorkflowState = () => {
      try {
        const savedState = localStorage.getItem('stratosort_workflow_state');
        if (savedState) {
          const parsed = JSON.parse(savedState);
          const age = Date.now() - parsed.timestamp;
          
          // Only restore if less than 1 hour old (allow COMPLETE phase restoration now)
          if (age < 3600000) {
            dispatch({ type: 'RESTORE_STATE', payload: parsed });
          }
        }
      } catch (error) {
        console.error('Failed to load workflow state:', error);
      }
    };

    loadWorkflowState();
  }, []);

  // Save workflow state when it changes (using localStorage like vanilla HTML)
  useEffect(() => {
    const saveWorkflowState = () => {
      try {
        // Don't save WELCOME phase, but DO save COMPLETE phase for navigation back
        if (state.currentPhase !== PHASES.WELCOME) {
          const workflowState = {
            currentPhase: state.currentPhase,
            phaseData: state.phaseData,
            timestamp: Date.now()
          };
          localStorage.setItem('stratosort_workflow_state', JSON.stringify(workflowState));
        }
      } catch (error) {
        console.error('Failed to save workflow state:', error);
      }
    };

    // Debounce saves to avoid too frequent writes
    const timeoutId = setTimeout(saveWorkflowState, 1000);
    return () => clearTimeout(timeoutId);
  }, [state.currentPhase, state.phaseData]);

  const actions = {
    advancePhase: useCallback((targetPhase, data) => {
      dispatch({ type: 'ADVANCE_PHASE', payload: { targetPhase, data } });
    }, []),
    
    setPhaseData: useCallback((key, value) => {
      dispatch({ type: 'SET_PHASE_DATA', payload: { key, value } });
    }, []),
    
    setLoading: useCallback((isLoading) => {
      dispatch({ type: 'SET_LOADING', payload: { isLoading } });
    }, []),

    toggleSettings: useCallback(() => {
      dispatch({ type: 'TOGGLE_SETTINGS' });
    }, []),

    resetWorkflow: useCallback(() => {
      try {
        localStorage.removeItem('stratosort_workflow_state');
        dispatch({ type: 'RESET_WORKFLOW' });
      } catch (error) {
        console.error('Failed to reset workflow:', error);
      }
    }, [])
  };

  return (
    <PhaseContext.Provider value={{ ...state, actions, getCurrentMetadata: () => PHASE_METADATA[state.currentPhase] }}>
      {children}
    </PhaseContext.Provider>
  );
}

function usePhase() {
  const context = useContext(PhaseContext);
  if (!context) throw new Error('usePhase must be used within a PhaseProvider');
  return context;
}

export { PhaseProvider, usePhase, PhaseContext };
