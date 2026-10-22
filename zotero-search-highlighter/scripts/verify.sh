#!/bin/sh
set -eu
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
