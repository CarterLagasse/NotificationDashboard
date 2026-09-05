module.exports = {
  apps: [{
    name: 'notification-dashboard',
    script: './server.js',
    cwd: __dirname,
    env: { PORT: 3000 },
    watch: false,
    autorestart: true,
  }],
};
