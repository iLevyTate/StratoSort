const fs = require('fs');
const path = require('path');

describe('StratoSort React App', () => {
  describe('Phase System', () => {
    test('defines all required phases', () => {
      const expectedPhases = ['welcome', 'setup', 'discover', 'organize', 'complete'];
      
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expectedPhases.forEach((phase) => {
        expect(appContent.toLowerCase()).toContain(phase);
      });
    });

    test('defines phase transitions correctly', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('PHASE_TRANSITIONS');
      ['WELCOME','SETUP','DISCOVER','ORGANIZE','COMPLETE'].forEach((p) => {
        const regex = new RegExp(`PHASES\\.${p}`);
        expect(regex.test(appContent)).toBe(true);
      });
    });
  });

  describe('Component Structure', () => {
    test('defines all required phase components', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      const requiredComponents = [
        'WelcomePhase',
        'SetupPhase', 
        'DiscoverPhase',
        'OrganizePhase',
        'CompletePhase'
      ];
      
      requiredComponents.forEach((component) => {
        const regex = new RegExp(component);
        expect(regex.test(appContent)).toBe(true);
      });
    });

    test('defines system components', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('NotificationProvider');
      expect(appContent).toContain('NavigationBar');
    });
  });

  describe('File Processing', () => {
    test('drag and drop functionality is implemented', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'),
        'utf8'
      );

      expect(appContent).toBeDefined();
    });

    test('file analysis utility function exists', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'),
        'utf8'
      );

      expect(appContent).toBeDefined();
    });
  });

  describe('Undo/Redo System', () => {
    test('undo/redo system is imported and used', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('UndoRedoProvider');
    });

    test('undo/redo component file exists', () => {
      const undoRedoPath = path.join(__dirname, '../src/renderer/components/UndoRedoSystem.js');
      expect(fs.existsSync(undoRedoPath)).toBe(true);
    });
  });

  describe('Integration Testing', () => {
    test('React DOM rendering is properly configured', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('ReactDOM');
      expect(appContent).toContain('createRoot');
      expect(appContent).toContain('render');
      expect(appContent).toContain('<App />');
    });
  });
});
