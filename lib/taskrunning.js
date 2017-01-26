// Copyright 2017 Palantir Technologies Inc.

require('colors');

const _ = require('lodash');
const Promise = require('bluebird');
const async = require('async');

const { Logger } = require('./logger');
const { prelink, postlink } = require('./linking');
const { formatErrorForConsole } = require('./error-handling');

let spawnedProcesses = [];
let isAborting = false;

const START_TIME = Date.now();

function createTaskRunner(spawnChild) {
  return function(pkg, isQuiet) {
    return new Promise((resolve, reject) => {
      const spawnArgs = {
        cwd: pkg.path,
        env: process.env,
        stdio: [ 'ignore', 'pipe', 'pipe' ]
      };

      const child = spawnChild(spawnArgs);

      spawnedProcesses.push(child);

      let mergedOutput = '';

      if (!isQuiet) {
        child.stdout.on('data', chunk => {
          mergedOutput += chunk.toString();
        });
      }

      child.stderr.on('data', chunk => {
        mergedOutput += chunk.toString().red;
      })

      child.on('exit', (code, signal) => {
        if (!isAborting && mergedOutput) {
          console.error(`yerna: output for ${pkg.name.cyan}`);
          // Yes, stdout specifically.
          process.stdout.write(mergedOutput);
          console.error();
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
        console.error(`yerna: waiting for ${spawnedProcesses.length} child process(es) to exit`.red);
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
      console.error(formatErrorForConsole(e).bgRed);
      console.error('yerna: package.jsons may still be mangled on the file system!'.bgRed);
      if (spawnedProcesses.length) {
        console.error(`yerna: ${spawnedProcesses.length} process(es) were still running at exit time and might be abandoned (pids: ${spawnedProcesses.map(child => child.pid).join(', ')})`.bgRed);
      }
      console.error('yerna: unexpected error during cleanup, exiting suddenly!'.bgRed);
    })
    .finally(() => {
      Logger.logErrorTiming(START_TIME);
      process.exit(1);
    })
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
        console.error('yerna: encountered a cycle in the dependency graph; will best-effort break it...'.red);
        console.error(`yerna: packages in the cycle are${[ '' ].concat(_.keys(pendingDependencies)).join('\nyerna:  - ')}`.red);
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
    return runTask(pkg, commander.quiet)
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
      Logger.logSuccessTiming(START_TIME);
      process.exit(0);
    })
    .catch(logAndAbort);
}

module.exports = {
  createTaskRunner,
  runPackagesToposorted,
  abort
};
