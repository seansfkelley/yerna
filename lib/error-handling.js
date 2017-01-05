// Copyright 2017 Palantir Technologies Inc.

// ************************************************
// THIS FILE SHOULD HAVE NO IMPORTS OR SIDE EFFECTS
//
// It must be safe to import and call this file from
// anywhere so the user can get error messages even
// if everything is on fire.
// ************************************************

function attachGlobalErrorHandling() {
  const BG_RED = '\u001b[41m';

  function logAndDie(e) {
    console.error(BG_RED + formatErrorForConsole(e));
    console.error(BG_RED + 'yerna: unexpected error, exiting suddenly!');
    console.error(BG_RED + 'yerna: package.jsons or links may be in an inconsistent state');
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
