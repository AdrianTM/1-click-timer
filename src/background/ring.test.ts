import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resumeAudio } from '../app/lib/chimes'
import { DEFAULT_SETTINGS } from '../app/runtime/settings'
import { playRing } from '../shared/ringPlayer'
import { IDLE_TIMER } from '../shared/timer'
import { createRingController, OFFSCREEN_CLOSE_DELAY_MS, RING_HEARTBEAT_KEY, RING_HEARTBEAT_MS } from './ring'

vi.mock('../app/lib/chimes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../app/lib/chimes')>()),
    resumeAudio: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../shared/ringPlayer', () => ({ playRing: vi.fn() }))

function record(seconds: number) {
    return { ...IDLE_TIMER, status: 'expired' as const, ringUntil: Date.now() + seconds * 1000 }
}

function setup(offscreen = false) {
    const api = {
        runtime: {
            getURL: (path: string) => path,
            getContexts: vi.fn().mockResolvedValue([]),
            sendMessage: vi.fn().mockResolvedValue(undefined),
        },
        storage: { local: { set: vi.fn().mockResolvedValue(undefined) } },
        ...(offscreen
            ? {
                  offscreen: {
                      createDocument: vi.fn().mockResolvedValue(undefined),
                      closeDocument: vi.fn().mockResolvedValue(undefined),
                  },
              }
            : {}),
    }
    vi.stubGlobal('chrome', api)
    vi.stubGlobal('document', {})
    const ended = vi.fn(),
        error = vi.fn(),
        silence = vi.fn()
    vi.mocked(playRing).mockReturnValue(silence)
    return { api, ended, error, silence, controller: createRingController(ended, error) }
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'))
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe('Firefox ring host', () => {
    it('uses only the persisted remaining time and heartbeats only while ringing', async () => {
        const { api, controller, silence } = setup()
        const timer = record(60)
        await vi.advanceTimersByTimeAsync(15_000)
        await controller.start(timer, DEFAULT_SETTINGS)
        expect(playRing).toHaveBeenCalledWith(expect.objectContaining({ seconds: 45 }))
        await vi.advanceTimersByTimeAsync(RING_HEARTBEAT_MS * 2)
        const writes = api.storage.local.set.mock.calls
        expect(writes).toHaveLength(2)
        expect(writes[0]![0][RING_HEARTBEAT_KEY]).not.toEqual(writes[1]![0][RING_HEARTBEAT_KEY])
        await controller.stop()
        await vi.advanceTimersByTimeAsync(300_000)
        expect(silence).toHaveBeenCalledOnce()
        expect(api.storage.local.set).toHaveBeenCalledTimes(2)
    })

    it('cleans up natural completion and ignores a replaced player callback', async () => {
        const { controller, ended, api } = setup()
        const first = record(60)
        await controller.start(first, DEFAULT_SETTINGS)
        const oldEnd = vi.mocked(playRing).mock.calls[0]![0].onEnded
        const second = record(300)
        await controller.start(second, DEFAULT_SETTINGS)
        oldEnd()
        expect(ended).not.toHaveBeenCalled()
        vi.mocked(playRing).mock.calls[1]![0].onEnded()
        expect(ended).toHaveBeenCalledExactlyOnceWith(second.ringUntil)
        await vi.advanceTimersByTimeAsync(300_000)
        expect(api.storage.local.set).not.toHaveBeenCalled()
    })

    it('does not play a ring whose persisted deadline has elapsed', async () => {
        const { controller, ended } = setup()
        const elapsed = record(-1)
        await controller.start(elapsed, DEFAULT_SETTINGS)
        expect(resumeAudio).not.toHaveBeenCalled()
        expect(playRing).not.toHaveBeenCalled()
        expect(ended).toHaveBeenCalledWith(elapsed.ringUntil)
    })

    it('reports heartbeat failure and releases the player', async () => {
        const { controller, api, error, ended, silence } = setup()
        api.storage.local.set.mockRejectedValue(new Error('Disk unavailable'))
        await controller.start(record(300), DEFAULT_SETTINGS)
        await vi.advanceTimersByTimeAsync(100_000)
        expect(silence).toHaveBeenCalledOnce()
        expect(error).toHaveBeenCalledOnce()
        expect(ended).toHaveBeenCalledOnce()
        expect(api.storage.local.set).toHaveBeenCalledOnce()
    })

    it('propagates audio-start failure without leaking a heartbeat', async () => {
        const { controller, api } = setup()
        vi.mocked(resumeAudio).mockRejectedValueOnce(new Error('Audio blocked'))
        await expect(controller.start(record(300), DEFAULT_SETTINGS)).rejects.toThrow('Audio blocked')
        await vi.advanceTimersByTimeAsync(300_000)
        expect(api.storage.local.set).not.toHaveBeenCalled()
    })
})

describe('Chrome ring host', () => {
    it('never touches DOM audio and cancels pending closure when a new ring starts', async () => {
        const { controller, api } = setup(true)
        vi.stubGlobal('document', undefined)
        await controller.start(record(60), DEFAULT_SETTINGS)
        await controller.stop()
        await controller.start(record(300), DEFAULT_SETTINGS)
        await vi.advanceTimersByTimeAsync(OFFSCREEN_CLOSE_DELAY_MS)
        expect(api.offscreen!.closeDocument).not.toHaveBeenCalled()
        expect(playRing).not.toHaveBeenCalled()
        expect(resumeAudio).not.toHaveBeenCalled()
        await controller.stop()
        await vi.advanceTimersByTimeAsync(OFFSCREEN_CLOSE_DELAY_MS)
        expect(api.offscreen!.closeDocument).toHaveBeenCalledOnce()
    })

    it('waits for an in-flight close before creating a new offscreen document', async () => {
        const { controller, api } = setup(true)
        let finishClose!: () => void
        api.offscreen!.closeDocument.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishClose = resolve
                }),
        )
        await controller.stop()
        await vi.advanceTimersByTimeAsync(OFFSCREEN_CLOSE_DELAY_MS)
        const starting = controller.start(record(60), DEFAULT_SETTINGS)
        await Promise.resolve()
        expect(api.offscreen!.createDocument).not.toHaveBeenCalled()
        finishClose()
        await starting
        expect(api.offscreen!.createDocument).toHaveBeenCalledOnce()
    })
})
