import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_TIMER, type TimerRecord } from '../shared/timer'

const host = vi.hoisted(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    ended: (deadline: number) => {
        void deadline
    },
}))
vi.mock('./ring', () => ({
    createRingController: (ended: (deadline: number) => void) => {
        host.ended = ended
        return host
    },
}))

function event<Args extends unknown[]>() {
    const listeners: ((...args: Args) => unknown)[] = []
    return {
        addListener: (listener: (...args: Args) => unknown) => {
            listeners.push(listener)
        },
        emit: (...args: Args) => listeners.map((listener) => listener(...args)),
    }
}

async function setup(initial: TimerRecord) {
    let record = structuredClone(initial)
    const message = event<[unknown, unknown, (response: unknown) => void]>()
    const startup = event<[]>()
    const alarms = event<[{ name: string }]>()
    const closed = event<[string, boolean | undefined]>()
    const clicked = event<[string]>()
    const local = {
        get: vi.fn(async () => ({ timerState: structuredClone(record) })),
        set: vi.fn(async (items: { timerState?: TimerRecord }) => {
            if (items.timerState) record = structuredClone(items.timerState)
        }),
    }
    const api = {
        runtime: {
            getBrowserInfo: vi.fn(),
            getURL: (path: string) => path,
            onMessage: message,
            onStartup: startup,
            getContexts: vi.fn().mockResolvedValue([]),
        },
        notifications: {
            onClicked: clicked,
            onClosed: closed,
            create: vi.fn().mockResolvedValue('1ct-timeup'),
            clear: vi.fn().mockResolvedValue(true),
        },
        storage: { local, sync: { get: vi.fn().mockResolvedValue({}) }, onChanged: event<[]>() },
        action: {
            setBadgeText: vi.fn().mockResolvedValue(undefined),
            setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
            setIcon: vi.fn().mockResolvedValue(undefined),
            setTitle: vi.fn().mockResolvedValue(undefined),
        },
        alarms: {
            onAlarm: alarms,
            create: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(true),
        },
        tabs: { update: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    }
    vi.stubGlobal('chrome', api)
    await import('./index')
    const request = (value: unknown) =>
        new Promise((resolve) => {
            message.emit(value, {}, resolve)
        })
    return { api, startup, alarms, message, closed, request, read: () => record }
}

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
})
afterEach(() => {
    vi.unstubAllGlobals()
})

describe('background recovery and event serialization', () => {
    it('recreates alarms on initialization and never overwrites an early UI action', async () => {
        const running: TimerRecord = {
            ...IDLE_TIMER,
            status: 'running',
            endTime: Date.now() + 60_000,
            durationSeconds: 60,
            lastDurationSeconds: 60,
        }
        const { api, request, startup, read } = await setup(running)
        startup.emit()
        expect(await request({ action: 'pause' })).toEqual({ ok: true })
        expect(read().status).toBe('paused')
        expect(api.alarms.create).toHaveBeenCalledWith('1ct-timeup', { when: running.endTime })
        expect(api.alarms.create).toHaveBeenCalledTimes(2)
        expect(api.notifications.create).not.toHaveBeenCalled()
    })

    it('expires an offline timer only once despite startup and alarm events', async () => {
        const { api, startup, alarms, read } = await setup({
            ...IDLE_TIMER,
            status: 'running',
            endTime: Date.now() - 1000,
            durationSeconds: 60,
            lastDurationSeconds: 60,
        })
        startup.emit()
        alarms.emit({ name: '1ct-timeup' })
        alarms.emit({ name: '1ct-tick' })
        await vi.waitFor(() =>
            expect(api.action.setTitle).toHaveBeenCalledWith({ title: 'Alarm ringing — open the timer to stop it' }),
        )
        expect(api.notifications.create).toHaveBeenCalledOnce()
        expect(host.start).toHaveBeenCalledOnce()
        expect(read().status).toBe('expired')
    })

    it('clears an elapsed ring on wake without replaying it', async () => {
        const { api, read } = await setup({ ...IDLE_TIMER, status: 'expired', ringUntil: Date.now() - 1000 })
        await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalledWith({ title: 'Time is up' }))
        expect(read().ringUntil).toBeNull()
        expect(host.start).not.toHaveBeenCalled()
        expect(host.stop).toHaveBeenCalledOnce()
        expect(api.notifications.create).not.toHaveBeenCalled()
    })

    it('ignores old completion messages and Firefox notification close', async () => {
        const deadline = Date.now() + 60_000
        const { api, read, message, closed } = await setup({ ...IDLE_TIMER, status: 'expired', ringUntil: deadline })
        await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalled())
        closed.emit('1ct-timeup', undefined)
        message.emit({ target: 'worker', type: 'ring-ended', ringUntil: deadline - 1000 }, {}, () => {})
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(read().ringUntil).toBe(deadline)
        expect(host.stop).not.toHaveBeenCalled()
        host.ended(deadline)
        await vi.waitFor(() => expect(read().ringUntil).toBeNull())
        expect(read().status).toBe('expired')
    })
})
