import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { NotificationProvider } from '../contexts/NotificationContext';
import { PhaseProvider } from '../contexts/PhaseContext';
import { UndoRedoProvider } from './UndoRedoSystem';

const theme = createTheme();

function AppProviders({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <UndoRedoProvider>
          <PhaseProvider>{children}</PhaseProvider>
        </UndoRedoProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
