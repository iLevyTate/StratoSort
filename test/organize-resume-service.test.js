const path = require('path');
const fs = require('fs').promises;
const fssync = require('fs');
const os = require('os');

describe('OrganizeResumeService.resumeIncompleteBatches', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `stratosort-resume-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('resumes and completes pending operations', async () => {
    const {
      resumeIncompleteBatches,
    } = require('../src/main/services/OrganizeResumeService');

    // Create two files to move
    const srcA = path.join(tmpDir, 'a.txt');
    const srcB = path.join(tmpDir, 'b.txt');
    const destA = path.join(tmpDir, 'out', 'a.txt');
    const destB = path.join(tmpDir, 'out', 'b.txt');
    await fs.mkdir(path.dirname(destA), { recursive: true });
    await fs.writeFile(srcA, 'A');
    await fs.writeFile(srcB, 'B');

    const serviceIntegration = {
      processingState: {
        getIncompleteOrganizeBatches: () => [
          {
            id: 'batch1',
            operations: [
              { source: srcA, destination: destA, status: 'pending' },
              { source: srcB, destination: destB, status: 'pending' },
            ],
          },
        ],
        markOrganizeOpStarted: jest.fn(async () => {}),
        markOrganizeOpDone: jest.fn(async () => {}),
        markOrganizeOpError: jest.fn(async () => {}),
        completeOrganizeBatch: jest.fn(async () => {}),
      },
    };

    const logger = { info: jest.fn(), warn: jest.fn() };
    const getMainWindow = () => ({
      isDestroyed: () => false,
      webContents: { send: jest.fn() },
    });

    await resumeIncompleteBatches(serviceIntegration, logger, getMainWindow);

    expect(fssync.existsSync(destA)).toBe(true);
    expect(fssync.existsSync(destB)).toBe(true);
    expect(
      serviceIntegration.processingState.completeOrganizeBatch,
    ).toHaveBeenCalled();
  });
});
