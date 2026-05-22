# HoC — Setup Guide

Complete setup instructions for **HoC-Republic**, the Republic of Hani’s OpenClaws, on Windows, Linux, and macOS.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | ≥ 22.12.0 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | ≥ 10.x | `npm install -g pnpm` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |
| **.NET SDK** | 8.0+ | Windows only — for Companion Service |

---

## 1. Clone & Install

```bash
git clone https://github.com/hunix/HoC-Republic.git
cd HoC-Republic
pnpm install
```

## 2. Build

```bash
pnpm build
```

Verify: `ls dist/entry.js` (or `dir dist\entry.js` on Windows).

## 3. Configure

```bash
cp .env.example .env
```

Edit `.env` with your settings. Key variables:

```bash
# Logging level (debug | info | warn | error)
OPENCLAW_LOG_LEVEL=info

# Gateway port (default: 18789)
OPENCLAW_GATEWAY_PORT=18789

# Enable Windows Companion (Windows only)
OPENCLAW_USE_COMPANION=true
```

> **Note:** Environment variables still use the `OPENCLAW_` prefix for backwards compatibility.

---

## Windows Setup

### A. Build the Companion Service

The Companion Service enables full PC control — mouse, keyboard, UI automation, PowerShell, hardware access.

```powershell
# Requires .NET 8.0 SDK
cd windows-companion
.\build.ps1 -Project "OpenClawCompanionEnhanced.csproj"
cd ..
```

### B. Install Services (Admin PowerShell)

```powershell
# Install Gateway (this machine is the server)
node scripts/run-node.mjs gateway install
node scripts/run-node.mjs gateway start

# Install Node Host (this machine runs agent workloads)
node scripts/run-node.mjs node install
node scripts/run-node.mjs node start

# Install Companion Service (high-privilege, enables PC control)
cd windows-companion
.\install.ps1
```

### C. Verify

```powershell
Get-Service HoC*, OpenClaw*
```

Logs: `%USERPROFILE%\.openclaw\logs\`

---

## Linux / macOS Setup

### A. Run Interactively

```bash
pnpm install            # Install workspace dependencies
pnpm build              # Build TypeScript packages
pnpm ui:build           # Build the web control UI
pnpm dev onboard        # Complete local OpenClaw onboarding
pnpm dev gateway run    # Run the gateway in development mode
pnpm tui:dev            # Terminal UI, dev mode
```

For production-style gateway execution, use `pnpm start gateway run` after the build and onboarding steps are complete.

### B. Systemd Service (Production)

Create `/etc/systemd/system/hoc.service`:

```ini
[Unit]
Description=HoC Gateway Service
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/HoC
ExecStart=/usr/bin/pnpm start gateway run
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable hoc
sudo systemctl start hoc
```

### C. Ubuntu Automated Install

```bash
chmod +x install-hoc-ubuntu.sh
./install-hoc-ubuntu.sh
```

---

## Dev Mode

For development with auto-rebuild:

```bash
pnpm dev onboard        # First-time local OpenClaw onboarding
pnpm dev gateway run    # Gateway development mode
pnpm tui:dev            # TUI mode
pnpm ui:build           # Build the web UI served by the gateway
```

The web control UI is built with `pnpm ui:build` and is then served by the gateway at the configured gateway address, usually `http://localhost:18789`.

Hot reload is automatic — source changes trigger a rebuild before restart.

---

## Global Install (npm)

To install HoC globally via npm:

```bash
# Build and pack
pnpm build
npm pack

# Install globally from the tarball
npm install -g hoc-2026.2.6-5.tgz

# Now available as:
hoc gateway start
hoc node start
hoc onboard
```

Or publish to npm: `npm publish` (requires npm credentials).

---

## Docker

```bash
# Build the image
docker build -t hoc .

# Run with docker-compose
docker-compose up -d
```

See `docker-compose.yml` for full configuration.

---

## Multi-Machine Cluster

HoC supports clustering with automatic leader election and failover via Redis.

### Prerequisites

- **Redis** ≥ 7.0 running and accessible from all gateway machines
- All machines must be able to reach each other over the network

### Quick Start (Single Redis URL)

Set `OPENCLAW_REDIS_URL` on every machine:

```bash
# Supports redis:// and rediss:// (TLS)
OPENCLAW_REDIS_URL=redis://:yourpassword@redis-host:6379/0
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENCLAW_REDIS_URL` | — | Redis connection URL (takes precedence over individual vars) |
| `OPENCLAW_REDIS_HOST` | `localhost` | Redis hostname |
| `OPENCLAW_REDIS_PORT` | `6379` | Redis port |
| `OPENCLAW_REDIS_PASSWORD` | — | Redis password |
| `OPENCLAW_REDIS_DB` | `0` | Redis database number |
| `OPENCLAW_REDIS_TLS` | `false` | Enable TLS |
| `OPENCLAW_CLUSTER_ENABLED` | auto-detected | Force enable/disable clustering |
| `OPENCLAW_CLUSTER_ROLE` | `auto` | Force role: `primary`, `standby`, or `auto` |
| `OPENCLAW_CLUSTER_NODE_ID` | auto-generated | Stable node identifier |
| `OPENCLAW_CLUSTER_SECRET` | — | Shared secret for session encryption |
| `OPENCLAW_AUTO_FAILOVER` | `true` | Enable automatic failover |

### Deployment Example

**Machine A (Primary):**
```bash
OPENCLAW_REDIS_URL=redis://redis-host:6379/0 \
OPENCLAW_CLUSTER_ROLE=primary \
pnpm start gateway run
```

**Machine B (Standby):**
```bash
OPENCLAW_REDIS_URL=redis://redis-host:6379/0 \
OPENCLAW_CLUSTER_ROLE=standby \
pnpm start gateway run
```

With `OPENCLAW_CLUSTER_ROLE=auto`, the first gateway to acquire the Redis lock becomes primary.

### State Replication

The primary gateway replicates Republic state to standby gateways via Redis pub/sub:
- **Full snapshot** every 100 ticks and on standby request
- **Delta updates** on each tick (only changed keys)
- **Automatic recovery** if a standby misses ticks

On failover, the standby promotes to primary and begins accepting traffic within seconds.

### Docker Compose (Cluster)

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  gateway-primary:
    build: .
    environment:
      OPENCLAW_REDIS_URL: redis://redis:6379/0
      OPENCLAW_CLUSTER_ROLE: primary
    ports: ["18789:18789"]
    depends_on: [redis]

  gateway-standby:
    build: .
    environment:
      OPENCLAW_REDIS_URL: redis://redis:6379/0
      OPENCLAW_CLUSTER_ROLE: standby
    ports: ["18790:18789"]
    depends_on: [redis]
```

---

## Verification

```bash
# Check gateway is running
pnpm start gateway run

# View logs
tail -f ~/.openclaw/logs/gateway.log     # Linux/macOS
Get-Content "$env:USERPROFILE\.openclaw\logs\gateway.log" -Wait  # Windows

# Run tests
pnpm test
```

---

## Troubleshooting

### Module warnings on startup
Set `NODE_NO_WARNINGS=1` in your environment or run with `--no-warnings`:
```bash
NODE_NO_WARNINGS=1 pnpm start gateway run
```

### Build failures
```bash
pnpm store prune
rm -rf node_modules
pnpm install
pnpm build
```

### Windows Companion won't start
```powershell
# Check Event Viewer for errors
Get-EventLog -LogName Application -Source HoCCompanion -Newest 10

# Verify .NET runtime
dotnet --list-runtimes

# Reinstall
cd windows-companion
.\install.ps1
```

### Permission denied (Windows)
Run PowerShell as Administrator (right-click → Run as Administrator).
