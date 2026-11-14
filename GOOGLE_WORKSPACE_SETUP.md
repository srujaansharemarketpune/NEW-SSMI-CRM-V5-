# SSMI CRM — Google Workspace setup

The application uses the institute Google account as its default account hint:
`srujaansharemarketpune@gmail.com`.

Google sign-in is not silently forced to that account. The OAuth flow pre-fills the account hint and shows the account chooser; the user must select the institute account and approve any new permissions.

## Google Workspace features present in the code

- Google Sheets: create spreadsheets and write Students and Leads CRM tabs.
- Google Forms: read form metadata and form responses.
- Google Drive: list Docs and manage app-created/opened files.
- Google Docs: create reports, read document content, append report text.
- Google Tasks: list, create and complete tasks.
- Google Apps Script: push/pull CRM rows through the configured Web App endpoint.

Gmail and Google Calendar are not implemented as API integrations in this repository; do not display them as connected until dedicated flows are built.

## OAuth scopes requested by the Workspace sign-in flow

- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/forms.body.readonly`
- `https://www.googleapis.com/auth/forms.responses.readonly`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/tasks`

The user must grant consent. API calls also require the corresponding APIs to be enabled in the Google Cloud project used by the OAuth/Firebase configuration:

- Google Drive API
- Google Docs API
- Google Sheets API
- Google Forms API
- Google Tasks API

The OAuth consent screen must be configured for the app's audience and the institute account must be permitted as a test user if the app is in testing. Sensitive/restricted scope verification may be required before public use.

## Institute inquiry form

The default inquiry form is configured to the institute's supplied published form URL. Form URLs in the published `/forms/d/e/<id>/viewform` format are parsed by the application.

## Master spreadsheet

No verified master spreadsheet ID was supplied in this repository configuration. The fake placeholder ID has been removed. Create/select the real master spreadsheet while signed in as the institute account, then save its actual URL in the integration settings. The Google Sheets export flow can create a new spreadsheet in the signed-in user's Drive.

## Apps Script endpoint

The Apps Script Web App endpoint is configured separately. It must be deployed from the institute account with the correct execution identity and access settings. The application cannot grant Google permissions or deploy Apps Script on the account owner's behalf.

## Security

Do not commit OAuth client secrets, refresh tokens, or API keys. Keep server-side secrets in a secret manager. Review scopes before granting consent.
