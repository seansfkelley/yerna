// Copyright 2017 Palantir Technologies Inc.

const winston = require('winston');
const fs = require('fs');
const path = require('path');

const LOG_FILENAME = path.resolve('yerna.log');

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      showLevel: false
    }),
    new winston.transports.File({
      filename: LOG_FILENAME,
      json: false,
      level: 'debug'
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
  deleteLogFile,
  LOG_FILENAME
};
