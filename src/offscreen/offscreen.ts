/**
 * The offscreen document: the extension's only source of alarm audio.
 *
 * An MV3 service worker has no DOM and no `AudioContext`, so it cannot play the
 * chime itself. This hidden page is created for that alone — its reason is
 * `AUDIO_PLAYBACK` — and it plays the same synthesised chime the settings screen
 * previews (`app/lib/chimes.ts`). It stops on its own after the requested number
 * of seconds and tells the worker, so the worker can drop the alert icon without
 * anything having to wake on a schedule.
 */

import { resumeAudio } from '../app/lib/chimes'
import { playRing } from '../shared/ringPlayer'
import { isOffscreenMessage, WORKER_TARGET, type RingEndedMessage } from '../shared/offscreen'

let stopRing: (() => void) | null = null
let generation = 0

function silence(): void {
    stopRing?.()
    stopRing = null
}

function reportEnded(ringUntil: number): void {
    const message: RingEndedMessage = { target: WORKER_TARGET, type: 'ring-ended', ringUntil }
    void chrome.runtime.sendMessage(message).catch(() => {
        // The worker is gone; nothing left to update.
    })
}

chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isOffscreenMessage(message)) return
    const current = ++generation

    if (message.type === 'stop') {
        silence()
        return
    }

    silence()
    void (async () => {
        try {
            await resumeAudio()
            if (current !== generation) return
            stopRing = playRing({
                chime: message.chime,
                volume: message.volume,
                seconds: Math.max(0, (message.ringUntil - Date.now()) / 1000),
                onEnded: () => {
                    if (current !== generation) return
                    stopRing = null
                    reportEnded(message.ringUntil)
                },
            })
        } catch (error) {
            console.warn('Could not play alarm:', error)
            if (current === generation) reportEnded(message.ringUntil)
        }
    })()
})
