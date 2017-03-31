// Copyright 2017 Palantir Technologies Inc.

const winston = require('winston');
const fs = require('fs');
const path = require('path');

const LOG_FILENAME = path.resolve('yerna.log');

const ANSI_COLOR_CODE_REGEX = /\u001b\[(\d+(;\d+)*)?m/g;

function stripColors(s) {
  return s ? s.replace(ANSI_COLOR_CODE_REGEX, '') : s;
}

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      showLevel: false
    }),
    new winston.transports.File({
      filename: LOG_FILENAME,
      json: false,
      level: 'debug',
      formatter: ({ timestamp, message, level }) => `${(new Date).toISOString()} - ${level}: ${stripColors(message)}`
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
