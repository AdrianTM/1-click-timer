import { startChime, type ChimeId } from '../app/lib/chimes'

/** One ring: cancellation never reports natural completion, even after its deadline. */
export function playRing(options: {
    chime: ChimeId
    volume: number
    seconds: number
    onEnded: () => void
}): () => void {
    const silence = startChime(options.chime, options.volume)
    let stopped = false
    const stop = () => {
        if (stopped) return
        stopped = true
        clearTimeout(timeout)
        silence()
    }
    const timeout = setTimeout(
        () => {
            stop()
            options.onEnded()
        },
        Math.max(0, options.seconds * 1000),
    )
    return stop
}
