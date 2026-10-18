import { resumeAudio } from '../app/lib/chimes'
import type { TimerSettings } from '../app/runtime/settings'
import { OFFSCREEN_DOCUMENT_PATH, OFFSCREEN_TARGET, type RingMessage, type StopMessage } from '../shared/offscreen'
import { playRing } from '../shared/ringPlayer'
import type { TimerRecord } from '../shared/timer'

export const RING_HEARTBEAT_KEY = '1ct-ring-heartbeat'
export const RING_HEARTBEAT_MS = 20_000
export const OFFSCREEN_CLOSE_DELAY_MS = 300

export function hasOffscreenApi(): boolean {
    return typeof chrome.offscreen?.createDocument === 'function'
}

/** Host resources are transient; the ring deadline in storage is the source of truth. */
export function createRingController(onEnded: (ringUntil: number) => void, onError: (error: unknown) => void) {
    let stopPlayer: (() => void) | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let closeTimeout: ReturnType<typeof setTimeout> | null = null
    let generation = 0
    let operations = Promise.resolve()

    // A new start must wait for an already-started document close.
    async function serialize(operation: () => Promise<void>): Promise<void> {
        const previous = operations
        let release!: () => void
        operations = new Promise<void>((resolve) => {
            release = resolve
        })
        await previous
        try {
            await operation()
        } finally {
            release()
        }
    }

    function cancelClose() {
        if (closeTimeout !== null) clearTimeout(closeTimeout)
        closeTimeout = null
    }

    function stopDirect() {
        stopPlayer?.()
        stopPlayer = null
        if (heartbeat !== null) clearInterval(heartbeat)
        heartbeat = null
    }

    async function hasDocument() {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
        })
        return contexts.length > 0
    }

    function scheduleClose(expected: number) {
        cancelClose()
        closeTimeout = setTimeout(() => {
            closeTimeout = null
            void serialize(async () => {
                if (generation !== expected) return
                await chrome.offscreen.closeDocument().catch(() => {})
            }).catch(onError)
        }, OFFSCREEN_CLOSE_DELAY_MS)
    }

    return {
        async start(record: TimerRecord, settings: TimerSettings): Promise<void> {
            const current = ++generation
            cancelClose()
            stopDirect()
            const ringUntil = record.ringUntil
            if (ringUntil === null) return
            if (ringUntil <= Date.now()) {
                onEnded(ringUntil)
                return
            }
            await serialize(async () => {
                if (current !== generation) return
                if (hasOffscreenApi()) {
                    if (!(await hasDocument())) {
                        await chrome.offscreen.createDocument({
                            url: OFFSCREEN_DOCUMENT_PATH,
                            reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
                            justification: 'Play the timer alarm with no timer surface open.',
                        })
                    }
                    const message: RingMessage = {
                        target: OFFSCREEN_TARGET,
                        type: 'ring',
                        chime: settings.chime,
                        volume: settings.volume,
                        ringUntil,
                    }
                    await chrome.runtime.sendMessage(message)
                    return
                }
                if (typeof document === 'undefined') throw new Error('No background audio host available')
                await resumeAudio()
                if (current !== generation) return
                const seconds = Math.max(0, (ringUntil - Date.now()) / 1000)
                if (seconds === 0) {
                    onEnded(ringUntil)
                    return
                }
                try {
                    stopPlayer = playRing({
                        chime: settings.chime,
                        volume: settings.volume,
                        seconds,
                        onEnded: () => {
                            if (current !== generation) return
                            stopDirect()
                            onEnded(ringUntil)
                        },
                    })
                    // Firefox resets event-page idling on extension events, not DOM
                    // timers. A top-level storage listener receives these writes.
                    let sequence = 0
                    heartbeat = setInterval(() => {
                        void chrome.storage.local
                            .set({ [RING_HEARTBEAT_KEY]: `${ringUntil}:${Date.now()}:${++sequence}` })
                            .catch((error: unknown) => {
                                if (current !== generation) return
                                stopDirect()
                                onError(error)
                                onEnded(ringUntil)
                            })
                    }, RING_HEARTBEAT_MS)
                } catch (error) {
                    stopDirect()
                    throw error
                }
            })
        },
        async stop(): Promise<void> {
            const current = ++generation
            stopDirect()
            cancelClose()
            if (!hasOffscreenApi()) return
            await serialize(async () => {
                try {
                    if (await hasDocument()) {
                        const message: StopMessage = { target: OFFSCREEN_TARGET, type: 'stop' }
                        await chrome.runtime.sendMessage(message)
                    }
                } finally {
                    scheduleClose(current)
                }
            })
        },
    }
}
