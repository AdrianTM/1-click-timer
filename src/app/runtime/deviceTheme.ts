/** Firefox's theme API is absent from Chrome's types and from plain web pages. */
export interface BrowserTheme {
    colors?: { toolbar?: string; toolbar_text?: string }
}

interface ThemeBrowser {
    theme: {
        getCurrent(windowId: number): Promise<BrowserTheme>
        onUpdated: {
            addListener(listener: () => void): void
            removeListener(listener: () => void): void
        }
    }
    windows: { getCurrent(): Promise<{ id?: number }> }
}

/** Read the containing window each time, including after a tab moves windows.
 * Ignore stale requests and completions after Device has been deselected.
 */
export function watchBrowserTheme(apply: (theme: BrowserTheme, failure?: string) => void): () => void {
    const browser = (globalThis as typeof globalThis & { browser?: ThemeBrowser }).browser
    if (!browser?.theme?.getCurrent) {
        apply({}, 'This browser does not expose theme colors to this extension.')
        return () => {}
    }
    let active = true
    let revision = 0
    async function refresh(): Promise<void> {
        const request = ++revision
        let theme: BrowserTheme = {}
        let failure: string | undefined
        try {
            const { id } = await browser!.windows.getCurrent()
            if (id !== undefined) theme = await browser!.theme.getCurrent(id)
            else failure = 'Firefox did not identify this window.'
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            failure = `Could not read Firefox’s theme: ${detail}`
        }
        if (active && request === revision) apply(theme, failure)
    }
    browser.theme.onUpdated.addListener(refresh)
    window.addEventListener('focus', refresh)
    void refresh()
    return () => {
        active = false
        browser.theme.onUpdated.removeListener(refresh)
        window.removeEventListener('focus', refresh)
    }
}

/** Canvas accepts Firefox's CSS color strings (hex, rgb and named colors alike).
 * Only opaque toolbar colors are useful as a page's base palette.
 */
export function toolbarPalette(theme: BrowserTheme): { surface: string; ink?: string; dark: boolean } | undefined {
    const surface = theme.colors?.toolbar
    if (!surface || !CSS.supports('color', surface)) return undefined
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined
    context.fillStyle = surface
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
    if (alpha !== 255) return undefined
    const linear = [r!, g!, b!].map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    // The luminance at which black and white have equal contrast.
    const dark = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]! < 0.179
    const ink = theme.colors?.toolbar_text
    return { surface, ink: ink && CSS.supports('color', ink) ? ink : undefined, dark }
}
