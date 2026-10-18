import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotifications } from './notifications'

function event() {
    return { addListener: vi.fn() }
}

function setup(firefox = false) {
    const api = {
        create: vi.fn().mockResolvedValue('timer'),
        clear: vi.fn().mockResolvedValue(true),
        onClicked: event(),
        onClosed: event(),
        ...(!firefox ? { onButtonClicked: event() } : {}),
    }
    vi.stubGlobal('chrome', { notifications: api, runtime: firefox ? { getBrowserInfo: vi.fn() } : {} })
    const resolve = vi.fn(),
        reveal = vi.fn(),
        error = vi.fn()
    const notices = createNotifications('timer', resolve, reveal, error)
    return { api, resolve, reveal, error, notices }
}
const options = { type: 'basic' as const, title: 'Timer', message: 'Time is up', iconUrl: 'icon.png' }

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('notification platform behavior', () => {
    it('initializes without a Firefox button event and omits unsupported options', () => {
        const { api, resolve, reveal, notices } = setup(true)
        notices.show(options, true)
        expect(api.create).toHaveBeenCalledWith('timer', options)
        const closed = api.onClosed.addListener.mock.calls[0]![0]
        closed('timer', undefined)
        closed('timer', false)
        expect(resolve).not.toHaveBeenCalled()
        const clicked = api.onClicked.addListener.mock.calls[0]![0]
        clicked('other')
        expect(reveal).not.toHaveBeenCalled()
        clicked('timer')
        expect(reveal).toHaveBeenCalledOnce()
    })

    it('keeps Chrome buttons and resets only a user dismissal', () => {
        const { api, resolve, notices } = setup()
        notices.show(options, true)
        expect(api.create).toHaveBeenCalledWith(
            'timer',
            expect.objectContaining({
                requireInteraction: true,
                silent: true,
                buttons: [{ title: 'Stop' }, { title: 'Restart' }],
            }),
        )
        const closed = api.onClosed.addListener.mock.calls[0]![0]
        closed('timer', false)
        expect(resolve).not.toHaveBeenCalled()
        closed('timer', true)
        expect(resolve).toHaveBeenCalledWith('reset')
    })

    it('does not undo Restart when its button dismisses the notice', () => {
        const { api, resolve, notices } = setup()
        notices.show(options, false)
        const button = api.onButtonClicked!.addListener.mock.calls[0]![0]
        const closed = api.onClosed.addListener.mock.calls[0]![0]
        button('timer', 1)
        closed('timer', true)
        expect(resolve.mock.calls).toEqual([['restart']])
        notices.show(options, false)
        closed('timer', true)
        expect(resolve).toHaveBeenLastCalledWith('reset')
    })

    it('reports notification failures without throwing into expiry handling', async () => {
        const { api, error, notices } = setup(true)
        api.create.mockRejectedValue(new Error('Notifications blocked'))
        notices.show(options, false)
        await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
    })

    it('handles Firefox API stubs and synchronous argument validation failures', () => {
        const { api, notices, error } = setup(true)
        Object.assign(api, { onButtonClicked: event() })
        api.create.mockImplementation(() => {
            throw new Error('Invalid options')
        })
        expect(() => notices.show(options, true)).not.toThrow()
        expect(error).toHaveBeenCalledOnce()
    })
})
