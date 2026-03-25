#!/bin/bash
cd /var/www/roof-works-admin/python-services/mrms
source venv/bin/activate
exec uvicorn mrms_service:app --host 127.0.0.1 --port 8001 --workers 1
