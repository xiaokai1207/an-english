#!/usr/bin/env sh
# Collects only the public files into dist/ for Cloudflare Pages. The learning
# plan, the sound picker and any local build copy are deliberately left out.
set -e

rm -rf dist
mkdir -p dist/assets
cp index.html dist/
cp -R assets/. dist/assets/

echo "dist/ ready:"
ls -R dist
