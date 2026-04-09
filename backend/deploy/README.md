# SnapTrade Deploy

## Option 1: Docker (recommended)
```bash
cd /opt/snaptrade
cp backend/.env.example backend/.env  # edit with real values
cp listener/.env.example listener/.env  # edit with real values
docker compose up -d
```

## Option 2: Systemd (bare metal)
```bash
# Copy service files
sudo cp deploy/*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable --now snaptrade-backend
sudo systemctl enable --now snaptrade-listener

# Check status
sudo systemctl status snaptrade-backend
sudo systemctl status snaptrade-listener
sudo journalctl -u snaptrade-backend -f
```

## Health checks
- Backend: curl http://localhost:3001/api/health
- Listener: check /tmp/listener_alive timestamp
