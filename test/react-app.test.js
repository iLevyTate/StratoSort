const fs = require('fs');
const path = require('path');

describe('StratoSort React App', () => {
  describe('Phase System', () => {
    test('defines all required phases (via shared constants)', () => {
      const { PHASES } = require('../src/shared/constants');
      const phases = Object.values(PHASES);
      expect(phases).toEqual(
        expect.arrayContaining(['welcome', 'setup', 'discover', 'organize', 'complete'])
      );
    });

    test('defines phase transitions correctly (via shared constants)', () => {
      const { PHASES, PHASE_TRANSITIONS } = require('../src/shared/constants');
      // Sanity: every phase has a transitions entry that is an array
      Object.values(PHASES).forEach((phase) => {
        expect(Array.isArray(PHASE_TRANSITIONS[phase])).toBe(true);
      });
      // Spot check a few expected transitions of the workflow
      expect(PHASE_TRANSITIONS[PHASES.WELCOME]).toEqual(
        expect.arrayContaining([PHASES.SETUP, PHASES.DISCOVER])
      );
      expect(PHASE_TRANSITIONS[PHASES.DISCOVER]).toEqual(
        expect.arrayContaining([PHASES.ORGANIZE, PHASES.SETUP])
      );
      expect(PHASE_TRANSITIONS[PHASES.ORGANIZE]).toEqual(
        expect.arrayContaining([PHASES.COMPLETE, PHASES.DISCOVER])
      );
    });
  });

  describe('Component Structure', () => {
    test('phase component files exist', () => {
      const phaseFiles = [
        '../src/renderer/phases/WelcomePhase.jsx',
        '../src/renderer/phases/SetupPhase.jsx',
        '../src/renderer/phases/DiscoverPhase.jsx',
        '../src/renderer/phases/OrganizePhase.jsx',
        '../src/renderer/phases/CompletePhase.jsx'
      ];
      phaseFiles.forEach(rel => {
        const filePath = path.join(__dirname, rel);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    test('system components are wired', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      // These should appear in App.js wiring (providers now wrapped by AppProviders). SystemMonitoring removed per UX.
      ['AppProviders', 'NavigationBar', 'TooltipManager'].forEach((c) => {
        expect(appContent).toContain(c);
      });
      // Undo/Redo toolbar lives in its own file; ensure it exists there
      const undoContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx'),
        'utf8'
      );
      expect(undoContent).toContain('UndoRedoToolbar');
    });
  });

  describe('File Processing', () => {
    test('drag and drop functionality is implemented', () => {
      const discoverContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/phases/DiscoverPhase.jsx'),
        'utf8'
      );
      // Discover should use the hook
      expect(discoverContent).toContain('useDragAndDrop');
      // The hook should implement the handlers
      const hookContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/hooks/useDragAndDrop.js'),
        'utf8'
      );
      expect(hookContent).toContain('handleDragEnter');
      expect(hookContent).toContain('handleDragLeave');
      expect(hookContent).toContain('handleDrop');
    });

    test('file analysis supports multiple file types (via DiscoverPhase)', () => {
      const discoverContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/phases/DiscoverPhase.jsx'),
        'utf8'
      );
      expect(discoverContent).toContain('getFileType');
      expect(discoverContent).toContain('analyzeFiles');
      expect(discoverContent.toLowerCase()).toContain('pdf');
      expect(discoverContent.toLowerCase()).toContain('txt');
      expect(discoverContent.toLowerCase()).toContain('docx');
    });
  });

  describe('Undo/Redo System', () => {
    test('undo/redo system is imported and used', () => {
      // Providers are wrapped in AppProviders
      const providersContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/components/AppProviders.jsx'),
        'utf8'
      );
      expect(providersContent).toContain('UndoRedoProvider');
      expect(providersContent).toContain('NotificationProvider');
      const undoContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx'),
        'utf8'
      );
      expect(undoContent).toContain('useUndoRedo');
      expect(undoContent).toContain('UndoRedoToolbar');
    });

    test('undo/redo component file exists', () => {
      const candidates = [
        path.join(__dirname, '../src/renderer/components/UndoRedoSystem.js'),
        path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx')
      ];
      expect(candidates.some(p => fs.existsSync(p))).toBe(true);
    });
  });

  describe('Integration Testing', () => {
    test('React DOM rendering is properly configured', () => {
      const indexContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/index.js'),
        'utf8'
      );

      // Modern React entry should use createRoot and render <App />
      expect(indexContent).toContain('createRoot');
      expect(indexContent).toMatch(/root\.(render|hydrate)\(/);
      expect(indexContent).toContain('<App />');
    });
  });
});
