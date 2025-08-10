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
      
      expectedPhases.forEach(phase => {
        expect(appContent.toLowerCase()).toContain(phase);
      });
    });

    test('defines phase transitions correctly', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('PHASE_TRANSITIONS');
      ['WELCOME','SETUP','DISCOVER','ORGANIZE','COMPLETE'].forEach(p => {
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
      
      requiredComponents.forEach(component => {
        const regex = new RegExp(`(function|const|class)\\s+${component}\\b`);
        expect(regex.test(appContent)).toBe(true);
      });
    });

    test('defines system components', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      const systemComponents = [
        'NotificationProvider',
        'SystemMonitoring',
        'NavigationBar',
        'ProgressIndicator',
        'UndoRedoToolbar'
      ];
      
      systemComponents.forEach(component => {
        expect(appContent).toContain(component);
      });
    });
  });

  describe('File Processing', () => {
    test('drag and drop functionality is implemented', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('useDragAndDrop');
      expect(appContent).toContain('handleDragEnter');
      expect(appContent).toContain('handleDragLeave');
      expect(appContent).toContain('handleDrop');
    });

    test('file analysis supports multiple file types', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('getFileType');
      expect(appContent).toContain('analyzeFiles');
      expect(appContent).toContain('pdf');
      expect(appContent).toContain('txt');
      expect(appContent).toContain('docx');
    });
  });

  describe('Undo/Redo System', () => {
    test('undo/redo system is imported and used', () => {
      const appContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/App.js'), 
        'utf8'
      );
      
      expect(appContent).toContain('UndoRedoProvider');
      expect(appContent).toContain('useUndoRedo');
      expect(appContent).toContain('UndoRedoToolbar');
    });

    test('undo/redo component file exists', () => {
      const undoRedoPath = path.join(__dirname, '../src/renderer/components/UndoRedoSystem.jsx');
      expect(fs.existsSync(undoRedoPath)).toBe(true);
    });
  });

  describe('Integration Testing', () => {
    test('React DOM rendering is properly configured', () => {
      const indexContent = fs.readFileSync(
        path.join(__dirname, '../src/renderer/index.js'), 
        'utf8'
      );
      
      expect(indexContent).toContain('createRoot');
      expect(indexContent).toContain('render');
      expect(indexContent).toContain('<App />');
    });
  });
});
