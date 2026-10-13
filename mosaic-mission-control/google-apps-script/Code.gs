/**
 * MOSAIC 2026 result recorder.
 * Deploy as a Web App, execute as the spreadsheet owner, and paste the /exec URL into VITE_GOOGLE_APPS_SCRIPT_URL.
 * It creates/uses a dedicated "Mission Results" tab so existing tabs are not overwritten.
 */
const SPREADSHEET_ID = 'https://docs.google.com/spreadsheets/d/1EDjRRfjk7X2kZKeccGe4dKGB0zQB7acFMNsVAGvL29c/edit?usp=sharing';
const SHEET_NAME = 'Mission Results';
const HEADERS = [
  'Session ID','Team Name','Team Code','Started At','Stage 1 Completed At','Stage 2 Completed At','Completed At',
  'Stage 3 Duration','Stage 3 Overtime','Raw Time','Raw Seconds','Stage 1 Penalties','Stage 1 Penalty Seconds','Stage 2 Penalties','Stage 2 Penalty Seconds',
  'Stage 3 Overtime Penalty Seconds','Stage 3 Penalty Seconds','Stage 1 + 2 Penalty Count','Total Penalty Time','Total Penalty Seconds',
  'Adjusted Final Time','Adjusted Seconds','Displayed Result','Recorded At'
];
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!payload.sessionId || !payload.teamName || !payload.completedAt) throw new Error('Missing required mission result fields.');
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
      const existing = ids.indexOf(String(payload.sessionId));
      if (existing !== -1) {
        const row = existing + 2;
        sheet.getRange(row, 1, 1, HEADERS.length).setValues([toRow(payload)]);
        return output({ ok: true, updated: true, sessionId: payload.sessionId });
      }
    }
    sheet.appendRow(toRow(payload));
    return output({ ok: true, appended: true, sessionId: payload.sessionId });
  } catch (err) {
    return output({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
function toRow(p) {
  return [p.sessionId,p.teamName,p.teamCode,p.startedAt,p.stage1CompletedAt,p.stage2CompletedAt,p.completedAt,
    p.stage3Duration,p.stage3Overtime,p.rawTime,p.rawSeconds,p.stage1Penalties,p.stage1PenaltySeconds,p.stage2Penalties,p.stage2PenaltySeconds,
    p.stage3Penalties,p.stage3PenaltySeconds,p.totalPenaltyCount,p.penaltyTime,p.totalPenaltySeconds,
    p.adjustedTime,p.adjustedSeconds,p.displayedResult,new Date()];
}
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
