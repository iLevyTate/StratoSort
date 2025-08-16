import { useEffect } from 'react';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
} from '../../shared/constants';

export function useKeyboardShortcuts() {
  const { actions, currentPhase, showSettings } = usePhase();
  const { addNotification } = useNotification();

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl/Cmd + Z for Undo
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        try {
          window.electronAPI?.undoRedo?.undo?.();
        } catch (error) {
          console.error('Undo shortcut failed:', error);
        }
      }

      // Ctrl/Cmd + Shift + Z for Redo (also support Ctrl+Y on Windows)
      if (
        (event.ctrlKey || event.metaKey) &&
        ((event.key.toLowerCase() === 'z' && event.shiftKey) ||
          event.key.toLowerCase() === 'y')
      ) {
        event.preventDefault();
        try {
          window.electronAPI?.undoRedo?.redo?.();
        } catch (error) {
          console.error('Redo shortcut failed:', error);
        }
      }

      // Ctrl/Cmd + , for Settings
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        actions.toggleSettings();
      }

      // Escape to close settings if open
      if (event.key === 'Escape' && showSettings) {
        actions.toggleSettings();
      }

      // Alt + Arrow keys for phase navigation
      if (event.altKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex > 0) {
            const previousPhase = phases[currentIndex - 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(previousPhase)) {
              actions.advancePhase(previousPhase);
              addNotification(
                `Navigated to ${PHASE_METADATA[previousPhase].title}`,
                'info',
                2000,
              );
            }
          }
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          const phases = Object.values(PHASES);
          const currentIndex = phases.indexOf(currentPhase);
          if (currentIndex < phases.length - 1) {
            const nextPhase = phases[currentIndex + 1];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            if (allowedTransitions.includes(nextPhase)) {
              actions.advancePhase(nextPhase);
              addNotification(
                `Navigated to ${PHASE_METADATA[nextPhase].title}`,
                'info',
                2000,
              );
            }
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actions, currentPhase, addNotification, showSettings]);
}
