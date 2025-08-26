#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || 'CPU.20250825.135309.21044.0.001.cpuprofile';
if (!fs.existsSync(file)) {
  console.error('Profile file not found:', file);
  process.exit(2);
}
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(2);
}
let p;
try {
  p = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse profile JSON:', e.message);
  process.exit(2);
}
const nodes = p.nodes || [];
const totals = {};
for (const n of nodes) {
  const name =
    (n.callFrame && (n.callFrame.functionName || n.callFrame.url)) ||
    '(anonymous)';
  totals[name] = (totals[name] || 0) + (n.hitCount || 0);
}
const arr = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);
console.log('Top functions by hitCount:\n');
for (const [name, count] of arr) {
  console.log(`${count.toString().padStart(6)}  ${name}`);
}
