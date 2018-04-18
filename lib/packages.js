// Copyright 2017 Palantir Technologies Inc.

const _ = require('lodash');
const glob = require('glob');
const fs = require('fs');
const path = require('path');

function getPackages(root, config) {
  const packagesByName = _.chain(config.packages)
    .map(packageGlob => path.join(root, packageGlob, 'package.json'))
    .flatMap(packageJsonGlob => glob.sync(packageJsonGlob))
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
  getPackages
};
