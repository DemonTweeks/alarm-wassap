'use strict';

// Filter defaults — override in bot/.env
// WA_FILTER_VISIBLE   : 'all' | '0' | '1'   (default: '1' — visible alarms only)
// WA_FILTER_MAINTAIN  : 'all' | '0' | '1' | '2'  (default: '0' — non-maintenance only)
const FILTER_VISIBLE  = process.env.WA_FILTER_VISIBLE  ?? '1';
const FILTER_MAINTAIN = process.env.WA_FILTER_MAINTAIN ?? '0';

function filterAlarms(alarms) {
  return alarms.filter(a => {
    if (FILTER_VISIBLE !== 'all') {
      if (String(a.visible ?? '') !== FILTER_VISIBLE) return false;
    }
    if (FILTER_MAINTAIN !== 'all') {
      const ms = String(a.maintainstatus?.value ?? a.maintainstatus ?? '');
      if (ms !== FILTER_MAINTAIN) return false;
    }
    return true;
  });
}

function getSeverityOrder(alarm) {
  return alarm.perceivedseverity != null ? alarm.perceivedseverity : 99;
}

function getSeverity(alarm) {
  return alarm.perceivedseverityname || 'UNKNOWN';
}

function getName(alarm)     { return alarm.codename || '(no name)'; }
function getNe(alarm)       { return alarm.mename || alarm._ne_name || '—'; }
function getLocation(alarm) { return alarm.ran_fm_alarm_location?.displayname || ''; }
function getDn(alarm)       { return alarm.ran_fm_alarm_dn?.value || alarm.dn || ''; }

function getTime(alarm) {
  const ms = alarm.alarmraisedtime;
  if (!ms) return '';
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  const myt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${myt.getUTCFullYear()}-${pad(myt.getUTCMonth()+1)}-${pad(myt.getUTCDate())} ` +
         `${pad(myt.getUTCHours())}:${pad(myt.getUTCMinutes())} MYT`;
}

function sortAlarms(alarms) {
  return [...alarms].sort((a, b) => getSeverityOrder(a) - getSeverityOrder(b));
}

function formatAlarmReply(result) {
  if (!result.found) {
    return (
      `⚠️ *${result.site}* not found in topology cache.\n` +
      `Try refreshing topology via the dashboard (http://localhost:8000).`
    );
  }

  const total = result.alarms?.length ?? 0;
  const filtered = filterAlarms(result.alarms || []);

  if (total === 0) {
    return `✅ *${result.site}* — No active alarms (${result.ne_count} NE checked)`;
  }

  if (filtered.length === 0) {
    return (
      `✅ *${result.site}* — No alarms after filter\n` +
      `_(${total} alarm${total !== 1 ? 's' : ''} total, filtered by visible=${FILTER_VISIBLE} maintain=${FILTER_MAINTAIN})_`
    );
  }

  const sorted = sortAlarms(filtered);
  const hiddenCount = total - filtered.length;

  const lines = [
    `🔔 *${result.site}* — ${sorted.length} alarm${sorted.length !== 1 ? 's' : ''}` +
    (hiddenCount > 0 ? ` _(${hiddenCount} filtered)_` : ''),
    '─────────────────────────',
  ];

  const ICON = { Critical: '🔴', Major: '🟠', Minor: '🟡', Warning: '🔵' };

  for (const alarm of sorted) {
    const sev = getSeverity(alarm);
    const icon = ICON[sev] || '⚪';
    lines.push(`${icon} [${sev.toUpperCase()}] ${getName(alarm)}`);
    lines.push(`   NE: ${getNe(alarm)}`);
    const t = getTime(alarm);
    if (t) lines.push(`   Time: ${t}`);
    const loc = getLocation(alarm);
    if (loc) lines.push(`   Location: ${loc}`);
    const dn = getDn(alarm);
    if (dn) lines.push(`   DN: ${dn}`);
    if (alarm.durationname) lines.push(`   Duration: ${alarm.durationname}`);
  }

  return lines.join('\n');
}

function formatHelp() {
  return (
    '*ZTE UME Alarm Bot*\n' +
    '─────────────────\n' +
    '`alarm STLK` or `check LRD1` — query active alarms for a 4-char site code\n' +
    '`help` — show this message'
  );
}

module.exports = { formatAlarmReply, formatHelp };
