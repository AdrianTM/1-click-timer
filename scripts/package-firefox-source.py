#!/usr/bin/env python3
"""Package the reviewed source and exact build instructions for Mozilla."""

import json
from pathlib import Path
import platform
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = json.loads((ROOT / "package.json").read_text())
VERSION = PACKAGE["version"]
OUTPUT = ROOT / "dashboard" / "package" / f"1-click-timer-{VERSION}-firefox-source.zip"


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


# An explicit path list keeps dependencies, build output, credentials, editor
# settings and VCS metadata out. Include new source files before they are committed.
paths = command(
    "git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--",
    "src", "scripts", "package.json", "package-lock.json", "vite.config.ts",
    "vitest.config.ts", "tsconfig.json", "eslint.config.mjs", "LICENSE",
    "README.md", "CONTRIBUTING.md", "PRIVACY.md", "FIREFOXAMO.md",
).split("\0")
paths = sorted(set(path for path in paths if path))
for required in ("package.json", "package-lock.json", "vite.config.ts", "src/manifest.json"):
    if required not in paths:
        raise SystemExit(f"source package: missing {required}")

instructions = f"""# Firefox {VERSION} source build

Build environment used for the submission:
- OS: {platform.freedesktop_os_release().get('PRETTY_NAME', 'Linux') if platform.system() == 'Linux' else platform.system()}
- CPU architecture: {platform.machine()}
- Node.js {command('node', '--version')}
- npm {command('npm', '--version')}

Node.js >=22.13 is required; use the versions above to reproduce this build.
Install Node.js (which includes npm) from https://nodejs.org/en/download .
Extract this archive into an empty directory.
Run these commands from the directory containing package.json:

    npm ci
    npm run build:firefox

The extension is written to dist-firefox/. Its manifest.json belongs at the
root of the extension upload ZIP. Do not upload this source archive as the
installable extension. npm needs access to registry.npmjs.org to install the
dependencies pinned by package-lock.json. No global build tools or secrets
are required. Python 3 is only needed for release packaging, not this build.

Vite bundles TypeScript, React and Lucide; @resvg/resvg-js renders the local
SVG icon art. scripts/manifest/firefox.ts generates the Firefox manifest.
All runtime code is bundled locally; no runtime code is fetched remotely.
Dependencies and generated output are deliberately excluded from this archive.
"""

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in paths:
        source = ROOT / relative
        if source.is_symlink() or not source.is_file():
            raise SystemExit(f"source package: expected regular file: {relative}")
        archive.write(source, relative)
    archive.writestr("BUILD-FIREFOX.md", instructions)

print(f"source package: {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
