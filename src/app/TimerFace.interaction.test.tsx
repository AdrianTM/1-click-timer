import { page } from 'vitest/browser'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { TimerApp } from './TimerApp'
import { createMockRuntime } from './runtime/mockRuntime'
import { createMockSettings } from './runtime/mockSettings'
import './design/global.css'

test('the empty part of a numeral hit area previews and starts its duration', async () => {
    const runtime = createMockRuntime()
    const screen = await render(
        <div style={{ width: 380, height: 380 }}>
            <TimerApp surface="popup" runtime={runtime} settingsStore={createMockSettings()} />
        </div>,
    )
    const hit = screen.container.querySelector('g[data-numeral-minutes="15"] rect')!
    const group = hit.parentElement!
    const box = hit.getBoundingClientRect()
    let blank: { x: number; y: number } | undefined
    for (let y = 1; y < box.height; y += 2) {
        for (let x = 1; x < box.width; x += 2) {
            if (document.elementFromPoint(box.left + x, box.top + y) === hit)
                blank = { x: box.left + x, y: box.top + y }
        }
    }
    if (!blank) throw new Error('The numeral has no transparent hit area')
    const bounds = group.getBoundingClientRect()
    const position = { x: blank.x - bounds.left, y: blank.y - bounds.top }
    await page.elementLocator(group).hover({ position })
    await vi.waitFor(() =>
        expect(screen.container.querySelector('text[class*="previewNumeral"]')?.textContent).toBe('15'),
    )
    await page.elementLocator(group).click({ position })
    expect(runtime.getState().status).toBe('running')
    expect(runtime.getState().durationSeconds).toBe(900)
    runtime.reset()
})

test('the 0 hit area resets a ringing alarm', async () => {
    const runtime = createMockRuntime()
    runtime.forceStatus('expired')
    const screen = await render(
        <div style={{ width: 380, height: 380 }}>
            <TimerApp surface="popup" runtime={runtime} settingsStore={createMockSettings()} />
        </div>,
    )
    const hit = screen.container.querySelector('g[data-numeral-minutes="0"] rect')!
    await page.elementLocator(hit.parentElement!).click()
    expect(runtime.getState().status).toBe('idle')
})
