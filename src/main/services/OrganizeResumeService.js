const path = require('path');
const fs = require('fs').promises;

/**
 * Resume incomplete organize batches from a previous session.
 * Coordinates with ProcessingStateService to safely continue operations.
 *
 * Dependencies are injected for testability and modularity.
 */
async function resumeIncompleteBatches(serviceIntegration, logger, getMainWindow) {
  try {
    const incomplete = serviceIntegration?.processingState?.getIncompleteOrganizeBatches?.() || [];
    if (!incomplete.length) return;
    logger.warn(`[RESUME] Resuming ${incomplete.length} incomplete organize batch(es)`);

    for (const batch of incomplete) {
      const total = batch.operations.length;
      for (let i = 0; i < total; i++) {
        const op = batch.operations[i];
        if (op.status === 'done') {
          const win = getMainWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source)
            });
          }
          continue;
        }
        try {
          await serviceIntegration.processingState.markOrganizeOpStarted(batch.id, i);

          // Ensure destination directory exists
          const destDir = path.dirname(op.destination);
          await fs.mkdir(destDir, { recursive: true });

          // Check destination collision and adjust
          try {
            await fs.access(op.destination);
            let counter = 1;
            let uniqueDestination = op.destination;
            const ext = path.extname(op.destination);
            const baseName = op.destination.slice(0, -ext.length);
            while (true) {
              try {
                await fs.access(uniqueDestination);
                counter++;
                uniqueDestination = `${baseName}_${counter}${ext}`;
                if (counter > 1000) throw new Error('Too many name collisions');
              } catch {
                break;
              }
            }
            if (uniqueDestination !== op.destination) {
              op.destination = uniqueDestination;
            }
          } catch {}

          // Move with EXDEV handling
          try {
            await fs.rename(op.source, op.destination);
          } catch (renameError) {
            if (renameError.code === 'EXDEV') {
              await fs.copyFile(op.source, op.destination);
              const sourceStats = await fs.stat(op.source);
              const destStats = await fs.stat(op.destination);
              if (sourceStats.size !== destStats.size) {
                throw new Error('File copy verification failed - size mismatch');
              }
              await fs.unlink(op.source);
            } else {
              throw renameError;
            }
          }

          await serviceIntegration.processingState.markOrganizeOpDone(batch.id, i, { destination: op.destination });

          const win = getMainWindow?.();
          if (win && !win.isDestroyed()) {
            win.webContents.send('operation-progress', {
              type: 'batch_organize',
              current: i + 1,
              total,
              currentFile: path.basename(op.source)
            });
          }
        } catch (err) {
          logger?.warn?.('[RESUME] Failed to resume op', i + 1, 'in batch', batch.id, ':', err.message);
          try { await serviceIntegration.processingState.markOrganizeOpError(batch.id, i, err.message); } catch {}
        }
      }
      try { await serviceIntegration.processingState.completeOrganizeBatch(batch.id); } catch {}
      logger?.info?.('[RESUME] Completed batch resume:', batch.id);
    }
  } catch (e) {
    logger?.warn?.('[RESUME] Resume batches failed:', e.message);
  }
}

module.exports = {
  resumeIncompleteBatches,
};


