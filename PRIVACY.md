# Privacy Policy for 1-click timer

Last updated: 1 November 2026

1-click timer is a Chrome and Firefox extension by Alex Ewerlöf. It is a countdown timer and
nothing else: it does not collect, sell or share personal data. There are no
accounts, no analytics and no telemetry.

The Firefox port is maintained at
<https://github.com/AdrianTM/1-click-timer>. Its support and privacy contact is
<https://github.com/AdrianTM/1-click-timer/issues>.

## What the extension stores

The extension stores:

- **The timer** — when it ends, how long it was set for, and whether it is
  running, paused or finished.
- **Your preferences** — appearance (light, dark or device), alarm volume, chosen
  chime, mute, and the colour you picked for the remaining time.
- **A local alarm heartbeat in Firefox** — a changing internal marker written
  while the alarm rings, so its audio keeps playing. It contains no personal
  information and is never synced or transmitted by the extension.

That is the complete list. The extension does not read your browsing history, the
pages you visit, what you type, or anything else.

## How it is stored

The timer is kept in your browser's local extension storage, on your own device.

Your preferences use your browser's synced extension storage, with local storage
as a fallback. If you enable browser sync, Google (Chrome) or Mozilla (Firefox)
may sync preferences through your own browser account. Chrome and Firefox data
remain separate. This is managed by your browser under
[Google's privacy policy](https://policies.google.com/privacy) or
[Mozilla's privacy notice](https://www.mozilla.org/privacy/firefox/).
The extension's author never receives it and has no way to read it. You can
manage syncing and synced data in your browser's settings.

## How it is used

Only to run the timer and to draw it the way you asked: showing the remaining
minutes on the toolbar badge, restoring a running timer after your browser restarts, and
playing the alarm you chose.

## Third-party services

None. The extension makes no network requests, uses no analytics or crash
reporting, and contains no advertising or tracking code.

The settings screen links to three external pages: the author's website, the
project's source code, and its issue tracker. Nothing at all is sent to those
pages unless you click a link — your browser simply opens the page, and that
site's own privacy policy applies from then on.

## Data sharing

No data is shared, sold or transferred to anyone. The extension's author has no
access to any of the data described above.

## Data retention and deletion

Stored data is kept only until you remove it:

- Uninstalling the extension deletes the locally stored timer and alarm marker.
- Synced preferences can be managed in your browser's own settings, including switching off
  syncing for extensions.

## Changes to this policy

If this policy changes, the date at the top of this page changes with it. Material
changes are also noted in the release notes of the version that introduces them.

## Contact

For questions about the Firefox port, open an issue at
<https://github.com/AdrianTM/1-click-timer/issues>.

For the original Chrome extension, write to
<hello@alexewerlof.com>, or open an issue at
<https://github.com/alexewerlof/1-click-timer/issues>.
