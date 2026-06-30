#!/usr/bin/env bash
# Per-habit reminder job for the Habits mini-app.
#
# Installed via init-cron-scaffold.sh with an every-minute cadence
# (`* * * * *`) so each habit can fire at its own configured time. The job gets
# the numeric app id as $1. It reads habits.json + today's log through the raw
# storage API (service token), and for each habit whose reminder time == now and
# whose weekday bit is set and that is NOT yet done today, sends a Web Push.
#
# Outbound side-effect: it calls /api/notifications/send (a real push). NEVER run
# it live to "test" — pass DRY_RUN=1 to print the payloads instead of sending.

set -euo pipefail
APP_ID="${1:?usage: remind.sh <app-id>}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
export SERVICE_TOKEN="$(cat /data/service-token.txt 2>/dev/null || echo '')"
export APP_ID DRY_RUN="${DRY_RUN:-0}"

python3 - "$APP_ID" <<'PY'
import json, os, sys, urllib.request, urllib.error, datetime

app_id = sys.argv[1]
api = os.environ["API_BASE_URL"].rstrip("/")
token = os.environ.get("SERVICE_TOKEN", "")
dry = os.environ.get("DRY_RUN", "0") == "1"

def api_get(path):
    req = urllib.request.Request(f"{api}/api/storage/apps/{app_id}/{path}",
                                 headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def is_success(h, v):
    if v is None or v == -1:
        return False
    if h.get("type") == "NUMERICAL":
        tgt = h.get("targetValue") or 1
        if h.get("targetType") == "AT_MOST":
            return v / 1000 <= tgt
        return v / 1000 >= tgt
    return v > 0

now = datetime.datetime.now()
hour, minute, wd = now.hour, now.minute, int(now.strftime("%w"))  # %w: 0=Sun..6=Sat
today = now.strftime("%Y-%m-%d")

habits = api_get("habits.json") or []
log = api_get(f"logs/{today}.json") or {}

due = []
for h in habits:
    if h.get("archived"):
        continue
    r = h.get("reminder")
    if not r:
        continue
    if r.get("hour") != hour or r.get("minute") != minute:
        continue
    if not ((r.get("days", 127) >> wd) & 1):
        continue
    if h.get("type") == "NUMERICAL" and h.get("targetType") == "AT_MOST":
        continue  # "stay under" habits are tracked, not nagged
    if is_success(h, log.get(h["id"])):
        continue  # already done today
    due.append(h)

def send(title, body):
    payload = {
        "title": title,
        "body": body,
        "target": f"/shell/?app={app_id}",
        "source_type": "app",
        "source_id": str(app_id),
    }
    if dry:
        print("DRY_RUN would send:", json.dumps(payload))
        return
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{api}/api/notifications/send", data=data,
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()

for h in due:
    emoji = h.get("emoji", "")
    title = f"{emoji} {h['name']}".strip()
    body = h.get("question") or f"Time for {h['name']}"
    send(title, body)

print(f"reminder run {today} {hour:02d}:{minute:02d} — {len(due)} sent" + (" (dry)" if dry else ""))
PY
