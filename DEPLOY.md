# HoC — Production Deployment Guide

## npm Global Distribution

### Pack & Publish

```bash
# Build production bundle
pnpm build

# Create distributable tarball
npm pack
# Output: hoc-2026.2.6-5.tgz

# Publish to npm registry
npm publish --access public
```

### Install on Target Machine

```bash
npm install -g hoc

# Verify
hoc --version
hoc gateway start
```

---

## Docker Production Deployment

### Build Image

```bash
docker build -t hoc:latest -f Dockerfile .
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  gateway:
    image: hoc:latest
    ports:
      - "18789:18789"
    volumes:
      - hoc-data:/root/.openclaw
    environment:
      - NODE_ENV=production
      - OPENCLAW_LOG_LEVEL=info
    restart: always

volumes:
  hoc-data:
```

```bash
docker-compose up -d
```

---

## Windows Service Deployment

### Gateway Service

```powershell
# Build
pnpm build

# Install as Windows Service (Admin PowerShell)
node scripts/run-node.mjs gateway install
node scripts/run-node.mjs gateway start

# Verify
sc.exe query HoCGateway
```

### Node Host Service

```powershell
node scripts/run-node.mjs node install
node scripts/run-node.mjs node start
```

### Companion Service

```powershell
cd windows-companion
.\build.ps1 -Project "OpenClawCompanionEnhanced.csproj"
.\install.ps1

# Verify
sc.exe query HoCCompanion
```

---

## Linux systemd Deployment

### Create Service File

```bash
sudo tee /etc/systemd/system/hoc.service << 'EOF'
[Unit]
Description=HoC Gateway Service
After=network.target redis.service

[Service]
Type=simple
User=hoc
WorkingDirectory=/opt/hoc
ExecStart=/usr/bin/node scripts/run-node.mjs gateway
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=OPENCLAW_LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
EOF
```

### Enable & Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable hoc
sudo systemctl start hoc
sudo systemctl status hoc
```

---

## Fly.io Deployment

```bash
fly deploy
```

See `fly.toml` for configuration.

---

## Security Hardening

1. **Run as unprivileged user** — never run the gateway as root
2. **Firewall** — only expose port 18789 to trusted networks
3. **Authentication** — set `OPENCLAW_GATEWAY_TOKEN` for gateway access
4. **TLS** — use a reverse proxy (nginx, Caddy) for HTTPS
5. **Companion** — runs as SYSTEM; ensure only local access via named pipe
6. **Updates** — keep Node.js and dependencies up to date

---

## Monitoring

### Logs

```bash
# Gateway logs
tail -f ~/.openclaw/logs/gateway.log

# Systemd journal
journalctl -u hoc -f

# Windows Event Viewer
Get-EventLog -LogName Application -Source HoC* -Newest 50
```

### Health Check

```bash
curl http://localhost:18789/health
```

---

## Backup & Recovery

### Backup Config

```bash
cp -r ~/.openclaw ~/.openclaw.backup.$(date +%Y%m%d)
```

### Restore

```bash
cp -r ~/.openclaw.backup.YYYYMMDD ~/.openclaw
sudo systemctl restart hoc
```
