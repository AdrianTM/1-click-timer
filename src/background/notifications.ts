import type { TimerAction } from '../shared/timer'

const BUTTONS: ReadonlyArray<{ title: string; action: TimerAction }> = [
    { title: 'Stop', action: 'reset' },
    { title: 'Restart', action: 'restart' },
]

/** Firefox cannot distinguish notification timeout from dismissal, or offer buttons. */
export function createNotifications(
    id: string,
    resolve: (action: TimerAction) => void,
    reveal: () => void,
    onError: (error: unknown) => void,
) {
    // Firefox exposes an onButtonClicked event object even though it rejects
    // the buttons option. Detect its runtime capability as well as the event.
    const firefox = 'getBrowserInfo' in chrome.runtime
    const buttonsSupported = !firefox && typeof chrome.notifications.onButtonClicked?.addListener === 'function'
    let buttonHandled = false

    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationId === id) reveal()
    })
    if (buttonsSupported) {
        chrome.notifications.onButtonClicked.addListener((notificationId, index) => {
            if (notificationId !== id) return
            const button = BUTTONS[index]
            if (!button) return
            buttonHandled = true
            resolve(button.action)
        })
    }
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
        if (notificationId !== id) return
        if (buttonHandled) {
            buttonHandled = false
            return
        }
        if (buttonsSupported && byUser === true) resolve('reset')
    })

    return {
        show(options: chrome.notifications.NotificationCreateOptions, audible: boolean): void {
            buttonHandled = false
            try {
                void chrome.notifications
                    .create(id, {
                        ...options,
                        ...(buttonsSupported
                            ? {
                                  priority: 2,
                                  requireInteraction: true,
                                  silent: audible,
                                  buttons: BUTTONS.map(({ title }) => ({ title })),
                              }
                            : {}),
                    })
                    .catch(onError)
            } catch (error) {
                onError(error)
            }
        },
        clear(): void {
            try {
                void chrome.notifications.clear(id).catch(onError)
            } catch (error) {
                onError(error)
            }
        },
    }
}
