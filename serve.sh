#!/usr/bin/env bash
# Serve Wasteland Trial and print the public HTTPS address.
# The tunnel URL changes each time this is run — send the new one to the phone.
set -u
cd "$(dirname "$0")"

PORT=8971
CF=/opt/instance-tools/bin/cloudflared

pkill -f "http.server ${PORT}" 2>/dev/null
pkill -f "cloudflared tunnel.*${PORT}" 2>/dev/null
sleep 1

setsid python3 -m http.server "${PORT}" --bind 127.0.0.1 >/tmp/jak3srv.log 2>&1 &
sleep 1

setsid "${CF}" tunnel --no-autoupdate --url "http://127.0.0.1:${PORT}" >/tmp/jak3_tunnel.log 2>&1 &

for i in $(seq 1 40); do
  URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/jak3_tunnel.log | head -1)
  if [ -n "${URL}" ]; then
    echo "Wasteland Trial is live at: ${URL}"
    exit 0
  fi
  sleep 1
done

echo "Tunnel did not come up. Check /tmp/jak3_tunnel.log"
exit 1
