const fs = require('fs');
const path = require('path');

const defaultConfig = {
  packages: ['packages/*']
};

function readConfig(gitRoot) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(gitRoot, 'yerna.json')));
    return Object.assign({}, defaultConfig, config);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
    return defaultConfig;
  }
}

module.exports = {
  readConfig
};
