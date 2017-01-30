// Copyright 2017 Palantir Technologies Inc.

const winston = require('winston');
const fs = require('fs');

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
  if (fs.existsSync(LOG_FILENAME)) {
    fs.unlinkSync(LOG_FILENAME);
  }
}

module.exports = {
  logger,
  deleteLogFile
};
