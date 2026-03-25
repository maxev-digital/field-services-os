module.exports = {
  apps: [{
    name: 'mrms-service',
    script: 'uvicorn',
    args: 'mrms_service:app --host 127.0.0.1 --port 8001 --workers 1',
    interpreter: 'python3',
    cwd: '/var/www/roof-works-admin/python-services/mrms',
    env: { PYTHONUNBUFFERED: '1' },
    error_file: '/var/log/mrms-service-error.log',
    out_file: '/var/log/mrms-service-out.log',
    restart_delay: 5000,
  }],
};
