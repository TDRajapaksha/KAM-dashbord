# Media uploads

Media uploads use the `survey-media` Supabase Storage bucket. Apply
`supabase/migrations/20261110000001_survey_media_storage.sql` to the Supabase
project before uploading.

The server also needs `SUPABASE_SERVICE_ROLE_KEY` (legacy service-role key) or
`SUPABASE_SECRET_KEY` (new secret key). For local development, add one of these
to `.env.local` alongside `NEXT_PUBLIC_SUPABASE_URL`, then stop and restart the
development server. For deployment, configure it as a server-side environment
variable and redeploy. Never use a `NEXT_PUBLIC_` prefix for this key or expose
it in browser code.

Uploads are limited to 50 MB per file by the app. The Supabase Storage bucket's
configured file-size limit must also allow files of that size.
