
## MOSAIC live-event changes: manual stages, penalties, Google Sheets

### Stage 2 scanner removed

The app now routes only to the setup screen, central mission control, and operator console. The standalone `/stage2/:id` scanner route is no longer exposed. Stage 2 is completed manually from the central mission-control screen after the physical challenge is finished. The operator console retains secure final-phrase configuration.

### Penalties

Stage-specific penalties are fixed: Stage 1 uses a dropdown from 0–10, with 3 seconds per penalty; Stage 2 uses a dropdown from 0–4, with 15 seconds per penalty. Stage 3 has a separate 3-minute countdown that begins when Stage 2 is marked complete. If the countdown expires, an overtime counter starts at 00:00:01 and counts upward while the main mission timer continues. The Stage 3 overtime penalty defaults to 15 seconds after the limit and can be manually changed to 30 or 45 seconds. Penalty selections are stored in the operator browser for the current session. The final display and result export use:

`adjusted time = raw elapsed time + (Stage 1 penalties × 3) + (Stage 2 penalties × 15) + Stage 3 overtime penalty`

The Google Sheet receives raw time, Stage 3 duration and overtime, penalty count/seconds by stage, total penalty time, adjusted time, stage timestamps, team name/code, and session ID. Reset clears stage progress and penalties; it does not delete spreadsheet rows. A new session creates a separate result row. If you reset and replay the same session, the sheet updates that session's existing row rather than creating a duplicate.

### Connect the supplied Google spreadsheet

The Google Drive connector could not be used to inspect the sheet's existing column layout from this chat. To avoid overwriting your existing tabs, the supplied Apps Script integration creates/uses a dedicated **Mission Results** tab in the spreadsheet you shared.

1. Open the spreadsheet you shared with ChatGPT.
2. Choose **Extensions → Apps Script**.
3. Replace the editor contents with `google-apps-script/Code.gs` from this project.
4. Save the Apps Script project.
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as** to your account. Set access to the option your event account permits for your intended users (typically anyone with the link for this event-only endpoint). Deploy and authorize access to the spreadsheet.
7. Copy the Web app URL ending in `/exec`.
8. Create a `.env` file in the project root (copy `.env.example`) and set:

   `VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`

9. Restart/rebuild the app after changing `.env`.
10. Complete a test mission and confirm that one row appears in **Mission Results**.

The Apps Script uses the spreadsheet ID supplied in the integration and de-duplicates by session ID. The browser's cross-origin request may not be able to read the Apps Script response, so the UI confirms that the request was sent, not that Google acknowledged the write. Verify the first test row before using it live. Treat the deployed web-app URL as event configuration and redeploy if you change the script's access settings.

### Supabase migration

If using Supabase, run `supabase/migrations/0002_manual_stages_and_reset.sql` after `0001_mission_control.sql`. This adds manual Stage 2 completion and permits an authorized session token or admin to reset a session, including a completed session. Do not use demo mode for two-device or multi-operator production use.

### Build verification

Run `npm install`, then `npm run build`. Also test a complete mission and a reset before event day. This environment has not verified a production build because dependencies were not installed here.
