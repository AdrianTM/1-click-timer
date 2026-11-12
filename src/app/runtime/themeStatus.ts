import { useSyncExternalStore } from 'react'

// Per document: reports the palette actually applied by useSettingsTheme.
let status = 'Checking browser theme…'
const listeners = new Set<() => void>()

export function setThemeStatus(next: string): void {
    if (next === status) return
    status = next
    for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useThemeStatus(): string {
    return useSyncExternalStore(subscribe, () => status)
}
