const fs = require('fs');
const path = require('path');

describe('StratoSort React App', () => {
  describe('Phase System', () => {
    test('defines all required phases (via shared constants)', () => {
      const { PHASES } = require('../src/shared/constants');
      const phases = Object.values(PHASES);
      expect(phases).toEqual(
        expect.arrayContaining([
          'welcome',
          'setup',
          'discover',
          'organize',
          'complete',
        ]),
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
        expect.arrayContaining([PHASES.SETUP, PHASES.DISCOVER]),
      );
      expect(PHASE_TRANSITIONS[PHASES.DISCOVER]).toEqual(
        expect.arrayContaining([PHASES.ORGANIZE, PHASES.SETUP]),
      );
      expect(PHASE_TRANSITIONS[PHASES.ORGANIZE]).toEqual(
        expect.arrayContaining([PHASES.COMPLETE, PHASES.DISCOVER]),
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
        '../src/renderer/phases/CompletePhase.jsx',
      ];
      phaseFiles.forEach((rel) => {
        const filePath = path.join(__dirname, rel);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    test('system components are wired', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.jsx'),
        'utf8',
      );
      // These should appear in App.js wiring (providers now wrapped by AppProviders). SystemMonitoring removed per UX.
      ['AppProviders', 'NavigationBar'].forEach((c) => {
        expect(appContent).toContain(c);
      });
      // Undo/Redo toolbar lives in its own file; ensure it exists there
      const undoContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx'),
        'utf8',
      );
      expect(undoContent).toContain('UndoRedoToolbar');
    });
  });

  describe('File Processing', () => {
    test('drag and drop functionality is implemented', () => {
      // Use absolute paths to avoid __dirname issues in test environment
      const projectRoot = path.resolve(__dirname, '..');
      const discoverPath = path.join(
        projectRoot,
        'src/renderer/phases/DiscoverPhase.jsx',
      );
      const hookPath = path.join(
        projectRoot,
        'src/renderer/hooks/useDragAndDrop.js',
      );

      // Check if files exist first
      expect(fs.existsSync(discoverPath)).toBe(true);
      expect(fs.existsSync(hookPath)).toBe(true);

      const discoverContent = fs.readFileSync(discoverPath, 'utf8');
      const hookContent = fs.readFileSync(hookPath, 'utf8');

      // Discover should use the hook
      expect(discoverContent).toContain('useDragAndDrop');
      // The hook should implement the handlers
      expect(hookContent).toContain('handleDragEnter');
      expect(hookContent).toContain('handleDragLeave');
      expect(hookContent).toContain('handleDrop');
    });

    test('file analysis supports multiple file types (via DiscoverPhase)', () => {
      const projectRoot = path.resolve(__dirname, '..');
      const discoverPath = path.join(
        projectRoot,
        'src/renderer/phases/DiscoverPhase.jsx',
      );

      expect(fs.existsSync(discoverPath)).toBe(true);

      const discoverContent = fs.readFileSync(discoverPath, 'utf8');
      expect(discoverContent).toContain('getFileType');
      expect(discoverContent).toContain('analyzeFiles');
      expect(discoverContent.toLowerCase()).toContain('pdf');
      expect(discoverContent.toLowerCase()).toContain('txt');
      expect(discoverContent.toLowerCase()).toContain('docx');
    });
  });

  describe('Undo/Redo System', () => {
    test('undo/redo system is imported and used', () => {
      const projectRoot = path.resolve(__dirname, '..');
      const providersPath = path.join(
        projectRoot,
        'src/renderer/components/AppProviders.jsx',
      );
      const undoPath = path.join(
        projectRoot,
        'src/renderer/components/UndoRedoSystem.jsx',
      );

      expect(fs.existsSync(providersPath)).toBe(true);
      expect(fs.existsSync(undoPath)).toBe(true);

      // Providers are wrapped in AppProviders
      const providersContent = fs.readFileSync(providersPath, 'utf8');
      expect(providersContent).toContain('UndoRedoProvider');
      expect(providersContent).toContain('NotificationProvider');

      const undoContent = fs.readFileSync(undoPath, 'utf8');
      expect(undoContent).toContain('useUndoRedo');
      expect(undoContent).toContain('UndoRedoToolbar');
    });

    test('undo/redo component file exists', () => {
      const projectRoot = path.resolve(__dirname, '..');
      const candidates = [
        path.join(projectRoot, 'src/renderer/components/UndoRedoSystem.js'),
        path.join(projectRoot, 'src/renderer/components/UndoRedoSystem.jsx'),
      ];
      expect(candidates.some((p) => fs.existsSync(p))).toBe(true);
    });
  });

  describe('Integration Testing', () => {
    test('React DOM rendering is properly configured', () => {
      const projectRoot = path.resolve(__dirname, '..');
      const indexPath = path.join(projectRoot, 'src/renderer/index.js');

      expect(fs.existsSync(indexPath)).toBe(true);

      const indexContent = fs.readFileSync(indexPath, 'utf8');

      // Modern React entry should use createRoot and render <App />
      expect(indexContent).toContain('createRoot');
      expect(indexContent).toMatch(/root\.(render|hydrate)\(/);
      expect(indexContent).toContain('<App />');
    });
  });
});
