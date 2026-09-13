import type { Category, Difficulty, Language, PracticeSession, SessionStatus, TimerState } from "../types/models.js"
import { MAX_HISTORY } from "../utils/constants.js"
import { createId } from "../utils/id.js"
import { nowIso } from "../utils/time.js"
import { loadStore, mutateStore } from "../storage/repository.js"

/**
 * Practice session + timer service.
 *
 * The timer is stored as `accumulatedMs` plus `runningSince` (an epoch
 * timestamp). Elapsed time is always *derived* from the wall clock, so closing
 * the popup, reloading the practice page, or the service worker being suspended
 * cannot drift or lose time. `setInterval` is used only to repaint the label.
 */

export class TimerError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "TimerError"
	}
}

export interface ProblemRef {
	problemId: string
	problemName: string
	difficulty: Difficulty
	category: Category
	language?: Language | null
}

export function elapsedMs(timer: TimerState | null, at: number = Date.now()): number {
	if (!timer) return 0
	const live = timer.runningSince === null ? 0 : Math.max(0, at - timer.runningSince)
	return timer.accumulatedMs + live
}

export function isRunning(timer: TimerState | null): boolean {
	return timer !== null && timer.runningSince !== null
}

export function startTimer(problem: ProblemRef, at: number = Date.now()): TimerState {
	return {
		problemId: problem.problemId,
		problemName: problem.problemName,
		difficulty: problem.difficulty,
		category: problem.category,
		language: problem.language ?? null,
		startedAt: nowIso(at),
		accumulatedMs: 0,
		runningSince: at,
	}
}

export function pauseTimer(timer: TimerState, at: number = Date.now()): TimerState {
	if (timer.runningSince === null) return timer
	return { ...timer, accumulatedMs: elapsedMs(timer, at), runningSince: null }
}

export function resumeTimer(timer: TimerState, at: number = Date.now()): TimerState {
	if (timer.runningSince !== null) return timer
	return { ...timer, runningSince: at }
}

export function resetTimer(timer: TimerState, at: number = Date.now()): TimerState {
	return { ...timer, startedAt: nowIso(at), accumulatedMs: 0, runningSince: null }
}

/** Pure session builder used when a run is recorded. */
export function buildSession(
	timer: TimerState,
	status: SessionStatus,
	at: number = Date.now(),
	notes = "",
): PracticeSession {
	return {
		id: createId("ses"),
		problemId: timer.problemId,
		problemName: timer.problemName,
		difficulty: timer.difficulty,
		category: timer.category,
		language: timer.language,
		startedAt: timer.startedAt,
		completedAt: nowIso(at),
		durationMs: elapsedMs(timer, at),
		status,
		notes,
	}
}

/* ---- persisted operations ---- */

export async function getTimer(): Promise<TimerState | null> {
	return (await loadStore()).timer
}

export async function start(problem: ProblemRef): Promise<TimerState> {
	const { result } = await mutateStore((store) => {
		store.timer = startTimer(problem)
		return store.timer
	})
	return result
}

export async function pause(): Promise<TimerState> {
	const { result } = await mutateStore((store) => {
		if (!store.timer) throw new TimerError("No practice session is running.")
		store.timer = pauseTimer(store.timer)
		return store.timer
	})
	return result
}

export async function resume(): Promise<TimerState> {
	const { result } = await mutateStore((store) => {
		if (!store.timer) throw new TimerError("No practice session to resume.")
		store.timer = resumeTimer(store.timer)
		return store.timer
	})
	return result
}

export async function reset(): Promise<TimerState | null> {
	const { result } = await mutateStore((store) => {
		if (!store.timer) return null
		store.timer = resetTimer(store.timer)
		return store.timer
	})
	return result
}

export async function clear(): Promise<void> {
	await mutateStore((store) => {
		store.timer = null
	})
}

/** Records the outcome of the current session into practice history. */
export async function recordOutcome(status: SessionStatus, notes = ""): Promise<PracticeSession> {
	const { result } = await mutateStore((store) => {
		if (!store.timer) throw new TimerError("Start the timer before recording a result.")
		const session = buildSession(store.timer, status, Date.now(), notes)
		store.practiceHistory.unshift(session)
		if (store.practiceHistory.length > MAX_HISTORY) {
			store.practiceHistory.length = MAX_HISTORY
		}
		store.timer = resetTimer(store.timer)
		return session
	})
	return result
}

export async function listHistory(): Promise<PracticeSession[]> {
	return (await loadStore()).practiceHistory
}

export async function deleteSession(id: string): Promise<void> {
	await mutateStore((store) => {
		const index = store.practiceHistory.findIndex((session) => session.id === id)
		if (index === -1) throw new TimerError("That session no longer exists.")
		store.practiceHistory.splice(index, 1)
	})
}

export async function clearHistory(): Promise<void> {
	await mutateStore((store) => {
		store.practiceHistory = []
	})
}
