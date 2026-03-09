const { spawn } = require('child_process');

const child = spawn('npx', ['next', 'start', '-p', '3000', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
