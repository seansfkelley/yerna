// Copyright 2017 Palantir Technologies Inc.

const chalk = require('chalk');
const _ = require('lodash');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');
const { logger } = require('./logger');
const rimraf = require('rimraf')

function symlink(symlinkContent, symlinkPath) {
  mkdirp.sync(path.dirname(symlinkPath));
  let stats;
  try {
    stats = fs.lstatSync(symlinkPath);
  } catch (e) {}
  if (stats && stats.isSymbolicLink()) {
    fs.unlinkSync(symlinkPath);
  } else if (stats && stats.isDirectory()) {
    rimraf.sync(symlinkPath)
  }
  fs.symlinkSync(symlinkContent, symlinkPath);
}

function linkPackages(packagesByName) {
  _.forEach(packagesByName, (package, packageName) => {
    package.localDependencies.forEach(dependencyName => {
      const dependency = packagesByName[dependencyName];
      if (!dependency) {
        throw new Error(`programmer error: cannot link ${packageName} to ${dependencyName}`);
      }

      const symlinkPath = path.resolve(package.path, 'node_modules', dependencyName);
      const symlinkDirectory = path.dirname(symlinkPath);
      symlink(dependency.path, symlinkPath);

      if (dependency.bin) {
        const binaryRoot = path.resolve(package.path, 'node_modules', '.bin');
        _.forEach(dependency.bin, (relativeBinaryPath, binaryName) => {
          const binarySymlinkPath = path.resolve(binaryRoot, binaryName);
          symlink(path.resolve(dependency.path, relativeBinaryPath), binarySymlinkPath);
        });
      }
    });
  });
}

function WithLinking(packagesByName) {
  function prelink() {
    linkPackages(packagesByName);
    logger.verbose(`yerna: linked all ${chalk.cyan(_.size(packagesByName))} package(s) before running tasks`);
  }

  function postlink() {
    linkPackages(packagesByName);
    logger.verbose(`yerna: re-linked all ${chalk.cyan(_.size(packagesByName))} package(s) after running tasks`);
  }

  return function (fn) {
    return function() {
      prelink();

      const returnValue = fn.apply(this, arguments);

      if (returnValue && typeof returnValue.then === 'function') {
        return returnValue.tap(postlink);
      } else {
        postlink();
        return returnValue;
      }
    };
  };
}

module.exports = {
  linkPackages,
  WithLinking
};
