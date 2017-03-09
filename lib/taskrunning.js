// Copyright 2017 Palantir Technologies Inc.

const chalk = require('chalk');

const _ = require('lodash');
const Promise = require('bluebird');
const async = require('async');

const { logger } = require('./logger');
const { formatErrorForConsole } = require('./error-handling');

let spawnedProcesses = [];
let isAborting = false;

function trimLastNewline(s) {
  return s[s.length - 1] === '\n' ? s.slice(0, s.length - 1) : s;
}

function createTaskRunner(spawnChild) {
  return function(pkg) {
    return new Promise((resolve, reject) => {
      const spawnArgs = {
        cwd: pkg.path,
        env: process.env,
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        detached: true
      };

      const child = spawnChild(spawnArgs);

      logger.debug(`yerna: package '${pkg.name}' began task with child pid ${child.pid}`);

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
        logger.debug(`yerna: package '${pkg.name}' task with child pid ${child.pid} exited with code ${code} and signal ${signal}`);

        if (!isAborting && mergedOutput.length) {
          logger.info(`yerna: output for ${chalk.cyan(pkg.name)}`);
          mergedOutput.forEach(({ level, loglines }) => loglines.forEach(l => logger[level](l)));
          logger.info();
        }

        spawnedProcesses = _.without(spawnedProcesses, child);

        const didExitFail = code != null && code !== 0;
        const didGetSignal = signal != null;
        if (didExitFail || didGetSignal) {
          const reasons = _.compact([
            didGetSignal ? `task received signal ${signal}` : null,
            didExitFail ? `task exited with code ${code}` : null
          ]).join('; ');
          reject(reasons);
        } else {
          resolve();
        }
      });
    });
  }
}

function abort(cause, { userInitiated } = {}) {
  logger.debug(`yerna: received a request to abort`);

  if (isAborting) {
    logger.debug('yerna: already aborting, ignoring request');
    return;
  }

  if (cause) {
    logger.error(chalk.bgRed(formatErrorForConsole(cause)));
  } else {
    logger.debug('yerna: no abort cause was given');
  }

  if (!userInitiated) {
    logger.error(chalk.bgRed('yerna: errors while running tasks!'));
  }

  isAborting = true;
  Promise.delay(100)
    .then(() => {
      if (spawnedProcesses.length) {
        logger.warn(chalk.red(`yerna: waiting for ${spawnedProcesses.length} child process(es) to exit`));
      }

      logger.debug(`yerna: killing ${spawnedProcesses.length} processes, pids: ${spawnedProcesses.map(child => child.pid).join(', ')}`);
      spawnedProcesses.forEach(child => { process.kill(-child.pid); })

      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (spawnedProcesses.length === 0) {
            clearInterval(interval);
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
      logger.debug('yerna: child processes appear to have exited, continuing with abort');
      process.exitCode = 1;
    });
}

function WithAbort(fn) {
  return function() {
    let returnValue;
    try {
      returnValue = fn.apply(this, arguments);
    } catch (e) {
      abort(e);
      return;
    }

    if (returnValue && typeof returnValue.then === 'function') {
      return returnValue.catch(abort);
    } else {
      return returnValue;
    }
  };
}

function runPackagesToposorted(packages, runTask, parallel) {
  if (packages.length === 0) {
    logger.debug('yerna: no packages to run tasks for; early-terminating taskrunning');
    return Promise.resolve();
  }

  const packageByName = _.keyBy(packages, 'name');

  const pendingDependencies = _.mapValues(packageByName, pkg =>
    pkg.localDependencies.filter(pkgName => packageByName[pkgName]).length
  );

  function enqueueAvailablePackages({ breakCycles }) {
    if (_.size(pendingDependencies) > 0) {
      logger.debug(`${_.size(pendingDependencies)} packages not yet enqueued`);
      let freePackages =_.keys(_.pickBy(pendingDependencies, value => value === 0));

      if (breakCycles && freePackages.length === 0) {
        logger.warn(chalk.red('yerna: encountered a cycle in the dependency graph; will best-effort break it...'));
        logger.warn(chalk.red(`yerna: packages in the cycle are${[ '' ].concat(_.keys(pendingDependencies)).join('\nyerna:  - ')}`));
        freePackages = [ _.maxBy(_.keys(pendingDependencies), pkgName => pendingDependencies[pkgName]) ];
      }

      logger.debug(`yerna: will enqueue ${freePackages.length} packages`);
      freePackages.forEach(pkgName => {
        logger.debug(`yerna: enqueuing package '${pkgName}'`);
        q.push(packageByName[pkgName]);
        delete pendingDependencies[pkgName];
      });
    } else {
      logger.debug('yerna: asked to enqueue but there are no packages to enqueue; doing nothing');
    }
  }

  const q = async.queue((pkg, callback) => {
    logger.debug(`yerna: running task for ${pkg.name}`)
    return runTask(pkg)
      .then(() => {
        logger.debug(`yerna: task for package '${pkg.name}' complete; attempting to enqueue more packages`);
        pkg.localDependents
          // This filter does 2 things:
          // - ensures we pick only packages in the subset
          // - avoids nonsensically decrementing values when a cycle-breaking task finishes
          .filter(pkgName => pendingDependencies[pkgName] != null)
          .forEach(pkgName => {
            pendingDependencies[pkgName]--;
          });
        enqueueAvailablePackages({ breakCycles: false })
      })
      .asCallback(callback);
  }, parallel);

  enqueueAvailablePackages({ breakCycles: true });

  return new Promise((resolve, reject) => {
    q.drain = () => {
      if (_.size(pendingDependencies) === 0) {
        logger.debug('yerna: taskrunning queue empty and no pending packages left; taskrunning complete');
        resolve();
      } else {
        logger.debug('yerna: taskrunning queue empty but packages remain; attempting to enqueue with cycle-breaking allowed');
        enqueueAvailablePackages({ breakCycles: true });
      }
    };
    q.error = (e) => {
      q.error = () => {};
      q.kill();
      reject(e);
    };
  });
}

module.exports = {
  createTaskRunner,
  runPackagesToposorted,
  abort,
  WithAbort
};
