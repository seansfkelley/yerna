// Copyright 2017 Palantir Technologies Inc.

require('colors');
const winston = require('winston');
const fs = require('fs');
const { formatErrorForConsole } = require('./error-handling');

// TODO: This logfile should be relative to the repo root.
const LOG_FILENAME = 'yerna.log';

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      showLevel: false
    }),
    new winston.transports.File({
      filename: LOG_FILENAME,
      json: false,
      level: 'verbose'
    })
  ]
});

function deleteLogFile() {
  fs.unlinkSync(LOG_FILENAME);
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

class LoggerWrapper {
  constructor(commander, packages, formattedCommand = null, withScriptName = null) {
    this.commander = commander;
    this.packages = packages;
    this.formattedCommand = formattedCommand;
    this.withScriptName = withScriptName;
  }

  logPrelude() {
    const packageCount = this.packages.length.toString().cyan;
    const include = this.commander.include.length ? formatList(this.commander.include.map(r => r.magenta)) : null;
    const exclude = this.commander.exclude.length ? formatList(this.commander.exclude.map(r => r.magenta)) : null;
    const { dependents, dependencies } = this.commander;

    let logline = '';

    if (this.formattedCommand) {
      logline += `yerna: running ${this.formattedCommand.cyan} for ${packageCount} package(s)`;
    } else {
      logline += `yerna: ${packageCount} package(s)`;
    }

    if (include) {
      logline += `\nyerna:  - that match ${include}`;
    }

    if (exclude) {
      logline += `\nyerna:  - that do not match ${exclude}`;
    }

    if (this.withScriptName) {
      logline += `\nyerna:  - that have a ${this.withScriptName.magenta} script`;
    }

    if (dependents || dependencies) {
      if (dependents && dependencies) {
        logline += `\nyerna:  - including ${'all transitive dependents and their dependencies'.magenta}`;
      } else if (dependents) {
        logline += `\nyerna:  - including ${'all transitive dependents'.magenta}`;
      } else if (dependencies) {
        logline += `\nyerna:  - including ${'all transitive dependencies'.magenta}`;
      }

      if (exclude) {
        logline += ` (even if they match --exclude)`;
      }
    }

    logger.info(logline);
  }

  logErrorPostlude(e) {
    const packageCount = this.packages.length.toString().cyan;
    logger.error(formatErrorForConsole(e).bgRed);
    logger.error('yerna: errors while running'.red, this.formattedCommand.cyan, 'in'.red, packageCount, 'package(s)'.red);
    logger.error('yerna: packages may be in an inconsistent state, including not being linked to each other'.bgRed);
  }

  static logErrorTiming(startTime) {
    logger.error(`yerna: aborted after ${Math.round((Date.now() - startTime) / 1000 * 100) / 100}s`);
  }

  logSuccessPostlude() {
    const packageCount = this.packages.length.toString().cyan;
    logger.info(`yerna: ran ${this.formattedCommand ? this.formattedCommand.cyan + ' ' : ''}successfully in ${packageCount} package(s)${[ '' ].concat(this.packages.map(pkg => pkg.name)).join('\n - ')}`);
  }

  static logSuccessTiming(startTime) {
    logger.info(`yerna: took ${Math.round((Date.now() - startTime) / 1000 * 100) / 100}s`);
  }
}

module.exports = {
  logger,
  LoggerWrapper,
  deleteLogFile
};
