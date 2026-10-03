# Run Companion — browser prototype

Static phone-friendly app. Plan distance and target pace, run a pauseable timer, mark full miles, hear five-minute check-ins and split feedback, and save runs on this browser/device. No backend, account data import, GPS, Garmin, or cloud AI calls. GitHub Pages publishing is configured for the user's authorized public website; runtime run data stays in browser local storage.

Use Safari on iPhone/iPad. Keep the page visible and screen unlocked for coaching. Screen wake lock is requested when supported but may be refused. Browser suspension can delay or stop speech. Elapsed time catches up after returning to the page. Reloading recovers the last saved elapsed time (saved every 10 seconds) as paused; it does not count time spent after the last saved snapshot.

History stays local to the browser and device; it does not sync to the iOS app or other devices. Average split pace uses completed-mile times only. Partial distance is not measured. Coaching compares your chosen pace only and does not assess physiological readiness.

Source: `dist/index.html`, `dist/style.css`, `dist/app.js`. Static hosting manifest: `.openai/hosting.json`. WebMCP is feature-detected and exposes read status and configure plan only. Unsupported browsers operate normally.

## GitHub Pages

Enable Pages in repository Settings > Pages with source GitHub Actions. The Publish browser app workflow publishes `dist` on main-branch pushes and can be started manually. No Apple developer membership or signing keys are needed. Open the resulting URL in Safari on the iPhone, then use Share > Add to Home Screen if desired. No service worker is installed; this version requires connectivity when opening the page.
