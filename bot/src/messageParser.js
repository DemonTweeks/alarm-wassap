'use strict';

// Supported commands:
//   alarm <SITE>   — query active alarms for a 4-char alphanumeric site code
//   check <SITE>   — same as alarm
const ALARM_RE = /^(alarm|check)\s+([A-Za-z0-9]{4})\s*$/i;
const HELP_RE = /^(help|\?)$/i;

function parse(text) {
  const trimmed = (text || '').trim();

  const alarmMatch = trimmed.match(ALARM_RE);
  if (alarmMatch) {
    return { intent: 'alarm', site: alarmMatch[2].toUpperCase() };
  }

  if (HELP_RE.test(trimmed)) {
    return { intent: 'help' };
  }

  return null;
}

module.exports = { parse };
