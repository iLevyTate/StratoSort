#!/bin/bash

# Coverage reporting script for StratoSort
# Run with: ./scripts/coverage.sh

set -e

echo "🔍 Running coverage tests for StratoSort..."

# Change to the src-tauri directory
cd src-tauri

# Run tests with coverage
echo "📊 Running tests with coverage..."
cargo tarpaulin \
    --out html \
    --output-dir ../coverage \
    --exclude-files "src/bin/*" \
    --exclude-files "src/lib.rs" \
    --exclude-files "src/tests/*" \
    --exclude-files "src/error.rs" \
    --exclude-files "src/responses.rs" \
    --timeout 120 \
    --engine llvm \
    --workspace

echo "✅ Coverage report generated in coverage/index.html"
echo "📈 Open coverage/index.html in your browser to view the report"
