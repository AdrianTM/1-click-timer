/** Keep Chrome's source manifest intact; Firefox runs an MV3 module event page. */
export function firefoxManifest<T extends { permissions: string[]; minimum_chrome_version?: string }>(base: T) {
    const manifest = structuredClone(base)
    delete manifest.minimum_chrome_version
    return {
        ...manifest,
        permissions: manifest.permissions.filter((permission) => permission !== 'offscreen'),
        background: { scripts: ['js/background.js'], type: 'module' },
        browser_specific_settings: {
            gecko: {
                id: '{1e399e5e-c937-434a-b288-ebacad6f64ba}',
                // Older Firefox rejects AMO's required data-disclosure field.
                strict_min_version: '140.0',
                data_collection_permissions: { required: ['none'] },
            },
        },
    }
}
