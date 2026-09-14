#!/bin/sh
# Serve this checkout on a fixed localhost port.
#
#   ./serve.sh            # http://localhost:8414/
#
# The port is fixed on purpose: browser saves live in localStorage keyed by
# origin, so a game opened on a different port every time starts from nothing.
# Agents (Safari MCP) and humans (a plain Safari window) open the same URL and
# each keep their own saves across sessions. On localhost the developer flags
# (cheats, debug output) are on - see GameConstants.isLocalDevBuild.
#
# The service worker caches aggressively; after a rebuild, hard-reload or
# unregister it from the console:
#   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
PORT="${PORT:-8414}"
cd "$(dirname "$0")" || exit 1
echo "serving $(pwd) at http://localhost:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
