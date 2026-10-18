import { describe, expect, it } from 'vitest'
import { firefoxManifest } from '../scripts/manifest/firefox'
import chromeManifest from './manifest.json'
import pkg from '../package.json'

describe('Firefox manifest', () => {
    it('preserves shared metadata and assets without mutating the Chrome manifest', () => {
        const original = structuredClone(chromeManifest)
        const firefox = firefoxManifest(chromeManifest)
        expect(chromeManifest).toEqual(original)
        expect(firefox.name).toBe(chromeManifest.name)
        expect(firefox.version).toBe(pkg.version)
        expect(firefox.description).toBe(pkg.description)
        expect(firefox.icons).toEqual(chromeManifest.icons)
        expect(firefox.action).toEqual(chromeManifest.action)
        expect(firefox.manifest_version).toBe(3)
    })

    it('uses only Firefox background and permissions with a stable identity and data declaration', () => {
        const firefox = firefoxManifest(chromeManifest)
        expect(firefox).not.toHaveProperty('minimum_chrome_version')
        expect(firefox.background).toEqual({ scripts: ['js/background.js'], type: 'module' })
        expect(firefox.permissions).toEqual(['alarms', 'notifications', 'storage'])
        expect(firefox.browser_specific_settings.gecko).toEqual({
            id: '{1e399e5e-c937-434a-b288-ebacad6f64ba}',
            strict_min_version: '140.0',
            data_collection_permissions: { required: ['none'] },
        })
        expect(chromeManifest.background).toHaveProperty('service_worker')
        expect(chromeManifest.minimum_chrome_version).toBe('116')
    })
})
