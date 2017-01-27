// Copyright 2017 Palantir Technologies Inc.

const chalk = require('chalk');

const _ = require('lodash');
const Promise = require('bluebird');
const async = require('async');

const { logger, LoggerWrapper } = require('./logger');
const { prelink, postlink } = require('./linking');
const { formatErrorForConsole } = require('./error-handling');

let spawnedProcesses = [];
let isAborting = false;

const START_TIME = Date.now();

function trimLastNewline(s) {
  return s[s.length - 1] === '\n' ? s.slice(0, s.length - 1) : s;
}

function createTaskRunner(spawnChild) {
  return function(pkg) {
    return new Promise((resolve, reject) => {
      const spawnArgs = {
        cwd: pkg.path,
        env: process.env,
        stdio: [ 'ignore', 'pipe', 'pipe' ]
      };

      const child = spawnChild(spawnArgs);

      spawnedProcesses.push(child);

      const mergedOutput = [];

      child.stdout.on('data', chunk => {
        mergedOutput.push({
          level: 'info',
          loglines: trimLastNewline(chunk.toString()).split('\n')
        });
      });

      child.stderr.on('data', chunk => {
        mergedOutput.push({
          level: 'error',
          loglines: trimLastNewline(chunk.toString()).split('\n')
        });
      });

      child.on('exit', (code, signal) => {
        if (!isAborting && mergedOutput.length) {
          logger.info(`yerna: output for ${chalk.cyan(pkg.name)}`);
          mergedOutput.forEach(({ level, loglines }) => loglines.forEach(l => logger[level](l)));
          logger.info();
        }

        spawnedProcesses = _.without(spawnedProcesses, child);

        if (code !== 0 || signal) {
          reject();
        } else {
          resolve();
        }
      });
    });
  }
}

function abort() {
  if (isAborting) {
    return;
  }

  isAborting = true;
  Promise.delay(100)
    .then(() => {
      if (spawnedProcesses.length) {
        logger.warn(chalk.red(`yerna: waiting for ${spawnedProcesses.length} child process(es) to exit`));
      }

      spawnedProcesses.forEach(child => { child.kill(); })

      return new Promise((resolve, reject) => {
        setInterval(() => {
          if (spawnedProcesses.length === 0) {
            resolve();
          }
        }, 200);
      });
    })
    .catch(e => {
      logger.error(chalk.bgRed(formatErrorForConsole(e)));
      logger.error(chalk.bgRed('yerna: package.jsons may still be mangled on the file system!'));
      if (spawnedProcesses.length) {
        logger.error(chalk.bgRed(`yerna: ${spawnedProcesses.length} process(es) were still running at exit time and might be abandoned (pids: ${spawnedProcesses.map(child => child.pid).join(', ')})`));
      }
      logger.error(chalk.bgRed('yerna: unexpected error during cleanup, exiting suddenly!'));
    })
    .finally(() => {
      LoggerWrapper.logErrorTiming(START_TIME);
      // TODO: If this is changed to process.exitCode, it doesn't work: something is keeping the process alive.
      process.exit(1);
    });
}

function runPackagesToposorted(logger, commander, packagesPath, packages, runTask) {
  logger.logPrelude();
  prelink(packagesPath);

  const packageByName = _.keyBy(packages, 'name');

  const pendingDependencies = _.mapValues(packageByName, pkg =>
    pkg.localDependencies.filter(pkgName => packageByName[pkgName]).length
  );

  function enqueueAvailablePackages({ breakCycles }) {
    if (_.size(pendingDependencies) > 0) {
      let freePackages =_.keys(_.pickBy(pendingDependencies, value => value === 0));

      if (breakCycles && freePackages.length === 0) {
        logger.warn(chalk.red('yerna: encountered a cycle in the dependency graph; will best-effort break it...'));
        logger.warn(chalk.red(`yerna: packages in the cycle are${[ '' ].concat(_.keys(pendingDependencies)).join('\nyerna:  - ')}`));
        freePackages = [ _.maxBy(_.keys(pendingDependencies), pkgName => pendingDependencies[pkgName]) ];
      }

      freePackages.forEach(pkgName => {
        q.push(packageByName[pkgName]);
        delete pendingDependencies[pkgName];
      });
    }
  }

  function logAndAbort(e) {
    if (!isAborting) {
      logger.logErrorPostlude(e);
      abort();
    }
  }

  const q = async.queue((pkg, callback) => {
    return runTask(pkg)
      .then(() => {
        pkg.localDependents
          // This filter does 2 things:
          // - ensures we pick only packages in the subset
          // - avoids nonsensically decrementing values when a cycle-breaking task finishes
          .filter(pkgName => pendingDependencies[pkgName] != null)
          .forEach(pkgName => {
            pendingDependencies[pkgName]--;
          });
      })
      .then(() => enqueueAvailablePackages({ breakCycles: false }))
      .asCallback(callback)
      .catch(logAndAbort);
  }, commander.parallel);

  enqueueAvailablePackages({ breakCycles: true });

  return new Promise((resolve, reject) => {
    q.drain = () => {
      if (_.size(pendingDependencies) === 0) {
        resolve();
      } else {
        enqueueAvailablePackages({ breakCycles: true });
      }
    };
    q.error = (e) => {
      q.error = () => {};
      q.kill();
      reject(e);
    };
  })
    .then(() => {
      postlink(packagesPath);
      logger.logSuccessPostlude();
      LoggerWrapper.logSuccessTiming(START_TIME);
    })
    .catch(logAndAbort);
}

module.exports = {
  createTaskRunner,
  runPackagesToposorted,
  abort
};
