// Copyright 2017 Palantir Technologies Inc.

const _ = require('lodash');
const glob = require('glob');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function trimTrailingNewline(s) {
  return s[s.length - 1] === '\n' ? s.slice(0, s.length - 1) : s;
}

function getPackagesPath() {
  let gitRoot;
  try {
    gitRoot = trimTrailingNewline(child_process.execSync('git rev-parse --show-toplevel', {
      timeout: 5000,
      stdio: 'pipe'
    }).toString());
  } catch (e) {
    throw new Error('cannot get path to root of git repo: ' + trimTrailingNewline(e.stderr.toString()));
  }

  return path.join(gitRoot, 'packages');
}

function getPackages(directory) {
  const packagesByName = _.chain(glob.sync(path.join(directory, '*', 'package.json')))
    .map(filename => {
      const packageJson = JSON.parse(fs.readFileSync(filename));
      return {
        name: packageJson.name,
        path: path.resolve(path.dirname(filename)),
        bin: packageJson.bin || {},
        scripts: packageJson.scripts || {},
        allDependencies: _.chain([ 'dependencies', 'devDependencies' ])
          .map(key => packageJson[key])
          .compact()
          .map(dependencies => _.keys(dependencies))
          .flatten()
          .uniq()
          .value(),
        localDependents: []
      };
    })
    .keyBy('name')
    .value();

  _.forEach(packagesByName, (pkg, name) => {
    pkg.localDependencies = pkg.allDependencies.filter(dependency => !!packagesByName[dependency]);
    delete pkg.allDependencies;
  });

  _.forEach(packagesByName, (pkg, name) => {
    pkg.localDependencies.forEach(dependencyName => {
      packagesByName[dependencyName].localDependents.push(name);
    })
  });

  _.forEach(packagesByName, pkg => {
    pkg.localDependencies = _.sortBy(pkg.localDependencies);
    pkg.localDependents = _.sortBy(pkg.localDependents);
  });

  return packagesByName;
}

module.exports = {
  getPackages,
  getPackagesPath
};
