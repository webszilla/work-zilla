#!/usr/bin/env bash
set -euo pipefail

# Simple Linux agent for Server Monitoring.
# Required env:
#   MONITORING_URL="https://your-domain.com"
#   MONITORING_TOKEN="Bearer token from /api/monitoring/servers/<id>/token"
# Optional:
#   MONITORING_INTERVAL_SECONDS=1

MONITORING_URL="${MONITORING_URL:-}"
MONITORING_TOKEN="${MONITORING_TOKEN:-}"
INTERVAL_SECONDS="${MONITORING_INTERVAL_SECONDS:-1}"

if [[ -z "${MONITORING_URL}" || -z "${MONITORING_TOKEN}" ]]; then
  echo "Missing MONITORING_URL or MONITORING_TOKEN." >&2
  exit 1
fi

read_cpu() {
  awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat
}

calc_cpu_percent() {
  local -a a b
  read -r -a a <<<"$(read_cpu)"
  sleep 0.4
  read -r -a b <<<"$(read_cpu)"

  local total_a=0 total_b=0
  for v in "${a[@]}"; do total_a=$((total_a + v)); done
  for v in "${b[@]}"; do total_b=$((total_b + v)); done

  local idle_a=$((a[3] + a[4]))
  local idle_b=$((b[3] + b[4]))
  local diff_total=$((total_b - total_a))
  local diff_idle=$((idle_b - idle_a))
  if [[ "${diff_total}" -le 0 ]]; then
    echo "0"
    return
  fi
  awk -v dt="${diff_total}" -v di="${diff_idle}" 'BEGIN{printf "%.2f", (dt-di)*100/dt}'
}

calc_ram_percent() {
  local total avail used
  total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  used=$((total - avail))
  awk -v u="${used}" -v t="${total}" 'BEGIN{printf "%.2f", (u*100)/t}'
}

calc_disk_percent() {
  df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'
}

calc_loads() {
  awk '{print $1,$2,$3}' /proc/loadavg
}

read_net_bytes() {
  awk -F'[: ]+' '/:/{if ($1!="lo") {rx+=$2; tx+=$10}} END{print rx,tx}' /proc/net/dev
}

calc_net_kbps() {
  local rx1 tx1 rx2 tx2
  read -r rx1 tx1 <<<"$(read_net_bytes)"
  sleep "${INTERVAL_SECONDS}"
  read -r rx2 tx2 <<<"$(read_net_bytes)"
  local rx_diff=$((rx2 - rx1))
  local tx_diff=$((tx2 - tx1))
  awk -v r="${rx_diff}" -v t="${tx_diff}" -v s="${INTERVAL_SECONDS}" \
    'BEGIN{printf "%.2f %.2f", (r*8/1000)/s, (t*8/1000)/s}'
}

CPU_PERCENT=$(calc_cpu_percent)
RAM_PERCENT=$(calc_ram_percent)
DISK_PERCENT=$(calc_disk_percent)
read -r LOAD1 LOAD5 LOAD15 <<<"$(calc_loads)"
read -r NET_IN_KBPS NET_OUT_KBPS <<<"$(calc_net_kbps)"

PAYLOAD=$(cat <<JSON
{
  "cpu_percent": ${CPU_PERCENT},
  "ram_percent": ${RAM_PERCENT},
  "disk_percent": ${DISK_PERCENT},
  "load1": ${LOAD1},
  "load5": ${LOAD5},
  "load15": ${LOAD15},
  "net_in_kbps": ${NET_IN_KBPS},
  "net_out_kbps": ${NET_OUT_KBPS}
}
JSON
)

curl -sS -X POST "${MONITORING_URL}/api/monitoring/ingest/metrics" \
  -H "Authorization: Bearer ${MONITORING_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" >/dev/null

curl -sS -X POST "${MONITORING_URL}/api/monitoring/ingest/heartbeat" \
  -H "Authorization: Bearer ${MONITORING_TOKEN}" >/dev/null

echo "sent"
