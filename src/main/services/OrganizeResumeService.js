const path = require('path');
const fs = require('fs').promises;
const { atomicFileOps } = require('../../shared/atomicFileOperations');

/**
 * Helper function to resolve naming collisions
 * @param {string} originalPath - Original file path
 * @param {number} maxAttempts - Maximum attempts to resolve collision
 * @returns {string} - Unique path with no collision
 */
async function resolveNamingCollision(originalPath, maxAttempts = 1000) {
  try {
    await fs.access(originalPath);
    let counter = 0;
    let uniquePath = originalPath;
    const ext = path.extname(originalPath);
    const baseName = originalPath.slice(0, -ext.length);
    const baseDelayMs = 10;

    while (true) {
      try {
        await fs.access(uniquePath);
        counter++;
        uniquePath = `${baseName}_${counter}${ext}`;
        if (counter > maxAttempts) {
          throw new Error(
            `Too many name collisions after ${maxAttempts} attempts`,
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(baseDelayMs * counter, 1000)),
        );
      } catch (accessError) {
        if (accessError.message.includes('Too many name collisions')) {
          throw accessError;
        }
        // File doesn't exist, we found a unique name
        break;
      }
    }

    return uniquePath;
  } catch (initialError) {
    if (initialError.code === 'ENOENT') {
      // Original path doesn't exist, no collision
      return originalPath;
    }
    throw initialError;
  }
}

/**
 * Resume incomplete organize batches from a previous session.
 * Coordinates with ProcessingStateService to safely continue operations.
 *
 * Dependencies are injected for testability and modularity.
 */
async function resumeIncompleteBatches(
  serviceIntegration,
  logger,
  getMainWindow,
) {
  try {
    const incomplete =
      serviceIntegration?.processingState?.getIncompleteOrganizeBatches?.() ||
      [];
    if (!incomplete.length) return;
    logger.warn(
      `[RESUME] Resuming ${incomplete.length} incomplete organize batch(es)`,
    );

    for (const batch of incomplete) {
      const total = batch.operations.length;
      for (let i = 0; i < total; i += 1) {
        const op = batch.operations[i];
        if (op.status === 'done') {
          const win = getMainWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source),
            });
          }
          continue;
        }
        try {
          await serviceIntegration.processingState.markOrganizeOpStarted(
            batch.id,
            i,
          );

          // Ensure destination directory exists
          const destDir = path.dirname(op.destination);
          await fs.mkdir(destDir, { recursive: true });

          // Use atomic move with built-in collision resolution and EXDEV handling
          try {
            const actualDestination = await atomicFileOps.atomicMove(
              op.source,
              op.destination,
            );
            // Update the operation with the actual destination (may have been adjusted for collisions)
            op.destination = actualDestination;
          } catch (moveError) {
            logger?.warn?.(
              '[RESUME] Atomic move failed for',
              path.basename(op.source),
              ':',
              moveError.message,
            );
            // Mark operation as failed and continue with next operation
            await serviceIntegration.processingState.markOrganizeOpError(
              batch.id,
              i,
              `File move failed: ${moveError.message}`,
            );
            continue;
          }

          await serviceIntegration.processingState.markOrganizeOpDone(
            batch.id,
            i,
            { destination: op.destination },
          );

          const win = getMainWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source),
            });
          }
        } catch (err) {
          logger?.warn?.(
            '[RESUME] Failed to resume op',
            i + 1,
            'in batch',
            batch.id,
            ':',
            err.message,
          );
          try {
            await serviceIntegration.processingState.markOrganizeOpError(
              batch.id,
              i,
              err.message,
            );
          } catch {}
        }
      }
      try {
        await serviceIntegration.processingState.completeOrganizeBatch(
          batch.id,
        );
      } catch {}
      logger?.info?.('[RESUME] Completed batch resume:', batch.id);
    }
  } catch (e) {
    logger?.warn?.('[RESUME] Resume batches failed:', e.message);
  }
}

module.exports = {
  resumeIncompleteBatches,
};
