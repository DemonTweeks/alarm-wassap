'use strict';

require('dotenv').config();
const { createBot } = require('./whatsapp');
const { logger } = require('./logger');

const bot = createBot();
bot.initialize();

async function shutdown() {
  logger.info('Shutting down bot...');
  await bot.destroy();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
