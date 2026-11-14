#!/usr/bin/env python3
"""Capture AMO assets from the packaged extension in an isolated Firefox profile.

Requires Python 3, Firefox, and a running geckodriver with system access enabled.
See CONTRIBUTING.md. This script captures locally; it never publishes to AMO.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'dashboard/screenshots/firefox'
DRIVER = os.environ.get('FIREFOX_WEBDRIVER_URL', 'http://127.0.0.1:4450').rstrip('/')
ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf'


def request(method, path, data=None):
    payload = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        DRIVER + path, data=payload, method=method,
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)['value']
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


def main():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    archive = ROOT / f'dashboard/package/1-click-timer-{version}-firefox.zip'
    if not archive.is_file():
        raise SystemExit('Build and package Firefox first; see npm run screenshots:firefox.')
    with zipfile.ZipFile(archive) as package:
        manifest = json.loads(package.read('manifest.json'))
        if manifest['version'] != version:
            raise SystemExit('Package version does not match package.json; rebuild Firefox.')
        guid = manifest['browser_specific_settings']['gecko']['id']
        icon = package.read(manifest['icons']['128'])
    gallery = json.loads((ROOT / 'scripts/store/firefox-gallery.json').read_text())
    OUTPUT.mkdir(parents=True, exist_ok=True)
    session = request('POST', '/session', {'capabilities': {'alwaysMatch': {
        'browserName': 'firefox',
        'moz:firefoxOptions': {
            'args': ['-headless'],
            # Headless Firefox otherwise reports no hover. Use a desktop mouse
            # so the real readout has the same controls as desktop Firefox.
            'prefs': {'ui.primaryPointerCapabilities': 6, 'ui.allPointerCapabilities': 6},
        },
    }}})
    prefix = '/session/' + session['sessionId']

    def js(script, args=None, asynchronous=False):
        return request('POST', prefix + '/execute/' + ('async' if asynchronous else 'sync'),
                       {'script': script, 'args': args or []})

    def wait_for(script):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if js(script):
                return
            time.sleep(.1)
        raise RuntimeError('Firefox UI did not become ready: ' + script)

    def screenshot(filename):
        js('const done=arguments[arguments.length-1];document.fonts.ready.then(done);', asynchronous=True)
        element = request('POST', prefix + '/element', {'using': 'css selector', 'value': 'body'})[ELEMENT_KEY]
        data = request('GET', prefix + '/element/' + element + '/screenshot')
        (OUTPUT / filename).write_bytes(base64.b64decode(data))

    def theme(mode):
        js('const done=arguments[arguments.length-1];'
           'browser.storage.sync.set({settings:{mode:arguments[0]}}).then(done);', [mode], True)
        wait_for('return document.documentElement.dataset.theme === ' + json.dumps(mode))

    try:
        request('POST', prefix + '/moz/addon/install', {'path': str(archive), 'temporary': True})
        request('POST', prefix + '/moz/context', {'context': 'chrome'})
        extension_uuid = js("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))[arguments[0]];", [guid])
        request('POST', prefix + '/moz/context', {'context': 'content'})
        extension = 'moz-extension://' + extension_uuid + '/'
        request('POST', prefix + '/window/rect', {'width': 1280, 'height': 900})
        request('POST', prefix + '/url', {'url': extension + 'fullscreen.html'})
        wait_for('return !!document.querySelector(\'svg[role="slider"]\');')
        width, height = js('return [outerWidth-innerWidth, outerHeight-innerHeight];')
        request('POST', prefix + '/window/rect', {'width': 1280+width, 'height': 800+height})
        if not js("return matchMedia('(hover: hover) and (pointer: fine)').matches"):
            raise RuntimeError('Firefox must report a desktop pointer for these screenshots.')
        for mode, item in zip(('light', 'dark'), gallery[:2]):
            theme(mode)
            js('const done=arguments[arguments.length-1];'
               "browser.runtime.sendMessage({action:'start',seconds:1500}).then(done);", asynchronous=True)
            wait_for("return document.querySelector('svg').textContent.includes('24:59') || document.querySelector('svg').textContent.includes('25:00');")
            # Let the theme and control transitions settle before taking the image.
            time.sleep(.3)
            screenshot(item['filename'])
        theme('light')
        request('POST', prefix + '/url', {'url': extension + 'settings.html'})
        wait_for("return document.body.innerText.includes('Reset to defaults');")
        theme('light')
        screenshot(gallery[2]['filename'])
        (OUTPUT / 'icon-128.png').write_bytes(icon)
        files = [item['filename'] for item in gallery] + ['icon-128.png']
        (OUTPUT / 'SHA256SUMS').write_text(''.join(
            f'{hashlib.sha256((OUTPUT / name).read_bytes()).hexdigest()}  {name}\n' for name in files
        ))
        (OUTPUT / 'capture.json').write_text(json.dumps({
            'version': version, 'firefox': session['capabilities']['browserVersion'],
            'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
            'gallery': gallery,
        }, indent=2) + '\n')
        print(f'Captured three Firefox screenshots and the packaged icon in {OUTPUT}')
    finally:
        request('DELETE', prefix)


if __name__ == '__main__':
    main()
