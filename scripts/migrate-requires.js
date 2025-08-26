#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const prettier = require('prettier');
const recast = require('recast');
const babelParser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const RENDERER_SRC = path.join(ROOT, 'src', 'renderer');

function findFiles() {
  return glob.sync('**/*.+(js|jsx|ts|tsx)', {
    cwd: RENDERER_SRC,
    absolute: true,
  });
}

function report(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function run(dryRun = true) {
  const files = findFiles();
  const changes = [];

  files.forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    let out = src;

    // First, quick regex passes (fast path)
    out = out.replace(
      /const\s+\{\s*ipcRenderer\s*\}\s*=\s*require\(['"]electron['"]\);?/g,
      'const ipcRenderer = window.electron?.ipcRenderer;',
    );
    out = out.replace(
      /window\.require\(['"]electron['"]\)/g,
      'window.electron',
    );

    // AST-aware transformations for import/require patterns and Node global usage
    try {
      const ast = recast.parse(src, {
        parser: {
          parse(source) {
            return babelParser.parse(source, {
              sourceType: 'unambiguous',
              plugins: [
                'jsx',
                'classProperties',
                'optionalChaining',
                'nullishCoalescingOperator',
                'typescript',
              ],
            });
          },
        },
      });

      let transformed = false;

      recast.types.visit(ast, {
        visitCallExpression(pathNode) {
          const { node } = pathNode;
          // require('electron') -> window.electron
          if (
            node.callee &&
            node.callee.name === 'require' &&
            node.arguments &&
            node.arguments[0] &&
            node.arguments[0].value === 'electron'
          ) {
            pathNode.replace(recast.parseExpression('window.electron'));
            transformed = true;
            return false;
          }
          this.traverse(pathNode);
        },

        visitImportDeclaration(pathNode) {
          const { node } = pathNode;
          if (node.source && node.source.value === 'electron') {
            // Turn `import { ipcRenderer } from 'electron'` -> `const ipcRenderer = window.electron?.ipcRenderer;`
            const specifiers = node.specifiers || [];
            const replacements = specifiers.map((spec) => {
              if (spec.type === 'ImportSpecifier') {
                const imported = spec.imported.name;
                return `const ${spec.local.name} = window.electron?.${imported};`;
              }
              if (spec.type === 'ImportDefaultSpecifier') {
                return `const ${spec.local.name} = window.electron || {};`;
              }
              return '';
            });
            const replAst = recast.parse(replacements.join('\n'));
            pathNode.replace(replAst.program.body);
            transformed = true;
            return false;
          }
          this.traverse(pathNode);
        },

        visitMemberExpression(pathNode) {
          const { node } = pathNode;
          // Detect process.env or __dirname usages -> add a comment for manual review
          try {
            if (
              node.object &&
              node.object.name === 'process' &&
              node.property &&
              node.property.name === 'env'
            ) {
              // leave as-is but mark
              // (we don't replace Node globals automatically)
            }
          } catch (e) {}
          this.traverse(pathNode);
        },
      });

      if (transformed) {
        const printed = recast.print(ast).code;
        out = printed;
      }
    } catch (e) {
      // Parsing may fail for some files; skip AST transform
      // console.debug('AST transform failed for', file, e.message);
    }

    if (out !== src) {
      changes.push({ file, src, out });
    }
  });

  if (changes.length === 0) {
    report('No renderer require patterns found.');
    return 0;
  }

  report(`Found ${changes.length} files to update.`);

  changes.forEach((ch) => {
    report(`--- ${path.relative(ROOT, ch.file)}`);
    if (dryRun) {
      // show a short diff-ish summary
      const linesSrc = ch.src.split('\n');
      const linesOut = ch.out.split('\n');
      for (let i = 0; i < Math.min(linesSrc.length, linesOut.length); i++) {
        if (linesSrc[i] !== linesOut[i]) {
          report(`- ${linesSrc[i]}`);
          report(`+ ${linesOut[i]}`);
        }
      }
    } else {
      // Write formatted output
      try {
        const formatted = prettier.format(ch.out, { filepath: ch.file });
        fs.writeFileSync(ch.file, formatted, 'utf8');
        report(`Updated: ${path.relative(ROOT, ch.file)}`);
      } catch (err) {
        report(`Failed to write ${ch.file}: ${err.message}`);
      }
    }
  });

  report(
    dryRun
      ? '\nDry run complete. Run with --apply to modify files.'
      : '\nApply complete.',
  );
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = !argv.includes('--apply');

  run(dryRun);
}

main();
