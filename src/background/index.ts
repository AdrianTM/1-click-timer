/**
 * 1-click timer — Chrome MV3 worker / Firefox MV3 event page.
 *
 * The worker is the single writer of the timer record in `chrome.storage.local`:
 * it applies every UI action, schedules the alarms, paints the toolbar badge and
 * raises the "time is up" notification. It also owns the alarm sound, played by
 * an offscreen document because an MV3 worker has no audio output of its own —
 * that is what lets the alarm ring with no timer surface open (AGENTS.md
 * "Notification"). The worker is woken by the ring's end, so the alert icon and
 * the sound stay in step without anything polling.
 */

import { DEFAULT_SETTINGS, normalizeSettings, SETTINGS_STORAGE_KEY, type TimerSettings } from '../app/runtime/settings'
import { alertIconPathFor, iconPathFor } from '../shared/icons'
import { isRingEndedMessage } from '../shared/offscreen'
import {
    expireIfElapsed,
    isTimerRequest,
    normalizeTimerRecord,
    reduceTimer,
    remainingFrom,
    TIMER_STORAGE_KEY,
    type TimerAction,
    type TimerRecord,
    type TimerRequest,
    type TimerResponse,
} from '../shared/timer'
import { revealSurface, TIMER_PAGES } from '../shared/surfaces'
import { ringingNow, toolbarIconFor, type ToolbarIcon } from './alarm'
import { badgePlanFor } from './badge'
import { createNotifications } from './notifications'
import { createRingController } from './ring'

const LOG_PREFIX = '[1-click-timer:sw]'

const TICK_ALARM = '1ct-tick'
const TIMEUP_ALARM = '1ct-timeup'
const NOTIFICATION_ID = '1ct-timeup'

/** Chrome 120+ allows 30 s; 116–119 may clamp to 1 min. The badge uses minutes. */
const TICK_PERIOD_MINUTES = 0.5

const BASE_TITLE = '1-click timer'

/**
 * The toolbar icon, in both the 1x and the 2x size, so Chrome picks the file
 * that matches the display instead of scaling the small one.
 *
 * The paths are absolute: `setIcon` rejects a path relative to the install
 * directory with "Failed to fetch" when the extension is loaded unpacked, even
 * though the same file fetches fine from the worker.
 */
const TOOLBAR_ICON: Record<number, string> = {
    19: chrome.runtime.getURL(iconPathFor(19)),
    38: chrome.runtime.getURL(iconPathFor(38)),
}

/** The toolbar art shown while the alarm is sounding (AGENTS.md "Notification"). */
const ALERT_ICON: Record<number, string> = {
    19: chrome.runtime.getURL(alertIconPathFor(19)),
    38: chrome.runtime.getURL(alertIconPathFor(38)),
}

/** The icon the "time is up" notification carries. */
const NOTIFICATION_ICON = iconPathFor(128)

function reportError(error: unknown): void {
    console.warn(LOG_PREFIX, error)
}

// Serialize startup and all state-changing events. Register listeners before any
// asynchronous initialization so an MV3 wake cannot lose its triggering event.
let pending = Promise.resolve()
async function enqueue(operation: () => Promise<void>): Promise<void> {
    const previous = pending
    let release!: () => void
    pending = new Promise<void>((resolve) => {
        release = resolve
    })
    await previous
    try {
        await operation()
    } finally {
        release()
    }
}
const ringController = createRingController((ringUntil) => {
    void enqueue(() => handleRingEnded(ringUntil)).catch(reportError)
}, reportError)
const notifications = createNotifications(
    NOTIFICATION_ID,
    (action) => {
        void enqueue(() => resolveAlarm(action)).catch(reportError)
    },
    () => {
        void enqueue(bringSurfaceForward).catch(reportError)
    },
    reportError,
)

// ---- Storage --------------------------------------------------------

async function readRecord(): Promise<TimerRecord> {
    const stored = await chrome.storage.local.get(TIMER_STORAGE_KEY)
    return normalizeTimerRecord(stored[TIMER_STORAGE_KEY])
}

async function writeRecord(record: TimerRecord): Promise<void> {
    await chrome.storage.local.set({ [TIMER_STORAGE_KEY]: record })
}

/**
 * The user's settings, read from `chrome.storage.sync` with the `local` fallback
 * the settings screen writes to (`chromeSettings.ts`). The worker only needs
 * these for the alarm: which chime, how loud, and how long it rings.
 */
async function readSettings(): Promise<TimerSettings> {
    try {
        const synced = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY)
        if (synced[SETTINGS_STORAGE_KEY] !== undefined) {
            return normalizeSettings(synced[SETTINGS_STORAGE_KEY])
        }
    } catch (error) {
        console.warn(LOG_PREFIX, 'sync settings read failed:', (error as Error).message)
    }
    try {
        const local = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
        return normalizeSettings(local[SETTINGS_STORAGE_KEY])
    } catch {
        return DEFAULT_SETTINGS
    }
}

/** Whether the alarm should be audible for an expired record under `settings`. */
function alarmWanted(record: TimerRecord, settings: TimerSettings): boolean {
    return record.status === 'expired' && !record.muted && settings.chime !== 'silent' && settings.volume > 0
}

/** Clears `ringUntil` from any record that is not ringing (muted or not expired). */
function disarmRing(record: TimerRecord): TimerRecord {
    if (record.status === 'expired' && !record.muted) return record
    return record.ringUntil === null ? record : { ...record, ringUntil: null }
}

// ---- Toolbar --------------------------------------------------------

function setBadge(text: string): void {
    chrome.action.setBadgeText({ text }).catch((error: Error) => {
        console.warn(LOG_PREFIX, 'setBadgeText failed:', error.message)
    })
}

function setBadgeColor(color: string): void {
    chrome.action.setBadgeBackgroundColor({ color }).catch((error: Error) => {
        console.warn(LOG_PREFIX, 'setBadgeBackgroundColor failed:', error.message)
    })
}

function setTitle(title: string): void {
    chrome.action.setTitle({ title }).catch((error: Error) => {
        console.warn(LOG_PREFIX, 'setTitle failed:', error.message)
    })
}

function setToolbarIcon(icon: ToolbarIcon): void {
    chrome.action.setIcon({ path: icon === 'alert' ? ALERT_ICON : TOOLBAR_ICON }).catch((error: Error) => {
        console.warn(LOG_PREFIX, 'setIcon failed:', error.message)
    })
}

function formatMMSS(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(total / 60)
    const rest = total % 60
    return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** The elapsed period, phrased for the notification (AGENTS.md "Notification"). */
function describeDuration(seconds: number): string {
    const total = Math.max(0, Math.round(seconds))
    if (total < 60) return `${total} seconds`
    const minutes = Math.floor(total / 60)
    const rest = total % 60
    const minuteLabel = `${minutes} minute${minutes === 1 ? '' : 's'}`
    return rest === 0 ? minuteLabel : `${minuteLabel} ${rest} seconds`
}

/**
 * Paints the toolbar badge — text and colour from `badge.ts`, the icon from
 * `alarm.ts` — and the title that goes with it.
 */
function describeBadge(record: TimerRecord, remaining: number): void {
    const badge = badgePlanFor(record, remaining)
    setBadge(badge.text)
    setBadgeColor(badge.color)
    setToolbarIcon(toolbarIconFor(record, Date.now()))

    switch (record.status) {
        case 'running':
            setTitle(formatMMSS(remaining))
            return

        case 'paused':
            setTitle(`Paused · ${formatMMSS(remaining)}`)
            return

        case 'expired':
            setTitle(ringingNow(record, Date.now()) ? 'Alarm ringing — open the timer to stop it' : 'Time is up')
            return

        default:
            setTitle(BASE_TITLE)
    }
}

async function updateBadge(record: TimerRecord): Promise<void> {
    const now = Date.now()
    const resolved = expireIfElapsed(record, now)
    describeBadge(resolved, remainingFrom(resolved, now))
}

// ---- Alarms ---------------------------------------------------------

async function syncAlarms(record: TimerRecord): Promise<void> {
    await chrome.alarms.clear(TICK_ALARM)
    await chrome.alarms.clear(TIMEUP_ALARM)
    if (record.status === 'running' && record.endTime !== null) {
        await chrome.alarms.create(TIMEUP_ALARM, { when: record.endTime })
        await chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES })
    }
}

// ---- Notification and audio hosts ----------------------------------

function notifyElapsed(record: TimerRecord, ring: boolean): void {
    notifications.show(
        {
            type: 'basic',
            iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
            title: BASE_TITLE,
            message: `Time is up — ${describeDuration(record.durationSeconds)}.`,
        },
        ring,
    )
}

function clearNotification(): void {
    notifications.clear()
}

async function startRing(record: TimerRecord, settings: TimerSettings): Promise<void> {
    try {
        await ringController.start(record, settings)
    } catch (error) {
        reportError(error)
        await ringController.stop().catch(reportError)
        if (record.ringUntil !== null) await handleRingEnded(record.ringUntil)
    }
}

async function stopRing(): Promise<void> {
    await ringController.stop().catch(reportError)
}

// ---- Surfaces -------------------------------------------------------

/**
 * Brings a timer surface to the front so the user can see what is ringing:
 * focus the fullscreen tab if one is open (or a popup opened as a tab), and only
 * open the fullscreen page when neither is (AGENTS.md "Full screen").
 */
async function bringSurfaceForward(): Promise<void> {
    try {
        await revealSurface(TIMER_PAGES)
    } catch (error) {
        console.warn(LOG_PREFIX, 'could not bring a timer surface forward:', (error as Error).message)
    }
}

// ---- Timeup ---------------------------------------------------------

/**
 * Guards against two triggers noticing the same expiry at once. The timeup
 * alarm and the periodic tick can both see the timer run out, and each handler
 * runs across `await`s, so without this the expiry would be handled twice — two
 * notifications and two tabs.
 */
let handlingTimeup = false

async function handleTimeup(): Promise<void> {
    if (handlingTimeup) return
    handlingTimeup = true
    try {
        const now = Date.now()
        const stored = await readRecord()
        // Only a running timer expires here: an already-expired record is left
        // alone, so waking the worker can never ring a second time.
        if (stored.status !== 'running') return

        const expired = expireIfElapsed(stored, now)
        if (expired.status !== 'expired') {
            // The alarm fired a moment early; keep the schedule ticking.
            await syncAlarms(expired)
            await updateBadge(expired)
            return
        }

        const settings = await readSettings()
        const ring = alarmWanted(expired, settings)
        const record: TimerRecord = { ...expired, ringUntil: ring ? now + settings.alarmSeconds * 1000 : null }
        console.log(LOG_PREFIX, `time up after ${record.durationSeconds}s`)
        await writeRecord(record)
        await syncAlarms(record)
        notifyElapsed(record, ring)
        if (ring) {
            await startRing(record, settings)
            await bringSurfaceForward()
        }
        await updateBadge(await readRecord())
    } finally {
        handlingTimeup = false
    }
}

async function handleTick(): Promise<void> {
    const record = await readRecord()
    if (record.status === 'running' && remainingFrom(record, Date.now()) <= 0) {
        await handleTimeup()
        return
    }
    await updateBadge(record)
}

/** The offscreen document finished its ring on its own: drop the alert. */
async function handleRingEnded(ringUntil: number): Promise<void> {
    const record = await readRecord()
    // Nothing left to silence — the page already stopped — but close it so the
    // extension is not left holding an audio-capable document.
    if (record.ringUntil !== ringUntil) return
    await stopRing()
    const next: TimerRecord = { ...record, ringUntil: null }
    await writeRecord(next)
    await updateBadge(next)
}

/**
 * Acknowledges the alarm: apply `action` to the expired timer, silence the sound
 * and dismiss the notice. Stop (and simply closing the notification) resets the
 * timer, so it never rings again for a timer already acknowledged; Restart runs
 * the last duration again. Either way the ring is stopped immediately.
 */
async function resolveAlarm(action: TimerAction): Promise<void> {
    const record = await readRecord()
    const next = disarmRing(reduceTimer(record, { action }, Date.now()))
    await writeRecord(next)
    await syncAlarms(next)
    await stopRing()
    clearNotification()
    await updateBadge(next)
}

async function applyAction(request: TimerRequest): Promise<void> {
    const now = Date.now()
    const current = expireIfElapsed(await readRecord(), now)
    const next = disarmRing(reduceTimer(current, request, now))
    await writeRecord(next)
    await syncAlarms(next)

    if (next.status === 'expired') {
        if (next.ringUntil === null) await stopRing()
    } else if (current.status === 'expired') {
        // The user acted on a ringing timer: silence it and clear the notice.
        await stopRing()
        clearNotification()
    }

    await updateBadge(next)
}

// ---- Messages -------------------------------------------------------

chrome.runtime.onMessage.addListener(
    (
        message: unknown,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: TimerResponse) => void,
    ): boolean => {
        // The offscreen document reporting it stopped ringing.
        if (isRingEndedMessage(message)) {
            void enqueue(() => handleRingEnded(message.ringUntil)).catch(reportError)
            return false
        }
        // Anything else that is not a timer action (e.g. our own message to the
        // offscreen document) is not ours to answer.
        if (!isTimerRequest(message)) return false
        void (async () => {
            try {
                await enqueue(() => applyAction(message))
                sendResponse({ ok: true })
            } catch (error) {
                const failure = error as Error
                console.error(LOG_PREFIX, 'ERROR:', failure.message, failure.stack)
                sendResponse({ ok: false, error: failure.message })
            }
        })()
        return true // keep the channel open for the async response
    },
)

chrome.alarms.onAlarm.addListener((alarm) => {
    console.log(LOG_PREFIX, 'alarm fired:', alarm.name)
    if (alarm.name === TIMEUP_ALARM) {
        void enqueue(handleTimeup).catch(reportError)
    } else if (alarm.name === TICK_ALARM) {
        void enqueue(handleTick).catch(reportError)
    }
})

// ---- Startup --------------------------------------------------------

async function startup(): Promise<void> {
    console.log(LOG_PREFIX, 'START')
    const now = Date.now()
    const stored = await readRecord()
    const resolved = expireIfElapsed(stored, now)

    if (stored.status === 'running' && resolved.status === 'expired') {
        console.log(LOG_PREFIX, 'timer ran out while the worker was asleep')
        await handleTimeup()
        return
    }

    const disarmed = disarmRing(resolved)
    const record =
        disarmed.ringUntil !== null && disarmed.ringUntil <= now ? { ...disarmed, ringUntil: null } : disarmed
    await writeRecord(record)
    await syncAlarms(record)

    if (ringingNow(record, now)) {
        // A ring was already underway when the worker went to sleep: ring out the
        // remainder, but do not raise a second notification for it.
        await startRing(record, await readSettings())
    } else if (record.status === 'expired') {
        await stopRing()
    }

    await updateBadge(await readRecord())
}

// Firefox loses alarms on browser shutdown. This listener wakes its event page
// even if no timer surface is opened; initialization itself runs once per host.
let initialization: Promise<void> | undefined
function initialize(): Promise<void> {
    initialization ??= enqueue(startup)
    return initialization
}
chrome.runtime.onStartup.addListener(() => {
    void initialize().catch(reportError)
})
// A received storage event keeps the Firefox audio host alive during its ring.
chrome.storage.onChanged.addListener(() => {})
void initialize().catch(reportError)
