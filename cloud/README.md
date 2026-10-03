# Free personal cloud setup

1. Create a Free project named `run-companion` at https://supabase.com/dashboard.
2. Open SQL Editor and run `setup.sql` from this folder. This enables per-user access rules.
3. In Authentication > Users, choose Add user > Create new user. Use your email and a strong password; mark your own account confirmed. Keep the password private. This creates your personal app login without configuring an email delivery service.
4. Copy the Project URL and **publishable** API key into `dist/cloud-config.js`. These public connection values can be committed. Never use a secret/service_role key.
5. Publish the website, sign in on Windows, and tap **Enable sync on this device**. Existing completed runs and imported summaries are uploaded privately. Sign in with the same app account on your phone and enable sync there.

Future completed runs/imports sync automatically while signed in. Sync now retrieves changes from other devices. Offline records stay local and retry on reconnect. The active timer, plan settings, original TCX/GPX files, and route coordinates are not synced in this first version. The browser caches the latest 100 records of each kind; older records remain in Supabase.

This personal version binds a browser's journal to its first cloud account. To use another account, use a separate browser profile. Signing out stops sync but leaves the local journal on the device.

Supabase's Free plan currently includes a 500 MB database. Inactive free projects can pause after a week; resume them in the dashboard. Keep separate backups of original activity exports. This SQL source is prepared but must be applied and verified on your actual project before cloud use.
