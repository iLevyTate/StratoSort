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
        markOrganizeOpStarted: jest.fn(async (batchId, opIndex) => {
          console.log('markOrganizeOpStarted called:', batchId, opIndex);
        }),
        markOrganizeOpDone: jest.fn(async (batchId, opIndex, result) => {
          console.log('markOrganizeOpDone called:', batchId, opIndex, result);
        }),
        markOrganizeOpError: jest.fn(async (batchId, opIndex, error) => {
          console.log('markOrganizeOpError called:', batchId, opIndex, error);
        }),
        completeOrganizeBatch: jest.fn(async (batchId) => {
          console.log('completeOrganizeBatch called:', batchId);
        }),
      },
    };

    const logger = { info: jest.fn(), warn: jest.fn() };
    const getMainWindow = () => ({
      isDestroyed: () => false,
      webContents: { send: jest.fn() },
    });

    try {
      await resumeIncompleteBatches(serviceIntegration, logger, getMainWindow);
      console.log('Service call completed successfully');
    } catch (error) {
      console.log('Service call failed:', error.message);
      throw error;
    }

    // Debug logging
    console.log('After service call:');
    console.log('srcA exists:', fssync.existsSync(srcA));
    console.log('srcB exists:', fssync.existsSync(srcB));
    console.log('destA exists:', fssync.existsSync(destA));
    console.log('destB exists:', fssync.existsSync(destB));
    console.log('destA path:', destA);
    console.log('destB path:', destB);

    expect(fssync.existsSync(destA)).toBe(true);
    expect(fssync.existsSync(destB)).toBe(true);
    expect(
      serviceIntegration.processingState.completeOrganizeBatch,
    ).toHaveBeenCalled();
  });
});
