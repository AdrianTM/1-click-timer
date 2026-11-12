import { useEffect } from 'react'
import { toolbarPalette, watchBrowserTheme } from './deviceTheme'
import type { SettingsStore } from './settings'
import { useSettings } from './useSettings'
import { setThemeStatus } from './themeStatus'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Applies the light/dark theme, resolving Device from Firefox toolbar colors
 * when available, otherwise from the browser’s preferred light/dark scheme.
 * The popup, the tab and the settings screen all share one theme. The remaining-time colour is applied separately by
 * `useRemainingColor`, which also needs the timer's own state.
 */
export function useSettingsTheme(store: SettingsStore): void {
    const settings = useSettings(store)

    useEffect(() => {
        const root = document.documentElement

        function applyTheme(dark: boolean): void {
            root.dataset.theme = dark ? 'dark' : 'light'
        }

        if (settings.mode === 'custom') {
            const palette = toolbarPalette({
                colors: { toolbar: settings.backgroundColor, toolbar_text: settings.textColor },
            })
            applyTheme(palette?.dark ?? false)
            root.style.setProperty('--browser-surface', settings.backgroundColor)
            root.style.setProperty('--browser-ink', settings.textColor)
            root.setAttribute('data-custom-theme', '')
            setThemeStatus('Using custom colors.')
            return () => {
                root.removeAttribute('data-custom-theme')
                root.style.removeProperty('--browser-surface')
                root.style.removeProperty('--browser-ink')
            }
        }

        if (settings.mode !== 'device') {
            applyTheme(settings.mode === 'dark')
            setThemeStatus(`Using ${settings.mode} appearance.`)
            return undefined
        }

        const media = window.matchMedia(DARK_QUERY)
        let palette: ReturnType<typeof toolbarPalette>
        let reason = 'Checking browser theme…'
        function applyDevice(): void {
            applyTheme(palette?.dark ?? media.matches)
            for (const [name, value] of [
                ['--browser-surface', palette?.surface],
                ['--browser-ink', palette?.ink],
            ] as const) {
                if (value) root.style.setProperty(name, value)
                else root.style.removeProperty(name)
            }
            root.toggleAttribute('data-browser-theme', Boolean(palette))
            setThemeStatus(
                palette
                    ? `Using Firefox toolbar colors.${palette.ink ? '' : ' Firefox supplied no text color; using matching light/dark text.'}`
                    : `Using ${media.matches ? 'dark' : 'light'} fallback. ${reason}`,
            )
        }
        applyDevice()
        const stopWatching = watchBrowserTheme((theme, failure) => {
            palette = undefined
            reason = failure ?? 'Firefox supplied no toolbar background color. Built-in themes may not expose colors.'
            if (!failure && theme.colors?.toolbar) {
                try {
                    palette = toolbarPalette(theme)
                    if (!palette) reason = 'Firefox’s toolbar background could not be used as an opaque color.'
                } catch (error) {
                    reason = `Could not read the toolbar color: ${error instanceof Error ? error.message : String(error)}`
                }
            }
            applyDevice()
        })
        const onChange = () => applyDevice()
        media.addEventListener('change', onChange)
        return () => {
            stopWatching()
            media.removeEventListener('change', onChange)
            root.removeAttribute('data-browser-theme')
            root.style.removeProperty('--browser-surface')
            root.style.removeProperty('--browser-ink')
        }
    }, [settings.mode, settings.backgroundColor, settings.textColor])
}
