const child_process = require('child_process');

const GIT_ROOT = child_process.execSync('git rev-parse --show-toplevel', {
  timeout: 5000,
  stdio: 'pipe'
}).toString().trim();

module.exports = {
  GIT_ROOT
};
