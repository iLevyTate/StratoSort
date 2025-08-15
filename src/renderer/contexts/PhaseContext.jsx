import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import { PHASES, PHASE_TRANSITIONS, PHASE_METADATA, UI_WORKFLOW } from '../../shared/constants';
import { logger } from '../../shared/logger';

function phaseReducer(state, action) {
  switch (action.type) {
    case 'ADVANCE_PHASE': {
      const { targetPhase, data = {} } = action.payload;
      const allowedTransitions = PHASE_TRANSITIONS[state.currentPhase] || [];
      if (targetPhase !== state.currentPhase && !allowedTransitions.includes(targetPhase)) {
        logger.warn(`Invalid transition from ${state.currentPhase} to ${targetPhase}`);
        return state;
      }
      return { ...state, currentPhase: targetPhase, phaseData: { ...state.phaseData, ...data } };
    }
    case 'SET_PHASE_DATA':
      return { ...state, phaseData: { ...state.phaseData, [action.payload.key]: action.payload.value } };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload.isLoading };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'RESTORE_STATE':
      return { ...state, currentPhase: action.payload.currentPhase, phaseData: action.payload.phaseData };
    case 'RESET_WORKFLOW':
      return { ...state, currentPhase: PHASES.WELCOME, phaseData: { smartFolders: [], selectedFiles: [], analysisResults: [], organizedFiles: [] } };
    default:
      return state;
  }
}

const PhaseContext = createContext(null);

export function PhaseProvider({ children }) {
  const [state, dispatch] = useReducer(phaseReducer, {
    currentPhase: PHASES.WELCOME,
    phaseData: { smartFolders: [], selectedFiles: [], analysisResults: [], organizedFiles: [] },
    isLoading: false,
    showSettings: false
  });

  useEffect(() => {
    try {
      const savedState = localStorage.getItem('stratosort_workflow_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        const age = Date.now() - parsed.timestamp;
        if (age < UI_WORKFLOW.RESTORE_MAX_AGE_MS) {
          dispatch({ type: 'RESTORE_STATE', payload: parsed });
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow state:', error);
    }
  }, []);

  useEffect(() => {
    const save = () => {
      try {
        if (state.currentPhase !== PHASES.WELCOME) {
          const workflowState = { currentPhase: state.currentPhase, phaseData: state.phaseData, timestamp: Date.now() };
          localStorage.setItem('stratosort_workflow_state', JSON.stringify(workflowState));
        }
      } catch (error) {
        logger.error('Failed to save workflow state:', error);
      }
    };
    const timeoutId = setTimeout(save, UI_WORKFLOW.SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [state.currentPhase, state.phaseData]);

  const actions = {
    advancePhase: useCallback((targetPhase, data) => dispatch({ type: 'ADVANCE_PHASE', payload: { targetPhase, data } }), []),
    setPhaseData: useCallback((key, value) => dispatch({ type: 'SET_PHASE_DATA', payload: { key, value } }), []),
    setLoading: useCallback((isLoading) => dispatch({ type: 'SET_LOADING', payload: { isLoading } }), []),
    toggleSettings: useCallback(() => dispatch({ type: 'TOGGLE_SETTINGS' }), []),
    resetWorkflow: useCallback(() => { try { localStorage.removeItem('stratosort_workflow_state'); } catch {} dispatch({ type: 'RESET_WORKFLOW' }); }, [])
  };

  return (
    <PhaseContext.Provider value={{ ...state, actions, getCurrentMetadata: () => PHASE_METADATA[state.currentPhase] }}>
      {children}
    </PhaseContext.Provider>
  );
}

export function usePhase() {
  const context = useContext(PhaseContext);
  if (!context) throw new Error('usePhase must be used within a PhaseProvider');
  return context;
}


