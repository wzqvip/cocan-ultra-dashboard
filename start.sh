#!/usr/bin/env bash
# Start the zero-dependency local proxy for the dashboard.
set -euo pipefail

cd "$(dirname "$0")"

exec node server.mjs
