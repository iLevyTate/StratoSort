import { useEffect } from "react";
import { usePhase } from "../contexts/PhaseContext";
import { useUndoRedo } from "../components/UndoRedoSystem";
import { useNotification } from "../contexts/NotificationContext";
const { PHASES, PHASE_TRANSITIONS, PHASE_METADATA } = require("../../shared/constants");

function useKeyboardShortcuts() {
  const { actions, currentPhase } = usePhase();
  const { executeAction } = useUndoRedo();
  const { addNotification } = useNotification();

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Z for Undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (typeof executeAction === 'function') {
          // executeAction is the function itself, not an object with undo/redo methods
          // Use the actual undo/redo handlers from the component
          try {
            // This would need to be handled by the component's undo handler
            addNotification('Use Ctrl+Z in organize phase for undo', 'info', 2000);
          } catch (error) {
            console.error('Undo shortcut failed:', error);
          }
        }
      }
      
      // Ctrl/Cmd + Shift + Z for Redo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (typeof executeAction === 'function') {
          try {
            // This would need to be handled by the component's redo handler
            addNotification('Use Ctrl+Shift+Z in organize phase for redo', 'info', 2000);
          } catch (error) {
            console.error('Redo shortcut failed:', error);
          }
        }
      }
      
      // Ctrl/Cmd + , for Settings
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        actions.toggleSettings();
      }
      
      // Escape to close modals
      if (event.key === 'Escape') {
        actions.toggleSettings(); // Close settings if open
      }
      
      // Arrow keys for phase navigation
      if (event.altKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          // Navigate to previous phase
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex > 0) {
            const previousPhase = phases[currentIndex - 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(previousPhase)) {
              actions.advancePhase(previousPhase);
              addNotification(`Navigated to ${PHASE_METADATA[previousPhase].title}`, 'info', 2000);
            }
          }
        }
        
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          // Navigate to next phase
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex < phases.length - 1) {
            const nextPhase = phases[currentIndex + 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(nextPhase)) {
              actions.advancePhase(nextPhase);
              addNotification(`Navigated to ${PHASE_METADATA[nextPhase].title}`, 'info', 2000);
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions, currentPhase, executeAction, addNotification]);
}
export default useKeyboardShortcuts;
