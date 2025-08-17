import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
} from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import UpdateIndicator from './UpdateIndicator';

function NavigationBar() {
  const { currentPhase, actions } = usePhase();

  const handlePhaseChange = (newPhase) => {
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
    if (allowedTransitions.includes(newPhase) || newPhase === currentPhase) {
      actions.advancePhase(newPhase);
    }
  };

  const phaseOrder = [
    PHASES.WELCOME,
    PHASES.SETUP,
    PHASES.DISCOVER,
    PHASES.ORGANIZE,
    PHASES.COMPLETE,
  ];

  const getTwoWordLabel = (title, navLabel) => {
    if (navLabel && typeof navLabel === 'string') return navLabel;
    if (!title) return '';
    const filtered = title
      .replace(/&/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !/^to|and|of|the|for|a|an$/i.test(w));
    return filtered.slice(0, 2).join(' ');
  };

  return (
    <AppBar position="static" elevation={1} sx={{ WebkitAppRegion: 'drag' }}>
      <Toolbar>
        <Typography variant="h6" sx={{ mr: 3 }}>
          🚀 StratoSort
        </Typography>
        <Tabs
          value={currentPhase}
          onChange={(e, phase) => handlePhaseChange(phase)}
          textColor="inherit"
          indicatorColor="secondary"
          sx={{ WebkitAppRegion: 'no-drag' }}
        >
          {phaseOrder.map((phase) => {
            const metadata = PHASE_METADATA[phase];
            const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
            const canNavigate =
              allowedTransitions.includes(phase) || phase === currentPhase;
            const label = getTwoWordLabel(metadata.title, metadata.navLabel);
            return (
              <Tab
                key={phase}
                label={label}
                value={phase}
                disabled={!canNavigate}
                sx={{ WebkitAppRegion: 'no-drag' }}
              />
            );
          })}
        </Tabs>
        <Box
          sx={{
            ml: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            WebkitAppRegion: 'no-drag',
          }}
        >
          <UpdateIndicator />
          <IconButton
            edge="end"
            color="inherit"
            onClick={actions.toggleSettings}
          >
            <SettingsIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default NavigationBar;
