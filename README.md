# Run Companion — browser prototype

Static phone-friendly app. Plan distance and target pace, run a pauseable timer, optionally track distance with phone GPS, hear coaching, and save runs on this browser/device. No backend, Garmin connection, or cloud AI calls. GitHub Pages publishing is configured for the user's authorized public website; run data stays in browser local storage.

Use Safari on iPhone/iPad. Keep the page visible and screen unlocked for coaching. Screen wake lock is requested when supported but may be refused. Browser suspension can delay or stop speech. Elapsed time catches up after returning to the page. Reloading recovers the last saved elapsed time (saved every 10 seconds) as paused; it does not count time spent after the last saved snapshot.

History stays local to the browser and device; it does not sync to the iOS app or other devices. Average split pace uses completed-mile times only. GPS runs include measured partial distance; manual runs do not. Coaching compares your chosen pace only and does not assess physiological readiness.

Source: `dist/index.html`, `dist/style.css`, `dist/app.js`, `dist/gps.js`. Static hosting manifest: `.openai/hosting.json`. WebMCP is feature-detected and exposes read status and configure plan only. Unsupported browsers operate normally.

## GPS v0.2

Enable Use phone GPS before starting, permit location, and wait outdoors for accuracy within 25 meters. The timer starts after the initial acceptable fix. Latitude/longitude are held only in memory; saved records contain total meters, mile splits, and a gap flag, never a route or coordinates. Location is not transmitted to a server.

Distance uses Haversine segments with a small movement noise floor. Readings older than 8 seconds, accuracy worse than 25 meters, and jumps above 8 m/s are excluded. Gaps longer than 15 seconds reset the position anchor rather than invent distance. Stopping, hiding the page, pausing, and resuming reset pace smoothing. Hidden-page movement is not counted; the saved gap flag makes this visible. GPS can undercount distance around curves or through rejected fixes.

Recent pace uses approximately 30 seconds of accepted readings and requires at least 20 seconds and 30 meters. Corrections require more than 25 seconds/mile deviation for 20 seconds, with at least 90 seconds between pacing cues. Mile crossings interpolate times between accepted readings. Synthetic distance, noise, gap, pause, recovery, and history checks passed; physical iPhone GPS, battery use, and speech still require an outdoor test alongside the Forerunner 165.

## GitHub Pages

Enable Pages in repository Settings > Pages with source GitHub Actions. The Publish browser app workflow publishes `dist` on main-branch pushes and can be started manually. No Apple developer membership or signing keys are needed. Open the resulting URL in Safari on the iPhone, then use Share > Add to Home Screen if desired. No service worker is installed; this version requires connectivity when opening the page.
