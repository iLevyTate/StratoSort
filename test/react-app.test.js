const fs = require('fs');
const path = require('path');

describe('StratoSort React App - Core Structure', () => {
  const appPath = path.join(__dirname, '../src/renderer/App.jsx');
  let appContent;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf8');
  });

  describe('Phase System', () => {
    test('defines all required phases', () => {
      const expectedPhases = ['welcome', 'setup', 'discover', 'organize', 'complete'];
      
      expectedPhases.forEach((phase) => {
        expect(appContent.toLowerCase()).toContain(phase);
      });
    });

    test('includes all phase components', () => {
      const requiredComponents = [
        'WelcomePhase',
        'SetupPhase', 
        'DiscoverPhase',
        'OrganizePhase',
        'CompletePhase'
      ];
      
      requiredComponents.forEach((component) => {
        expect(appContent).toContain(component);
      });
    });
  });

  describe('Core System Components', () => {
    test('includes essential system components', () => {
      const systemComponents = [
        'NotificationProvider',
        'NavigationBar',
        'UndoRedoProvider'
      ];
      
      systemComponents.forEach((component) => {
        expect(appContent).toContain(component);
      });
    });

    test('includes React DOM rendering setup', () => {
      expect(appContent).toContain('ReactDOM');
      expect(appContent).toContain('createRoot');
      expect(appContent).toContain('render');
      expect(appContent).toContain('<App />');
    });
  });

  describe('Component Files Exist', () => {
    test('undo/redo component file exists', () => {
      const undoRedoPath = path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx');
      expect(fs.existsSync(undoRedoPath)).toBe(true);
    });

    test('phase component files exist', () => {
      const phaseFiles = [
        'WelcomePhase.jsx',
        'SetupPhase.jsx',
        'DiscoverPhase.jsx',
        'OrganizePhase.jsx',
        'CompletePhase.jsx'
      ];
      
      phaseFiles.forEach((file) => {
        const filePath = path.join(__dirname, '../src/renderer/phases', file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
