'use strict';

const axios = require('axios');

const BASE_URL = process.env.MIDDLEWARE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

async function queryAlarm(site, meta = {}) {
  const res = await client.post('/api/alarm/query', {
    site,
    wa_chat_id: meta.chatId || null,
    wa_message_id: meta.messageId || null,
    wa_body: meta.body || null,
    wa_contact_name: meta.contactName || null,
  });
  return res.data;
}

async function saveConversationReply(sessionId, body, metadata = {}) {
  try {
    await client.post('/api/conversations/messages', {
      session_id: sessionId,
      direction: 'outbound',
      body,
      metadata,
    });
  } catch (err) {
    // non-critical — don't propagate
  }
}

module.exports = { queryAlarm, saveConversationReply };
