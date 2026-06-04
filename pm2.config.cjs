module.exports = {
  apps: [{
    name: 'world-sim',
    script: 'server/index.js',
    env: {
      PORT: 3010,
    },
    watch: false,
    max_memory_restart: '500M',
  }],
};
