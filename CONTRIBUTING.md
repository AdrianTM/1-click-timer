# Contributing to 1-click timer

Thanks for wanting to help. Bug reports and feature ideas are welcome, and so are
pull requests — please
[open an issue](https://github.com/alexewerlof/1-click-timer/issues) first for
anything large, so we can agree on the approach before you write it.

## Prerequisites

- Node.js ≥ 22.13 (see `engines` in `package.json`)
- Chrome, for loading the built extension
- Firefox 140 or newer, for the Firefox target

## Set up

```bash
npm install
npm run dev
```

`npm run dev` serves the interface with Vite at `/popup.html`, `/fullscreen.html`
and `/settings.html`. Vite prints the port, and moves to the next free one if 5173
is taken.

In a plain browser the `chrome.*` APIs do not exist, so `src/app/runtime/` falls
back to in-memory mocks (`mockRuntime.ts`, `mockSettings.ts`). The layout, the
themes and the settings screen all behave the same, which is what makes the browser
loop a fast way to work on the interface.

## Commands

| Command                      | What it does                                       |
| ---------------------------- | -------------------------------------------------- |
| `npm install`                | install dependencies                               |
| `npm run dev`                | Vite dev server → `/popup.html`, `/fullscreen.html`, `/settings.html` |
| `npm run build`              | build the unpacked extension into `dist/`          |
| `npm run build:firefox`      | build the Firefox extension into `dist-firefox/` |
| `npm run lint:firefox`       | validate `dist-firefox/` with Mozilla web-ext |
| `npm run dev:firefox`        | build and temporarily load the extension in Firefox; rebuild after source edits |
| `npm run package:firefox`    | ZIP the existing Firefox build into `dashboard/package/` |
| `npm run deploy:firefox`     | lint + typecheck + unit tests + Firefox build + web-ext lint + Firefox ZIP |
| `npm run deploy`             | lint + typecheck + test + build, then ZIP the release into `dashboard/package/` |
| `npm run release`            | `deploy`, then capture the store gallery (needs Playwright's Chromium) |
| `npm run lint`               | ESLint (flat config)                               |
| `npm run lint:fix`           | ESLint with `--fix`                                |
| `npm run typecheck`          | `tsc --noEmit`                                     |
| `npm test`                   | unit tests (node)                                  |
| `npm run test:visual`        | browser-mode visual tests (screenshot diff)        |
| `npm run test:interaction`   | numeral hit-target interactions in Chromium and Firefox |
| `npm run test:visual:update` | rewrite the screenshot baselines                   |
| `npm run screenshots`        | build, then capture the store gallery into `dashboard/screenshots/` |
| `npm run format`             | Prettier write                                     |
| `npm run format:check`       | Prettier check                                     |

Run `lint`, `typecheck` and `test` before considering a change done — or just
`npm run deploy`, which runs all three.

## Project layout

```
src/
  manifest.json        MV3 manifest
  popup.html           popup entry      (data-surface="popup")
  fullscreen.html      tab entry        (data-surface="fullscreen")
  settings.html        settings entry   (data-surface="settings")
  app/                 the React UI
    components/        TimerFace (the dial), TransportControls (the corners)
    design/            tokens.css (every colour and size), global.css, palette.ts
    lib/               dial geometry, time, links, chimes, fullscreen
    runtime/           the TimerRuntime + SettingsStore contracts, with a
                       chrome and a mock implementation each
  shared/              the timer protocol shared by the UI and the worker
  background/          the service worker (framework-free TypeScript)
  images/              icon.svg — the source art the build rasterises into
                       every PNG size Chrome loads
```

`src/AGENTS.md` documents the files in detail, and `AGENTS.md` covers the
architecture, the interface vocabulary and the traps.

## Testing

- `npm test` — the node project. Pure logic only: dial geometry, time formatting,
  the badge, settings, the worker's reducer, and a guard that keeps
  `manifest.json` and `package.json` in step.
- `npm run test:visual` — the browser project. Runs the real components in
  Chromium and compares screenshots, so CSS Modules and SVG rendering are actually
  exercised. It needs a browser once per machine:

```bash
npx playwright install chromium
```

Baselines live in `src/app/__screenshots__/`. Rewrite them with
`npm run test:visual:update`, but only when the change is meant to move the pixels.

## Conventions

- **Colours and sizes are tokens.** They live in `src/app/design/tokens.css`, and a
  component only ever references `var(--…)`. The exceptions are the values derived
  from the dial's geometry in `src/app/lib/dial.ts`.
- **The interface has one vocabulary.** The terms in `AGENTS.md` → UI vocabulary
  (face, dial, disc, tick, numeral, remaining sector, preview arc, readout…) are
  the words the code uses too, so a change asked for in one of them maps to a
  single place in the source.
- **Icons are Lucide** (`lucide-react`), never hand-drawn SVG. Lucide has no brand
  marks, so the GitHub link uses a code glyph.
- **Formatting is Prettier's job** — tabs, single quotes, no semicolons. Run
  `npm run format` rather than hand-formatting.
- **Keep the docs honest.** `AGENTS.md` is how an agent and the next person find
  their way around; update it when the layout or a convention changes.

## Release

```bash
npm run release
```

That is `npm run deploy` — the checks, the build, and
`dashboard/package/1-click-timer-<version>.zip`, the archive to upload to the Chrome
Web Store — followed by the store gallery capture (below), so what you upload and
what the listing shows are refreshed in one step.

Use plain `npm run deploy` when you only need the ZIP. It stops after packaging, so
it needs nothing but Node, while the gallery capture launches Playwright's own
Chromium — which is why the two are separate commands and not one.

The ZIP holds the contents of `dist/`, so `manifest.json` sits at the archive root.
Packaging prefers `zip(1)` and falls back to `python3`.

`CHROMEWEBSTORE.md` is the source of truth for the store listing, the permission
justifications and the privacy disclosure; `PRIVACY.md` is the policy the listing
links to. Bump the version in **both** `src/manifest.json` and `package.json` —
`src/manifest.test.ts` fails if they drift apart.

The version must also be **numerically higher than the one already published** to
the store (8.3.1 as of 2026-10-14), or the dashboard rejects the upload with
"Please make sure the newly uploaded package has a larger version in file
manifest.json than the published package". Being higher than the last *release in
this repo* is not the same thing — check the dashboard.

## The store gallery

```bash
npm run release
```

The listing's screenshots and the promo tiles are captured by
`scripts/store/capture.mjs` (run for you by `npm run release`): it loads the packed
extension in Playwright's Chromium and drives the timer into each state, so a shot
can never show an interface that no longer exists. It writes six screenshots plus
the two tiles — the six at 1280×800, which is the size the store prefers, and the
tiles at 440×280 and 1400×560. The store accepts **at most five screenshots**, so
`01-idle.png` is deliberately not uploaded; see `CHROMEWEBSTORE.md` for the upload
order. The images land in `dashboard/screenshots/`, which is gitignored —
reproducible on demand, and never a gallery that lies about the current interface.

## Try it in Chrome

1. `npm run build`
2. Open `chrome://extensions` and switch on Developer mode
3. Choose "Load unpacked" and select `dist/`

Debug logs are prefixed `[1-click-timer:sw]`. Read them from the service worker's
inspector, on the extension's card.

## Try it in Firefox

Run `npm run dev:firefox`, or build the Firefox target and open
`about:debugging` → This Firefox → Load Temporary Add-on, selecting
`dist-firefox/manifest.json`. Temporary installations disappear at browser exit.
Use the same `npm run dev` design preview for either browser.

Firefox runs the background as a non-persistent module event page. It plays Web
Audio there; Chrome retains its offscreen document. During a Firefox ring only,
a local heartbeat every 20 seconds generates a storage event to prevent the audio
host from idling. Stop/restart/mute, natural completion and failures clear the
heartbeat. The persisted `ringUntil` deadline bounds recovery after host loss.
Keep the background debugger closed when checking this behavior: a debugger can
mask lifecycle failures. Check both 60-second and 300-second rings.

Firefox notifications omit unsupported buttons and Chrome-only options. Clicking
one focuses the timer. Closing or timing out a notice does not reset the timer,
because Firefox does not report whether the user or system closed it. Use the
timer's Stop/Restart controls; the chosen ring duration still stops the sound.
An OS sound may accompany the chime. Firefox alarms are recreated on browser
startup. Badge ticks use 30 seconds where supported; Chrome 116–119 may clamp
them to one minute. Countdown expiry uses its own absolute alarm.

For genuine browser-restart tests use a signed test build or a Firefox development
build configured to permit unsigned permanent add-ons. Reinstalling a temporary
add-on is not equivalent. Check a running timer across restart, expiry while
closed, sleep/wake, event-page suspension, tab focus across windows and settings
persistence with and without a Firefox Account.

## Firefox release (AMO)

`npm run deploy:firefox` writes
`dashboard/package/1-click-timer-<version>-firefox.zip`, with `manifest.json` at
the archive root. The default Chrome build/release/gallery commands still target
`dist/`. Builds may be run in either order; output directories are separate.

The generated manifest removes Chrome's worker and offscreen permission, adds a
module event page, and declares the permanent add-on ID
`{1e399e5e-c937-434a-b288-ebacad6f64ba}`. Do not change it after publication.
Firefox 140 is the minimum for the AMO-required data-disclosure manifest field;
Firefox 127 rejects that field during installation. The surface discovery API
itself is available from 127. No `tabs` or host permissions are required.

Submit the Firefox ZIP manually to addons.mozilla.org. Normal distribution,
including self-distribution, requires Mozilla signing. Select desktop Firefox;
Android is outside this port. No AMO listing or signed download is published by
these commands. The manifest's `data_collection_permissions.required: ['none']`
declares that the extension collects no user data; browser-managed settings sync
is separate from collection by the extension author. See `PRIVACY.md`.

For Mozilla's source review, provide a source archive containing the TypeScript,
HTML/CSS/SVG, build scripts/configs, `package.json` and `package-lock.json`, with
Node >=22.13 and the exact commands `npm ci` and `npm run build:firefox`.
Exclude dependencies, generated output, credentials and VCS metadata. Record the
actual Node/npm versions used to build the submitted ZIP. AMO's review may ask
for this source because Vite bundles the application and React.

`web-ext lint` must have no errors. Review warnings rather than suppressing them:
Android's disclosure support starts at 142 (Android is outside this port), guarded
Chrome offscreen calls remain in shared code, and bundled React contains internal
`innerHTML` assignments. Recheck these warnings with each web-ext update.

### Port validation (2026-10-17)

The port was checked with Node 22.23.0 and npm 10.9.8: lint, typecheck, 151 unit
tests, both build/package flows, and four real-pointer interaction checks across
Chromium and Firefox. The Firefox package passed web-ext 10.8.0 with no errors
and six warnings described above.

An isolated Firefox 158 profile, with the add-on debugger closed and no timer
surface initially open, completed a 300-second alarm. Web Audio entered its
running state and kept scheduling notes through all 14 heartbeats, then stopped
at the persisted deadline and cleared `ringUntil`. Chromium's real extension
test checked offscreen creation, natural completion/closure, restart and reset.

The Chrome visual suite has seven pre-existing failures here (six text screenshot
comparisons and the readout fit assertion). An untouched HEAD checkout reproduces
all seven, and the six actual screenshots are byte-identical between that
checkout and the port. The committed baselines were preserved.

Firefox 140 accepted the final disclosure-bearing manifest and completed a
60-second ring, stopping its audio and clearing the ringing record at the
deadline. Firefox 127 could only load a test copy with that disclosure removed,
which is why the AMO-ready build declares 140 as its floor.

Native notification interactions, signed-install browser restart, OS sleep/wake,
and settings sync through a signed-in Firefox Account still need manual checks
before publishing. A temporary-install smoke test does not establish those.
