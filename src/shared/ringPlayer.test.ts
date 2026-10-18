import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startChime } from '../app/lib/chimes'
import { playRing } from './ringPlayer'

vi.mock('../app/lib/chimes', () => ({ startChime: vi.fn() }))

describe('ring player', () => {
    const silence = vi.fn()
    beforeEach(() => {
        vi.useFakeTimers()
        vi.mocked(startChime).mockReturnValue(silence)
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.clearAllMocks()
    })

    it('silences and reports a natural end exactly once', () => {
        const ended = vi.fn()
        const stop = playRing({ chime: 'bell', volume: 0.5, seconds: 60, onEnded: ended })
        vi.advanceTimersByTime(59_999)
        expect(ended).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        stop()
        vi.advanceTimersByTime(60_000)
        expect(silence).toHaveBeenCalledTimes(1)
        expect(ended).toHaveBeenCalledTimes(1)
    })

    it('cancellation is idempotent and never reports completion', () => {
        const ended = vi.fn()
        const stop = playRing({ chime: 'beep', volume: 1, seconds: 300, onEnded: ended })
        vi.advanceTimersByTime(20_000)
        stop()
        stop()
        vi.advanceTimersByTime(300_000)
        expect(silence).toHaveBeenCalledTimes(1)
        expect(ended).not.toHaveBeenCalled()
    })
})
