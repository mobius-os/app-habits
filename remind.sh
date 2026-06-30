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
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

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
        # any other API error: degrade to "no data" rather than abort the run
        print(f"reminder: GET {path} failed ({e.code})", file=sys.stderr)
        return None
    except (urllib.error.URLError, ValueError) as e:
        # network failure or malformed JSON — same: degrade, don't crash
        print(f"reminder: GET {path} failed ({e})", file=sys.stderr)
        return None

def is_success(h, v):
    if v is None or v == -1:
        return False
    if h.get("type") == "NUMERICAL":
        tgt = h.get("targetValue")
        if tgt is None:
            tgt = 1  # a real cap of 0 ("none is success") must be preserved
        if h.get("targetType") == "AT_MOST":
            return v / 1000 <= tgt
        return v / 1000 >= tgt
    return v > 0

def now_in(tz_name):
    # Evaluate "now" in the owner's timezone (captured by the app when the
    # reminder was set) so an HH:MM set in the browser fires at the right local
    # wall-clock and reads the right local day. Falls back to container-local
    # (UTC) when the zone is missing/unknown — the legacy behavior.
    if tz_name and ZoneInfo is not None:
        try:
            return datetime.datetime.now(ZoneInfo(tz_name))
        except Exception:
            pass
    return datetime.datetime.now()

habits = api_get("habits.json") or []

# Day-logs cached by local date (reminders usually share one timezone, so this
# is typically a single fetch).
_log_cache = {}
def get_log(date):
    if date not in _log_cache:
        _log_cache[date] = api_get(f"logs/{date}.json") or {}
    return _log_cache[date]

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
        return True
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{api}/api/notifications/send", data=data,
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        return True
    except urllib.error.URLError as e:
        # one throttled/failed send (e.g. a 429 rate-limit on the 11th habit)
        # must not abort the rest of the batch.
        print(f"reminder: send '{title}' failed ({e})", file=sys.stderr)
        return False

sent = 0
for h in habits:
    if h.get("archived"):
        continue
    r = h.get("reminder")
    if not r:
        continue
    now = now_in(r.get("tz"))
    if r.get("hour") != now.hour or r.get("minute") != now.minute:
        continue
    if not ((r.get("days", 127) >> int(now.strftime("%w"))) & 1):  # %w: 0=Sun..6=Sat
        continue
    if is_success(h, get_log(now.strftime("%Y-%m-%d")).get(h["id"])):
        continue  # already satisfied today (incl. AT_MOST under cap)
    emoji = h.get("emoji", "")
    title = f"{emoji} {h['name']}".strip()
    body = h.get("question") or f"Time for {h['name']}"
    if send(title, body):
        sent += 1

print(f"reminder run — {sent} sent" + (" (dry)" if dry else ""))
PY
