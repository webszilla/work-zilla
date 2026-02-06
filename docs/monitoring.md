# Server Monitoring (SaaS Admin)

## Create ServerNode + Token (Django Admin)
1) Open `/admin/`
2) Create a ServerNode with name, role, region, hostname, ip
3) Generate token:
   - POST `/api/monitoring/servers/{server_id}/token` as SaaS admin
   - Response returns token once
4) Store token securely on the server

## Agent Setup (Linux)
```bash
python3 -m venv /opt/monitoring-agent
source /opt/monitoring-agent/bin/activate
pip install psutil requests
```

Environment:
```
MON_BASE_URL=https://yourdomain.com
SERVER_TOKEN=your-generated-token
SERVER_ID=optional
SERVER_ROLE=app
SERVER_REGION=ap-south
```

Run agent:
```bash
python3 scripts/monitoring_agent.py
```

Systemd:
```
sudo cp scripts/systemd/monitoring-agent.service /etc/systemd/system/monitoring-agent.service
sudo systemctl daemon-reload
sudo systemctl enable monitoring-agent
sudo systemctl start monitoring-agent
```

## SMTP (Email Alerts)
Set in environment:
```
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-user
EMAIL_HOST_PASSWORD=your-pass
EMAIL_USE_TLS=1
DEFAULT_FROM_EMAIL=alerts@yourdomain.com
```

Local dev:
```
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```
