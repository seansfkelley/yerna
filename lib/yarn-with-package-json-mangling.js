// Copyright 2017 Palantir Technologies Inc.

const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const { logger } = require('./logger');

function alphabetizeKeys(object) {
  const alphabetizedObject = {};
  _.chain(object)
    .keys()
    .sortBy()
    .forEach(k => alphabetizedObject[k] = object[k])
    .value();
  return alphabetizedObject;
}

function manglePackageJson(packageJsonPath, packagesByName) {
  const packageJson = fs.readFileSync(packageJsonPath);

  let mangledPackageJson;
  try {
    mangledPackageJson = JSON.parse(packageJson);
  } catch (e) {
    console.error('Error: Could not parse ' + packageJsonPath);
    throw e;
  }

  const removedDependencies = {};
  [ 'dependencies', 'devDependencies' ].forEach(key => {
    if (mangledPackageJson[key]) {
      removedDependencies[key] = {};
      _.forEach(mangledPackageJson[key], (version, packageName) => {
        if (packagesByName[packageName]) {
          delete mangledPackageJson[key][packageName];
          removedDependencies[key][packageName] = version;
        }
      });
    }
  });
  fs.writeFileSync(packageJsonPath, JSON.stringify(mangledPackageJson, null, 2) + '\n');

  return removedDependencies;
}

function unmanglePackageJson(packageJsonPath, mangleToken) {
  const packageJson = fs.readFileSync(packageJsonPath);
  const unmangledPackageJson = JSON.parse(packageJson);
  _.merge(unmangledPackageJson, mangleToken);
  [ 'dependencies', 'devDependencies' ].forEach(key => {
    if (unmangledPackageJson[key]) {
      unmangledPackageJson[key] = alphabetizeKeys(unmangledPackageJson[key]);
    }
  });
  fs.writeFileSync(packageJsonPath, JSON.stringify(unmangledPackageJson, null, 2) + '\n');
}

function runYarn(args, spawnArgs, onChildExit) {
  const child = child_process.spawn('yarn', args, spawnArgs);

  const killOnExit = () => {
    logger.debug(`yerna: (yarn wrapper) killing child ${child.pid} because parent process is exiting`);
    child.kill();
  };

  process.on('exit', killOnExit);

  child.once('exit', (code, signal) => {
    if (onChildExit) {
      onChildExit();
    }
    process.removeListener('exit', killOnExit);
    logger.debug(`yerna: (yarn wrapper) child pid ${child.pid} exited with code ${code} and signal ${signal}`);
  });

  return child;
}

function runYarnWithPackageJsonMangling(args, spawnArgs, packagesByName) {
  const packageJsonPath = path.resolve(spawnArgs.cwd || process.cwd(), 'package.json');
  const mangleToken = manglePackageJson(packageJsonPath, packagesByName);
  return runYarn(args, spawnArgs, () => unmanglePackageJson(packageJsonPath, mangleToken));
}

module.exports = {
  runYarnWithPackageJsonMangling,
  runYarn,
};
