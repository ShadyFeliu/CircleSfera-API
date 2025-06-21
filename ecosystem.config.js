module.exports = {
  apps: [{
    name: 'circlesfera-backend',
    script: './build/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/circlesfera/error.log',
    out_file: '/var/log/circlesfera/out.log',
    merge_logs: true,
    instance_var: 'INSTANCE_ID',
    max_restarts: 10,
    min_uptime: '5s',
    listen_timeout: 3000,
    kill_timeout: 5000,
    restart_delay: 4000,
    wait_ready: true,
    source_map_support: false,
    node_args: '--max-old-space-size=1536',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
