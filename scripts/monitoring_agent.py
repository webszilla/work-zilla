import os
import time
import json
import requests
import psutil
import platform


BASE_URL = os.environ.get("MON_BASE_URL", "").rstrip("/")
TOKEN = os.environ.get("SERVER_TOKEN", "")
SERVER_ID = os.environ.get("SERVER_ID", "")
SERVER_ROLE = os.environ.get("SERVER_ROLE", "")
SERVER_REGION = os.environ.get("SERVER_REGION", "")

HEARTBEAT_INTERVAL = 30
METRICS_INTERVAL = 60


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def _post(path, payload):
    url = f"{BASE_URL}{path}"
    try:
        resp = requests.post(url, headers=_headers(), data=json.dumps(payload), timeout=10)
        return resp.status_code
    except Exception:
        return 0


def _get_load():
    try:
        load1, load5, load15 = os.getloadavg()
        return load1, load5, load15
    except Exception:
        return 0, 0, 0


def _get_net_kbps(prev):
    now = psutil.net_io_counters()
    if not prev:
        return now, 0, 0
    in_kbps = max(0, (now.bytes_recv - prev.bytes_recv) * 8 / 1000 / METRICS_INTERVAL)
    out_kbps = max(0, (now.bytes_sent - prev.bytes_sent) * 8 / 1000 / METRICS_INTERVAL)
    return now, in_kbps, out_kbps


def send_heartbeat():
    payload = {
        "server_id": SERVER_ID,
        "role": SERVER_ROLE,
        "region": SERVER_REGION,
        "hostname": platform.node(),
    }
    return _post("/api/monitoring/ingest/heartbeat", payload)


def send_metrics(prev_net):
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory().percent
    disk = psutil.disk_usage("/").percent
    load1, load5, load15 = _get_load()
    prev_net, net_in_kbps, net_out_kbps = _get_net_kbps(prev_net)
    payload = {
        "cpu_percent": cpu,
        "ram_percent": mem,
        "disk_percent": disk,
        "load1": load1,
        "load5": load5,
        "load15": load15,
        "net_in_kbps": net_in_kbps,
        "net_out_kbps": net_out_kbps,
    }
    _post("/api/monitoring/ingest/metrics", payload)
    return prev_net


def main():
    if not BASE_URL or not TOKEN:
        raise SystemExit("MON_BASE_URL and SERVER_TOKEN are required.")

    prev_net = None
    last_heartbeat = 0
    last_metrics = 0

    while True:
        now = time.time()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL:
            send_heartbeat()
            last_heartbeat = now
        if now - last_metrics >= METRICS_INTERVAL:
            prev_net = send_metrics(prev_net)
            last_metrics = now
        time.sleep(1)


if __name__ == "__main__":
    main()
