#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-root@89.167.16.104}"
SERVER_PROJECT_PATH="${SERVER_PROJECT_PATH:-/home/workzilla/docker-data/volumes/workzilla_html_data/_data/getworkzilla.com}"

echo "Deploying code to ${SERVER_HOST}:${SERVER_PROJECT_PATH}"

ssh "$SERVER_HOST" 'bash -s' <<EOF
set -euo pipefail

cd "$SERVER_PROJECT_PATH"

git config --global --add safe.directory "$SERVER_PROJECT_PATH" >/dev/null 2>&1 || true
git pull origin main

. venv/bin/activate
venv/bin/python apps/backend/manage.py migrate
venv/bin/python apps/backend/manage.py collectstatic --noinput

pgrep -f "apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000" | xargs -r kill
nohup env DJANGO_DEBUG=0 venv/bin/gunicorn apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 900 --graceful-timeout 60 >/tmp/workzilla-gunicorn.out 2>&1 </dev/null &
sleep 3

echo "Live SHA: \$(git rev-parse --short HEAD)"
echo "Gunicorn:"
pgrep -af "apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000"
EOF

echo "Verifying live URLs"
curl -I -s https://getworkzilla.com/ | head -n 1
curl -I -s https://getworkzilla.com/static/public/css/site.css | head -n 5
curl -I -s https://getworkzilla.com/downloads/bootstrap-products.json | head -n 5
