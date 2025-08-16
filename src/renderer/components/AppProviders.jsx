import React from 'react';
import { NotificationProvider } from '../contexts/NotificationContext';
import { PhaseProvider } from '../contexts/PhaseContext';
import { UndoRedoProvider } from './UndoRedoSystem';

function AppProviders({ children }) {
  return (
    <NotificationProvider>
      <UndoRedoProvider>
        <PhaseProvider>{children}</PhaseProvider>
      </UndoRedoProvider>
    </NotificationProvider>
  );
}

export default AppProviders;
