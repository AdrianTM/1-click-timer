# Firefox Add-ons submission — 1-click timer

Prepared 2026-11-01 for version **9.0.0**. This is the Firefox port of Alex
Ewerlöf's GPL-3.0 project, maintained in
<https://github.com/AdrianTM/1-click-timer>. Preserve the original attribution;
the Mozilla Account submitting this port is its publisher. No AMO listing or
Mozilla-signed download has been created by the release commands.

## Release files

Run `npm run release:firefox` from the repository root. It runs the required
checks, builds and validates Firefox, and creates these separate uploads:

| File | AMO use |
| --- | --- |
| `dashboard/package/1-click-timer-9.0.0-firefox.zip` | Extension upload |
| `dashboard/package/1-click-timer-9.0.0-firefox-source.zip` | Source code upload for reviewers |
| `dist-firefox/images/icon128.png` | Listing icon |

The source archive contains `BUILD-FIREFOX.md` with the actual Node/npm versions
used for packaging and the exact commands `npm ci` and `npm run build:firefox`.
It contains source, build scripts, configuration, the dependency lockfile and
license; dependencies, generated builds, credentials and Git metadata are excluded.
Run `npm run source:firefox` to recreate only this archive.

## Listing fields

| Field | Value |
| --- | --- |
| Name | 1-click timer |
| Version | 9.0.0 |
| Primary language | English |
| Suggested category | Other (productivity timer) |
| License | GNU General Public License v3.0 |
| Homepage | https://github.com/AdrianTM/1-click-timer |
| Support website | https://github.com/AdrianTM/1-click-timer/issues |
| Platforms | Desktop Firefox: Linux, macOS and Windows; exclude Android |
| Minimum Firefox | 140.0 |
| Add-on ID | `{1e399e5e-c937-434a-b288-ebacad6f64ba}` — preserve on future updates |

Use an email address you monitor if AMO asks for a support email. The original
author's address in `PRIVACY.md` is not the Firefox port maintainer's address.
AMO assigns the listing URL; check its proposed slug for availability.

### Summary

```text
Start a countdown with one click. See time left on a visual dial and toolbar badge, with a chime when time is up.
```

### Description

```text
Set a countdown timer in one click: move over the dial to preview a duration,
then click to start. Or click a numeral to start that many minutes.

• Set timers up to 60 minutes without typing.
• Keep counting when you close the popup.
• See the minutes left on the toolbar badge, changing from green to red.
• Hear your chosen alarm chime even when the popup is closed.
• Choose an alarm length from 5 seconds to 5 minutes.
• Bring the timer to the front when time is up.
• Pause, resume, stop or restart from the timer's controls.
• Open a full-screen timer you can watch from across the room.
• Choose light, dark or system appearance, and customize the remaining-time colour.

When the timer finishes, click its notification to return to the timer.
Use the timer's Stop or Restart controls to silence the alarm. Closing the
Firefox notification does not stop the sound; the selected ring length still
limits how long it plays.

No account required, no advertising, no analytics and no browsing data access.
Your timer is stored locally. Preferences may sync through your own Firefox
Account if browser sync is enabled; the extension publisher does not receive them.

Firefox port of Alex Ewerlöf's open-source 1-click timer, licensed under GPL-3.0.
Support and source: https://github.com/AdrianTM/1-click-timer
```

### Version notes

```text
Initial Firefox release of the modern 1-click timer: a one-click visual dial,
background countdown, toolbar badge, configurable alarm chimes, a full-screen
view, and light/dark appearance. Includes Firefox-specific alarm playback and
notification behavior.
```

## Permissions and privacy

| Permission | Purpose |
| --- | --- |
| `alarms` | Wake the background timer when the countdown ends and update its badge. |
| `notifications` | Display the time-up notification; clicking it opens or focuses the timer. |
| `storage` | Save the countdown, preferences and a temporary local alarm heartbeat. |

There are no host permissions, content scripts, browsing-history access, or
Chrome `offscreen` permission in the Firefox manifest. The data collection
declaration is `required: ["none"]`. There is no telemetry, advertising, remote
code, or developer-operated backend. Browser-managed preference sync is disclosed
in `PRIVACY.md` and does not send data to the extension publisher.

If AMO asks for privacy policy text, paste `PRIVACY.md`, which identifies the
Firefox port's support and privacy contact separately from the original author.
If a URL is
requested, publish the matching policy in the fork and verify that URL loads.

## Notes for reviewers

```text
This submission is a Firefox desktop port of the GPL-3.0 project
https://github.com/alexewerlof/1-click-timer . The maintained Firefox source is
https://github.com/AdrianTM/1-click-timer . Original attribution and license are retained.

No login, test account, payment, remote service or website access is required.
Click the toolbar icon and click a duration on the dial. Close the popup;
the countdown continues. When it finishes, the timer comes forward and sounds
the selected chime. Use Stop or Restart in the timer to handle the alarm.
Firefox notifications have no buttons; dismissing one does not stop the alarm.

Source build: extract the separate source archive, follow BUILD-FIREFOX.md,
then run npm ci and npm run build:firefox. Output: dist-firefox/.
Vite bundles React, Lucide and the TypeScript source. Icon PNGs are rendered
from the included SVGs by @resvg/resvg-js. package-lock.json pins dependencies.
There is no obfuscation or remotely hosted runtime code.

Known web-ext validator warnings:
- The Android data-disclosure warning does not apply to this desktop-only release.
- chrome.offscreen references are shared Chrome compatibility code guarded by
  hasOffscreenApi() in src/background/ring.ts. Firefox plays Web Audio directly
  in its module background event page and never enters the Chrome offscreen branch.
- The two innerHTML warnings are in bundled React DOM internals. The app does
  not use dangerouslySetInnerHTML or inject user-provided markup.

Firefox's audio host writes a local heartbeat every 20 seconds only while an
alarm rings. It contains no personal data, is never synced, and is bounded by
the persisted ring deadline. Stop, restart, mute and natural completion clear it.
The runtime/background tests cover the relevant timer and alarm logic.
```

## Submit on AMO

1. Sign in to <https://addons.mozilla.org/developers/> with the publishing
   Mozilla Account, review its display name and accept the developer agreement.
2. Choose **Submit a New Add-on** → **On this site** for a public AMO listing.
3. Upload the extension ZIP, then review AMO's validation results. The local
   validator currently reports zero errors and six warnings explained above;
   AMO may use a different validator version.
4. Select desktop Firefox platforms. Do not select Android.
5. Indicate that build source is provided and upload the separate source ZIP.
6. Fill the listing from this document. Choose the closest available category,
   upload the icon, set the GPL-3.0 license and complete the privacy questions.
7. Paste the reviewer notes. Review the entire submission before selecting
   **Submit Version**, which sends it to Mozilla for signing/publication.
8. Record the assigned AMO URL here after submission. For subsequent versions,
   upload through that existing listing and keep the same add-on ID.

## Remaining manual release checks

Preparation checks on 2026-11-01 passed: ESLint, TypeScript, all 151 unit tests,
Firefox build, and web-ext validation (zero errors, six warnings). A clean
extraction of the source archive was built using `npm ci` and
`npm run build:firefox`; all 18 packaged files matched the extension ZIP byte
for byte. Build environment: Debian 13 x86_64, Node 22.23.0, npm 10.9.8.

The local temporary-install smoke test passed according to the maintainer.
Before publication, check native notification clicks, OS sleep/wake, a running
timer and expiry across browser restart using a signed test install (or a
development build permitting permanent unsigned add-ons), and preference sync
with/without a Firefox Account. Temporary installs do not establish restart behavior.
Keep the background debugger closed for audio-host lifecycle tests and test both
60-second and 300-second rings. See `CONTRIBUTING.md` for the complete checks.

For listing screenshots, capture the current Firefox extension's running timer,
dark appearance and settings. Avoid Chrome notification buttons or browser chrome
in Firefox screenshots. `npm run screenshots` currently captures Chrome only;
it is not a Firefox gallery generator. Screenshots have not been generated for
this submission yet.

Official references checked for this preparation:

- <https://extensionworkshop.com/documentation/publish/submitting-an-add-on/>
- <https://extensionworkshop.com/documentation/publish/source-code-submission/>
