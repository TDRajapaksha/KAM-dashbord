# Google Sheets response sync setup

The Excel download remains a snapshot. Google Sheets sync is separate: after
the project owner connects a sheet, existing responses are copied once and
new or edited response rows are mirrored by a Supabase Database Webhook.

## 1. Configure server environment variables

Set these variables in the local server environment and production deployment.
Do not use a `NEXT_PUBLIC_` prefix for secrets:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs the HttpOnly application session cookie; use a random value of at least 32 characters. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only access to the project, response, and Google connection tables. |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 web client ID. |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 web client secret. |
| `GOOGLE_REDIRECT_URI` | Exact callback URL: `https://<your-domain>/api/google-sheets/callback`. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Base64-encoded random 32-byte key used to encrypt refresh tokens at rest. |
| `SHEETS_WEBHOOK_SECRET` | Random secret used to authenticate Supabase webhook requests. |

Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` values configured. Use separate random values
for the session, token-encryption, and webhook secrets. Never commit them.

## 2. Configure Google OAuth

In Google Cloud:

1. Enable the Google Sheets API for the Cloud project.
2. Configure the OAuth consent screen and add the intended users as test users
   while the app is in testing.
3. Create an OAuth client ID for a Web application.
4. Add the deployed callback URL from `GOOGLE_REDIRECT_URI` to its authorized
   redirect URIs.
5. Add the client ID and secret to the server environment.

The project owner must have edit access to the spreadsheet they connect.
Google may require OAuth app verification before external users can authorize
the sensitive Sheets scope. OAuth apps left in testing mode may issue refresh
tokens that expire after seven days.

## 3. Apply the Supabase migration

Apply `supabase/migrations/20261110000000_google_sheets_sync.sql` to the
Supabase project. The connection table has row-level security enabled and is
accessible only from the server with the service-role key.

## 4. Configure live response events

In Supabase, create a Database Webhook for the `public.responses` table:

- Events: `INSERT`, `UPDATE`, and `DELETE`
- Method: `POST`
- URL: `https://<your-domain>/api/webhooks/google-sheets`
- Header: `Authorization: Bearer <SHEETS_WEBHOOK_SECRET>`

The webhook endpoint ignores responses for projects without a connected sheet.
On a sync failure, it returns an error and records the last error in the
project's settings. Reconnecting the sheet runs a backfill and fills any
response rows that are missing from the sheet.

## 5. Connect a project

Sign in as the project owner, open **Project settings**, paste the Google
spreadsheet URL, and choose **Connect Google Sheets**. After Google
authorization, existing responses are copied and new submissions are synced.
The spreadsheet needs an empty tab named `Responses`; the app creates that tab
if it does not exist. The response ID column is used to avoid duplicating rows
when the initial backfill is retried.
