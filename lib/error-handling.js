// Copyright 2017 Palantir Technologies Inc.

const chalk = require('chalk');

// ************************************************
// THIS FILE SHOULD HAVE NO SIDE EFFECTS
//
// It must be safe to import and call this file from
// anywhere so the user can get error messages even
// if everything is on fire.
// ************************************************

function attachGlobalErrorHandling() {
  function logAndDie(e) {
    console.error(chalk.bgRed(formatErrorForConsole(e)));
    console.error(chalk.bgRed('yerna: unexpected error, exiting suddenly!'));
    console.error(chalk.bgRed('yerna: this is probably a bug in Yerna itself, please file an issue!'));
    console.error(chalk.bgRed('yerna: NOTE: package.jsons or links may be in an inconsistent state'));
    console.error(chalk.bgRed('yerna: NOTE: child processes may be abandoned'));
    process.exit(1);
  }

  process.on('uncaughtException', logAndDie);
  process.on('unhandledRejection', logAndDie);
}

function formatErrorForConsole(e) {
  if (e) {
    return (e.stack ? e.stack : e.toString()).split('\n').map(line => 'yerna: ' + line).join('\n');
  } else {
    return 'yerna: <no error reason provided>';
  }
}

module.exports = {
  attachGlobalErrorHandling,
  formatErrorForConsole
}
