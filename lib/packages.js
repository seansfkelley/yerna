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

// Ripped from Lerna.
function toposortPackages(packages) {
  const pendingPackageNames = _.values(packages).map(package => package.name);

  // This maps package names to the number of packages that depend on them.
  const refCounts = {};
  pendingPackageNames.forEach(packageName => {
    refCounts[packageName] = 0;
  });

  pendingPackageNames.forEach(packageName => packages[packageName].localDependencies.forEach(dependencyName => {
    // Ignore packages that we weren't given selected that were depended on.
    if (pendingPackageNames.indexOf(dependencyName) !== -1) {
      refCounts[dependencyName]++;
    }
  }));

  const batches = [];
  while (pendingPackageNames.length) {
    // Get all packages that have no remaining dependencies within the repo
    // that haven't yet been picked.
    const batch = pendingPackageNames.filter(packageName => {
      return packages[packageName]
        .localDependencies
        .filter(dependencyName => refCounts[dependencyName] > 0)
        .length === 0;
    });

    // If we weren't able to find a package with no remaining dependencies,
    // then we've encountered a cycle in the dependency graph.  Run a
    // single-package batch with the package that has the most dependents.
    if (pendingPackageNames.length && !batch.length) {
      console.error('yerna: encountered a cycle in the dependency graph; this may cause instability!'.red);
      console.error(`yerna: packages in the cycle are${[ '' ].concat(pendingPackageNames).join('\n - ')}`.red);

      batch.push(pendingPackageNames.reduce((a, b) => (
        (refCounts[packages[a].name] || 0) > (refCounts[packages[b].name] || 0) ? a : b
      )));
    }

    batches.push(batch);

    batch.forEach(packageName => {
      refCounts[packageName] = 0;
      packages[packageName].localDependencies.forEach(dependencyName => {
        if (refCounts[dependencyName] > 0) {
          refCounts[dependencyName]--;
        }
      });
      pendingPackageNames.splice(pendingPackageNames.indexOf(packageName), 1);
    });
  }

  return batches.map(batch => batch.map(packageName => packages[packageName]));
}

module.exports = {
  getPackages,
  getPackagesPath,
  toposortPackages
};
