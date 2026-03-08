#!/usr/bin/env bash
# Find TypeScript files using ': any' type annotations.
# Usage: ./scripts/find-any-types.sh

set -e
echo "Searching for ': any' types in codebase..."
count=$(grep -r ":\s*any" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
echo "Total instances found: $count"
echo ""
echo "Files with 'any' types:"
grep -r ":\s*any" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null || true
