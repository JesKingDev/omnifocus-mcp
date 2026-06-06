#!/usr/bin/env bash
#
# smoke-http-auth.sh — Phase 4 (HTTP edge hardening) human smoke test.
#
# Verifies bearer auth, loopback-only bind, and per-session role parity over the
# HTTP transport against a freshly-started server. Self-contained: generates its
# own tokens, picks a port, starts and stops the server, prints a PASS/FAIL table.
#
# Usage:  bash scripts/smoke-http-auth.sh [PORT]
#
# NOTE: every /mcp request MUST send `Accept: application/json, text/event-stream`
# — the MCP Streamable-HTTP transport returns 406 without it. (This is the header
# the original 04-04-PLAN.md verification curl omitted.)

set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${1:-3001}"
AGENT_TOKEN="$(openssl rand -hex 32)"
OWNER_TOKEN="$(openssl rand -hex 32)"
ACCEPT="Accept: application/json, text/event-stream"
CT="Content-Type: application/json"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}'
URL="http://localhost:${PORT}/mcp"

pass=0; fail=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then printf '  ✓ %-46s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  ✗ %-46s expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

echo "Building…"; npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

echo "Starting server on :${PORT}…"
MCP_AGENT_TOKEN="$AGENT_TOKEN" MCP_OWNER_TOKEN="$OWNER_TOKEN" \
  node dist/index.js --http --port "$PORT" >/tmp/smoke-http-$$.log 2>&1 &
SRV_PID=$!
cleanup() { kill "$SRV_PID" 2>/dev/null; }
trap cleanup EXIT

for _ in $(seq 1 80); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AGENT_TOKEN" "http://localhost:${PORT}/health" 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 0.5
done
[ "$code" = "200" ] || { echo "server never became ready (see /tmp/smoke-http-$$.log)"; exit 1; }

echo "Running checks:"
check "unauthenticated POST -> 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$ACCEPT" -H "$CT" -d "$INIT" "$URL")"
check "agent token -> 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $AGENT_TOKEN" -H "$ACCEPT" -H "$CT" -d "$INIT" "$URL")"
check "owner token -> 200" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $OWNER_TOKEN" -H "$ACCEPT" -H "$CT" -d "$INIT" "$URL")"
check "wrong token -> 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer wrongtoken" -H "$ACCEPT" -H "$CT" -d "$INIT" "$URL")"
check "missing body -> 400" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $AGENT_TOKEN" -H "$ACCEPT" -H "$CT" "$URL")"

# Role parity: agent operation enum must omit delete/bulk_delete; owner must include them.
role_ops() { # token
  local tok="$1"
  local sid
  sid=$(curl -s -D - -o /dev/null -X POST -H "Authorization: Bearer $tok" -H "$ACCEPT" -H "$CT" -d "$INIT" "$URL" \
        | awk 'tolower($1)=="mcp-session-id:"{print $2}' | tr -d '\r')
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $tok" -H "$ACCEPT" -H "$CT" -H "Mcp-Session-Id: $sid" \
       -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$URL"
  curl -s -X POST -H "Authorization: Bearer $tok" -H "$ACCEPT" -H "$CT" -H "Mcp-Session-Id: $sid" \
       -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' "$URL" \
    | grep '^data: ' | sed 's/^data: //' | python3 -c "
import sys,json
d=json.load(sys.stdin)
w=[t for t in d['result']['tools'] if t['name']=='omnifocus_write'][0]
def walk(o,out):
    if isinstance(o,dict):
        if isinstance(o.get('enum'),list) and 'create' in o['enum'] and 'tag_manage' in o['enum']: out.append(o['enum'])
        for v in o.values(): walk(v,out)
    elif isinstance(o,list):
        for v in o: walk(v,out)
out=[]; walk(w.get('inputSchema',{}),out)
print('delete' in (out[0] if out else []))
"
}
check "agent role omits delete in write schema" False "$(role_ops "$AGENT_TOKEN")"
check "owner role includes delete in write schema" True "$(role_ops "$OWNER_TOKEN")"

# Loopback fail-closed: --host 0.0.0.0 must exit non-zero before serving.
MCP_AGENT_TOKEN="$AGENT_TOKEN" node dist/index.js --http --port "$((PORT+50))" --host 0.0.0.0 >/dev/null 2>&1
check "open-interface bind (0.0.0.0) -> exit 1" 1 "$?"

echo
echo "Result: ${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ] && echo "ALL CHECKS PASSED ✓" || echo "SOME CHECKS FAILED ✗"
exit "$fail"
