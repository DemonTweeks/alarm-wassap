'use strict';

const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logStream = fs.createWriteStream(path.join(logDir, 'bot.log'), { flags: 'a' });

function timestamp() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA');
  const time = now.toTimeString().slice(0, 8);
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${date} ${time}.${ms}`;
}

function write(level, args) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const line = `${timestamp()} [${level}] ${msg}`;
  logStream.write(line + '\n');
  return line;
}

const logger = {
  info:  (...a) => console.log(write('INFO', a)),
  warn:  (...a) => console.warn(write('WARN', a)),
  error: (...a) => console.error(write('ERR', a)),
};

module.exports = { logger };
