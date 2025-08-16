const fs = require('fs');
const path = require('path');

describe('useKeyboardShortcuts (static)', () => {
  test('contains expected shortcut handlers and actions', () => {
    const file = path.join(__dirname, '../src/renderer/hooks/useKeyboardShortcuts.js');
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('event.ctrlKey');
    expect(content).toContain("event.key === 'z'");
    expect(content).toContain('advancePhase');
    expect(content).toContain("event.key === ','");
    expect(content).toContain("event.key === 'Escape'");
  });
});


