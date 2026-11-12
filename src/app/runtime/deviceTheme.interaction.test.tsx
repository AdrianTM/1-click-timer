import { page } from 'vitest/browser'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { createMockSettings } from './mockSettings'
import { useSettingsTheme } from './useSettingsTheme'
import type { SettingsStore } from './settings'
import { toolbarPalette, type BrowserTheme } from './deviceTheme'
import '../design/tokens.css'
import { SettingsApp } from '../SettingsApp'

function Theme({ store }: { store: SettingsStore }) {
    useSettingsTheme(store)
    return <SettingsApp settingsStore={store} />
}

afterEach(() => vi.unstubAllGlobals())

test('Device follows the containing window toolbar, updates, resets and cleans up', async () => {
    let current: BrowserTheme = { colors: { toolbar: '#202040', toolbar_text: '#eeeeff' } }
    let updated: (() => void) | undefined
    const getCurrent = vi.fn(async () => current)
    const removeListener = vi.fn()
    vi.stubGlobal('browser', {
        windows: { getCurrent: async () => ({ id: 42 }) },
        theme: {
            getCurrent,
            onUpdated: {
                addListener: (listener: () => void) => {
                    updated = listener
                },
                removeListener,
            },
        },
    })
    const store = createMockSettings({ mode: 'device' })
    const screen = await render(<Theme store={store} />)
    const root = document.documentElement
    await vi.waitFor(() => expect(getComputedStyle(root).getPropertyValue('--surface')).toBe('#202040'))
    expect(screen.container.querySelector('#theme-status')?.textContent).toBe('Using Firefox toolbar colors.')
    expect(getCurrent).toHaveBeenCalledWith(42)
    expect(root.dataset.theme).toBe('dark')
    expect(getComputedStyle(root).getPropertyValue('--dial-mark')).toBe('#eeeeff')
    current = { colors: { toolbar: 'rgb(240, 230, 220)', toolbar_text: 'navy' } }
    updated!()
    await vi.waitFor(() => expect(root.dataset.theme).toBe('light'))
    expect(getComputedStyle(root).getPropertyValue('--ink')).toBe('navy')
    current = {}
    updated!()
    await vi.waitFor(() => expect(root.hasAttribute('data-browser-theme')).toBe(false))
    expect(root.dataset.theme).toBe(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    expect(screen.container.querySelector('#theme-status')?.textContent).toContain(
        'Firefox supplied no toolbar background color.',
    )
    current = { colors: { toolbar: '#111111' } }
    updated!()
    await vi.waitFor(() => expect(root.dataset.theme).toBe('dark'))
    await store.update({ mode: 'light' })
    await vi.waitFor(() => expect(root.dataset.theme).toBe('light'))
    expect(root.style.getPropertyValue('--browser-surface')).toBe('')
    expect(removeListener).toHaveBeenCalled()
    expect(screen.container.querySelector('#theme-status')).toBeNull()
    await screen.unmount()
})

test('an outstanding Firefox response cannot overwrite an explicit theme', async () => {
    let resolve!: (theme: BrowserTheme) => void
    const getCurrent = vi.fn(
        () =>
            new Promise<BrowserTheme>((done) => {
                resolve = done
            }),
    )
    vi.stubGlobal('browser', {
        windows: { getCurrent: async () => ({ id: 1 }) },
        theme: { getCurrent, onUpdated: { addListener: vi.fn(), removeListener: vi.fn() } },
    })
    const store = createMockSettings({ mode: 'device' })
    const screen = await render(<Theme store={store} />)
    await vi.waitFor(() => expect(getCurrent).toHaveBeenCalled())
    await store.update({ mode: 'light' })
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    resolve({ colors: { toolbar: '#111111' } })
    await new Promise((done) => setTimeout(done, 0))
    expect(document.documentElement.hasAttribute('data-browser-theme')).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    await screen.unmount()
})

test('unavailable API and failed reads retain the media-query fallback', async () => {
    for (const browser of [
        undefined,
        {
            windows: { getCurrent: async () => ({ id: 1 }) },
            theme: {
                getCurrent: async () => {
                    throw new Error('unavailable')
                },
                onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
            },
        },
    ]) {
        vi.stubGlobal('browser', browser)
        const screen = await render(<Theme store={createMockSettings({ mode: 'device' })} />)
        expect(document.documentElement.dataset.theme).toBe(
            matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        )
        expect(document.documentElement.hasAttribute('data-browser-theme')).toBe(false)
        await vi.waitFor(() =>
            expect(screen.container.querySelector('#theme-status')?.textContent).toContain(
                browser ? 'Could not read Firefox’s theme: unavailable' : 'This browser does not expose theme colors',
            ),
        )
        await screen.unmount()
    }
})

test('palette handles named and missing text colors, and rejects transparent backgrounds', () => {
    expect(toolbarPalette({ colors: { toolbar: 'navy' } })).toEqual({ surface: 'navy', ink: undefined, dark: true })
    expect(toolbarPalette({ colors: { toolbar: 'transparent' } })).toBeUndefined()
    expect(toolbarPalette({ colors: { toolbar: 'invalid' } })).toBeUndefined()
})

test('custom controls apply saved colors, survive mode switches, and reset to the screenshot palette', async () => {
    vi.stubGlobal('browser', undefined)
    const store = createMockSettings({ mode: 'custom' })
    const screen = await render(<Theme store={store} />)
    const root = document.documentElement
    const background = screen.container.querySelector<HTMLInputElement>('#background-color')!
    const text = screen.container.querySelector<HTMLInputElement>('#text-color')!
    expect(background.value).toBe('#fdf4f4')
    expect(text.value).toBe('#75669f')
    await page.elementLocator(background).fill('#121212')
    await page.elementLocator(text).fill('#eeeeee')
    await vi.waitFor(() => expect(getComputedStyle(root).getPropertyValue('--surface')).toBe('#121212'))
    expect(getComputedStyle(root).getPropertyValue('--dial-mark')).toBe('#eeeeee')
    expect(root.dataset.theme).toBe('dark')
    store.update({ mode: 'light' })
    await vi.waitFor(() => expect(root.hasAttribute('data-custom-theme')).toBe(false))
    expect(getComputedStyle(root).getPropertyValue('--surface').trim()).toBe('#fdf4f4')
    expect(getComputedStyle(root).getPropertyValue('--dial-mark').trim()).toBe('#75669f')
    store.update({ mode: 'custom' })
    await vi.waitFor(() => expect(getComputedStyle(root).getPropertyValue('--surface')).toBe('#121212'))
    store.reset()
    await vi.waitFor(() => expect(root.hasAttribute('data-custom-theme')).toBe(false))
    expect(store.getState().backgroundColor).toBe('#fdf4f4')
    await screen.unmount()
})
