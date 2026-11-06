#!/usr/bin/env bash
# Rasterises the app icons from the SVGs in apps/web/public with macOS `sips`.
# Run after editing icon.svg or icon-maskable.svg, and commit the PNGs.
# The maskable variant is full-bleed, with its artwork inside the central 80%.
set -euo pipefail
cd "$(dirname "$0")/../apps/web/public"
sips -s format png -z 192 192 icon.svg --out icon-192.png >/dev/null
sips -s format png -z 512 512 icon.svg --out icon-512.png >/dev/null
sips -s format png -z 512 512 icon-maskable.svg --out icon-maskable-512.png >/dev/null
