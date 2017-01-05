// Copyright 2017 Palantir Technologies Inc.

require('colors');

const _ = require('lodash');
const Promise = require('bluebird');

const { Logger } = require('./logger');
const { prelink, postlink } = require('./linking');
const { formatErrorForConsole } = require('./error-handling');

let spawnedProcesses = [];
let isAborting = false;

const START_TIME = Date.now();

function runTaskFor(pkg, spawnChild, isQuiet) {
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

function runBatch(pkgs, spawnChild, parallel, isQuiet) {
  return Promise.map(
    pkgs,
    pkg => runTaskFor(pkg, spawnChild, isQuiet),
    { concurrency: parallel }
  );
}

function runPackageBatches(logger, commander, pkgBatches, spawnChild) {
  logger.logPrelude();
  prelink();
  return Promise.mapSeries(pkgBatches, pkgBatch => runBatch(pkgBatch, spawnChild, commander.parallel, commander.quiet))
    .then(() => {
        postlink();
        logger.logSuccessPostlude();
        Logger.logSuccessTiming(START_TIME);
        process.exit(0);
      })
      .catch(e => {
        if (!isAborting) {
          logger.logErrorPostlude(e);
        }
        abort();
      });
}

module.exports = {
  runPackageBatches,
  abort
};
