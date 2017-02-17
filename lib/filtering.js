// Copyright 2017 Palantir Technologies Inc.

const chalk = require('chalk');
const _ = require('lodash');
const fs = require('fs');
const { logger } = require('./logger');

function findTransitiveDependentsOrDependencies(packagesByName, rootPackageName, typeKey) {
  const selectedPackageNames = [];
  let packageQueue = [ packagesByName[rootPackageName] ];
  while (packageQueue.length) {
    const currentPackage = packageQueue.shift();
    if (selectedPackageNames.indexOf(currentPackage.name) === -1) {
      selectedPackageNames.push(currentPackage.name);
      packageQueue = packageQueue.concat(currentPackage[typeKey].map(packageName => packagesByName[packageName]))
    }
  }
  return selectedPackageNames.map(packageName => packagesByName[packageName]);
}

function maybeIncludeDependentsAndDependencies(packagesByName, pkg, { dependents, dependencies }) {
  let packages = [ pkg ];

  if (dependents) {
    packages = packages.concat(_.flatMap(packages, pkg => findTransitiveDependentsOrDependencies(packagesByName, pkg.name, 'localDependents')));
  }

  if (dependencies) {
    packages = packages.concat(_.flatMap(packages, pkg => findTransitiveDependentsOrDependencies(packagesByName, pkg.name, 'localDependencies')));
  }

  return _.uniqBy(packages, 'name');
}

function applyIncludeExclude(pkg, { include, exclude }) {
  return (
    (include.length === 0 || include.some(regex => new RegExp(regex).test(pkg.name))) &&
    (exclude.length === 0 || !exclude.some(regex => new RegExp(regex).test(pkg.name)))
  );
};

function filterPackages(packagesByName, commander, additionalFilter = () => true) {
  const filteredPackages = _.chain(packagesByName)
    .values()
    .filter(pkg => applyIncludeExclude(pkg, commander))
    .flatMap(pkg => maybeIncludeDependentsAndDependencies(packagesByName, pkg, commander))
    .uniqBy('name')
    .sortBy('name')
    .filter(additionalFilter)
    .value();

  return filteredPackages;
}

function formatList(strings, conjunction = 'or', oxfordComma = false) {
  if (oxfordComma) {
    throw new Error(`yerna: oops, don't use an Oxford comma!`);
  }

  if (strings.length <= 1) {
    return strings.join('');
  } else {
    return `${strings.slice(0, strings.length - 1).join(', ')} ${conjunction} ${strings[strings.length - 1]}`
  }
}

function logFlagFeedback(commander, filteredPackages, commandPhrase, additionalFilters = []) {
  const include = commander.include.length ? formatList(commander.include.map(r => chalk.magenta(r))) : null;
  const exclude = commander.exclude.length ? formatList(commander.exclude.map(r => chalk.magenta(r))) : null;
  const { dependents, dependencies } = commander;

  logger.info(`yerna: ${commandPhrase ? 'running ' + chalk.cyan(commandPhrase) + ' for ' : ''}${chalk.cyan(filteredPackages.length)} package(s)`);

  if (include) {
    logger.info(`yerna:  - that match ${include}`);
  }

  if (exclude) {
    logger.info(`yerna:  - that do not match ${exclude}`);
  }

  additionalFilters.forEach(filter => {
    logger.info(`yerna:  - that ${filter}`);
  });

  if (dependents || dependencies) {
    let logline = '';

    if (dependents && dependencies) {
      logline = `yerna:  - including ${chalk.magenta('all transitive dependents and their dependencies')}`;
    } else if (dependents) {
      logline = `yerna:  - including ${chalk.magenta('all transitive dependents')}`;
    } else if (dependencies) {
      logline = `yerna:  - including ${chalk.magenta('all transitive dependencies')}`;
    }

    if (exclude) {
      logline += ` (even if they match --exclude)`;
    }

    logger.info(logline);
  }

  logger.verbose('yerna: selected packages are:');
  filteredPackages.forEach(pkg => logger.verbose(`yerna:  - ${pkg.name}`));
}

module.exports = {
  filterPackages,
  logFlagFeedback
};
