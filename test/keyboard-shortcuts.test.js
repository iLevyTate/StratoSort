const fs = require('fs');
const path = require('path');

describe('useKeyboardShortcuts (static)', () => {
  test('contains expected shortcut handlers and actions', () => {
    const file = path.join(
      __dirname,
      '../src/renderer/hooks/useKeyboardShortcuts.js',
    );
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('event.ctrlKey');
    // Accept either strict equality or normalized lower-case checks for 'z'
    expect(
      content.includes("event.key === 'z'") ||
        content.includes("event.key.toLowerCase() === 'z'")
    ).toBe(true);
    expect(content).toContain('advancePhase');
    // Accept ',' check in either strict or normalized form
    expect(
      content.includes("event.key === ','") ||
        content.includes("event.key.toLowerCase() === ','")
    ).toBe(true);
    expect(content).toContain("event.key === 'Escape'");
  });
});
