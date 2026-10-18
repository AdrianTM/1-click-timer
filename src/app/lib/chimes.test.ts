import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('alarm audio readiness', () => {
    it('releases the background if an autoplay policy leaves resume pending', async () => {
        vi.stubGlobal('window', {})
        vi.stubGlobal(
            'AudioContext',
            class {
                state = 'suspended'
                resume() {
                    return new Promise<void>(() => {})
                }
            },
        )
        const { resumeAudio } = await import('./chimes')
        const failure = expect(resumeAudio()).rejects.toThrow('resume timed out')
        await vi.advanceTimersByTimeAsync(5000)
        await failure
        expect(vi.getTimerCount()).toBe(0)
    })

    it('cleans up the readiness timeout once audio is running', async () => {
        vi.stubGlobal('window', {})
        vi.stubGlobal(
            'AudioContext',
            class {
                state = 'suspended'
                async resume() {
                    this.state = 'running'
                }
            },
        )
        const { resumeAudio } = await import('./chimes')
        await resumeAudio()
        expect(vi.getTimerCount()).toBe(0)
    })
})
