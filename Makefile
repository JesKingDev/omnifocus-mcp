# omnifocus-mcp — LaunchAgent install / uninstall
#
# Deployment rationale: docs/adr/ADR-005-deployment-posture.md
# Node-pinning runbook:  docs/runbook/launchd-deployment.md
#
# IMPORTANT — node binary source:
#   Pin a Developer-ID-signed node (official nodejs.org .pkg or nvm build).
#   Do NOT copy Homebrew's ad-hoc-signed node — its cdhash-based designated
#   requirement breaks the TCC Automation grant on every in-place overwrite.
#   The one-time copy of the pinned binary is a runbook step, not automated here.
#
# Usage:
#   make install   MCP_AGENT_TOKEN=<token> MCP_OWNER_TOKEN=<token> [MCP_PORT=54321]
#   make uninstall
#   make verify    (advisory — tails server.err; useful after first install)

.PHONY: install uninstall verify

# ── paths ──────────────────────────────────────────────────────────────────
PLIST_TEMPLATE  := deploy/launchd/com.kip-d.omnifocus-mcp.plist
LAUNCH_AGENTS   := $(HOME)/Library/LaunchAgents
INSTALLED_PLIST := $(LAUNCH_AGENTS)/com.kip-d.omnifocus-mcp.plist
LOG_DIR         := $(HOME)/Library/Logs/omnifocus-mcp
NODE_BINARY     := $(HOME)/.local/libexec/of-mcp-node
SERVER_ENTRY    := $(shell pwd)/dist/index.js
LAUNCHD_TARGET  := gui/$(shell id -u)
SERVICE_ID      := com.kip-d.omnifocus-mcp
MCP_PORT        ?= 54321

# ── install ────────────────────────────────────────────────────────────────
# Steps:
#   1. Create log dir and LaunchAgents dir (idempotent).
#   2. Substitute placeholders in the plist template → installed plist.
#   3. Bootstrap the LaunchAgent with the modern bootstrap API.
#
# Tokens are required — pass as make variables or export as env vars:
#   make install MCP_AGENT_TOKEN=<hex> MCP_OWNER_TOKEN=<hex> [MCP_PORT=54321]
#
# The node binary copy (~/.local/libexec/of-mcp-node) is a one-time runbook
# step — see docs/runbook/launchd-deployment.md. It is NOT performed here.
install:
	@if [ -z "$(MCP_AGENT_TOKEN)" ] || [ -z "$(MCP_OWNER_TOKEN)" ]; then \
	  echo "ERROR: MCP_AGENT_TOKEN and MCP_OWNER_TOKEN must be set."; \
	  echo "  Usage: make install MCP_AGENT_TOKEN=<token> MCP_OWNER_TOKEN=<token>"; \
	  exit 1; \
	fi
	@echo "→ Creating directories…"
	mkdir -p "$(LOG_DIR)"
	mkdir -p "$(HOME)/.local/libexec"
	mkdir -p "$(LAUNCH_AGENTS)"
	@echo "→ Substituting plist template → $(INSTALLED_PLIST)"
	sed \
	  -e "s|__NODE_BINARY__|$(NODE_BINARY)|g" \
	  -e "s|__SERVER_ENTRYPOINT__|$(SERVER_ENTRY)|g" \
	  -e "s|__LOG_DIR__|$(LOG_DIR)|g" \
	  -e "s|__MCP_AGENT_TOKEN__|$(MCP_AGENT_TOKEN)|g" \
	  -e "s|__MCP_OWNER_TOKEN__|$(MCP_OWNER_TOKEN)|g" \
	  -e "s|__MCP_PORT__|$(MCP_PORT)|g" \
	  "$(PLIST_TEMPLATE)" > "$(INSTALLED_PLIST)"
	@echo "→ Bootstrapping LaunchAgent…"
	launchctl bootstrap $(LAUNCHD_TARGET) "$(INSTALLED_PLIST)"
	@echo "✓ Installed. Logs: $(LOG_DIR)/server.err"
	@echo "  First run: check logs for a TCC Automation prompt or -1743 denial."

# ── uninstall ──────────────────────────────────────────────────────────────
# bootout tolerates "not loaded" (service absent) — safe to run idempotently.
uninstall:
	@echo "→ Booting out LaunchAgent…"
	launchctl bootout $(LAUNCHD_TARGET)/$(SERVICE_ID) 2>/dev/null || true
	@echo "→ Removing installed plist…"
	rm -f "$(INSTALLED_PLIST)"
	@echo "✓ Uninstalled."

# ── verify (advisory) ──────────────────────────────────────────────────────
# Tails the error log to confirm the agent started cleanly.
# This is an advisory helper — it does not assert a pass/fail result.
# Full end-to-end validation requires the launchctl spike (06-RESEARCH.md S0–S5).
verify:
	@echo "→ Checking service status…"
	launchctl print $(LAUNCHD_TARGET)/$(SERVICE_ID) 2>/dev/null || echo "(service not loaded)"
	@echo "→ Tailing $(LOG_DIR)/server.err (Ctrl-C to stop)…"
	tail -f "$(LOG_DIR)/server.err"
