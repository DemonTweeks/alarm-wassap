'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { parse } = require('./messageParser');
const { queryAlarm, saveConversationReply } = require('./middlewareClient');
const { formatAlarmReply, formatHelp } = require('./formatter');
const { logger } = require('./logger');

function createBot() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    logger.info('Scan the QR code below to log in:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    logger.info('WhatsApp bot is ready');
  });

  client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
    process.exit(1);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;

    const parsed = parse(msg.body);
    if (!parsed) return;

    logger.info(`Command from ${msg.from}: ${msg.body.trim()}`);

    if (parsed.intent === 'help') {
      await msg.reply(formatHelp());
      return;
    }

    if (parsed.intent === 'alarm') {
      await msg.reply(`_Checking alarms for *${parsed.site}*..._`);
      try {
        const contact = await msg.getContact();
        const contactName = contact.pushname || contact.name || '';
        const result = await queryAlarm(parsed.site, {
          chatId: msg.from,
          messageId: msg.id._serialized,
          body: msg.body.trim(),
          contactName,
        });
        const reply = formatAlarmReply(result);
        await msg.reply(reply);
        await saveConversationReply(msg.from, reply, {
          site: parsed.site,
          alarm_count: result.alarms?.length ?? 0,
        });
      } catch (err) {
        logger.error('Alarm query error:', err.message);
        await msg.reply(`❌ Failed to query alarms: ${err.message}`);
      }
    }
  });

  return client;
}

module.exports = { createBot };
