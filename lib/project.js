const path = require('path');
const child_process = require('child_process');
const findUp = require('find-up');

var root;

try {
  root = gitProjectRoot();
} catch(_) {
  const file = jsonProjectRoot();
  if (file) {
    root = path.dirname(file);
  }
}

if (!root) {
  throw new Error(`yerna: Can't find project root from ${process.cwd()}. Looking for git repository, yerna.json, or lerna.json.`);
}

module.exports = {
  PROJECT_ROOT: root
};

function gitProjectRoot() {
  return child_process.execSync('git rev-parse --show-toplevel', {
    timeout: 5000,
    stdio: 'pipe'
  }).toString().trim();
}

function jsonProjectRoot() {
  return findUp.sync(['yerna.json', 'lerna.json']);
}
