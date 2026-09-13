import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { createMemoryArea, setStorageArea } from "../dist/storage/area.js"
import { loadStore } from "../dist/storage/repository.js"
import {
	buildSession,
	clearHistory,
	deleteSession,
	elapsedMs,
	getTimer,
	isRunning,
	listHistory,
	pause,
	pauseTimer,
	recordOutcome,
	reset,
	resetTimer,
	resume,
	resumeTimer,
	start,
	startTimer,
} from "../dist/services/timer.js"

const problem = {
	problemId: "two-sum",
	problemName: "Two Sum",
	difficulty: "Easy",
	category: "Arrays",
	language: "python",
}

const T0 = 1_800_000_000_000

describe("timer arithmetic (wall-clock derived)", () => {
	it("starts running with zero elapsed time", () => {
		const timer = startTimer(problem, T0)
		assert.equal(timer.accumulatedMs, 0)
		assert.equal(timer.runningSince, T0)
		assert.equal(elapsedMs(timer, T0), 0)
		assert.equal(isRunning(timer), true)
	})

	it("derives elapsed time from the clock, not from intervals", () => {
		const timer = startTimer(problem, T0)
		assert.equal(elapsedMs(timer, T0 + 90_000), 90_000)
	})

	it("freezes elapsed time while paused", () => {
		const paused = pauseTimer(startTimer(problem, T0), T0 + 30_000)
		assert.equal(paused.runningSince, null)
		assert.equal(elapsedMs(paused, T0 + 600_000), 30_000, "time must not accrue while paused")
		assert.equal(isRunning(paused), false)
	})

	it("accumulates across resume cycles", () => {
		let timer = startTimer(problem, T0)
		timer = pauseTimer(timer, T0 + 10_000)
		timer = resumeTimer(timer, T0 + 100_000)
		assert.equal(elapsedMs(timer, T0 + 105_000), 15_000)
		timer = pauseTimer(timer, T0 + 105_000)
		timer = resumeTimer(timer, T0 + 200_000)
		assert.equal(elapsedMs(timer, T0 + 205_000), 20_000)
	})

	it("ignores redundant pause/resume calls", () => {
		const running = startTimer(problem, T0)
		assert.equal(resumeTimer(running, T0 + 5_000), running)
		const paused = pauseTimer(running, T0 + 5_000)
		assert.equal(pauseTimer(paused, T0 + 9_000), paused)
	})

	it("resets to zero and stops", () => {
		const timer = resetTimer(startTimer(problem, T0), T0 + 60_000)
		assert.equal(elapsedMs(timer, T0 + 120_000), 0)
		assert.equal(timer.runningSince, null)
	})

	it("treats a missing timer as zero elapsed time", () => {
		assert.equal(elapsedMs(null), 0)
		assert.equal(isRunning(null), false)
	})

	it("builds a session record with every required field", () => {
		const session = buildSession(startTimer(problem, T0), "solved", T0 + 125_000, "clean run")
		assert.deepEqual(Object.keys(session).sort(), [
			"category",
			"completedAt",
			"difficulty",
			"durationMs",
			"id",
			"language",
			"notes",
			"problemId",
			"problemName",
			"startedAt",
			"status",
		])
		assert.equal(session.durationMs, 125_000)
		assert.equal(session.status, "solved")
		assert.equal(session.problemName, "Two Sum")
	})
})

describe("persisted practice sessions", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("survives a popup close / reopen cycle", async () => {
		await start(problem)
		// Simulate the popup closing and reopening: fresh read of persisted state.
		const reloaded = await getTimer()
		assert.ok(reloaded)
		assert.equal(reloaded.problemId, "two-sum")
		assert.equal(isRunning(reloaded), true)
		const later = elapsedMs(reloaded, reloaded.runningSince + 45_000)
		assert.equal(later, 45_000)
	})

	it("pauses, resumes and resets through storage", async () => {
		await start(problem)
		const paused = await pause()
		assert.equal(paused.runningSince, null)
		const resumed = await resume()
		assert.notEqual(resumed.runningSince, null)
		const cleared = await reset()
		assert.equal(cleared.accumulatedMs, 0)
		assert.equal(cleared.runningSince, null)
	})

	it("refuses to pause when nothing is running", async () => {
		await assert.rejects(() => pause(), /No practice session is running/)
		await assert.rejects(() => recordOutcome("solved"), /Start the timer/)
	})

	it("records attempted, solved and failed outcomes into history", async () => {
		await start(problem)
		await recordOutcome("attempted", "ran out of time")
		await start({ ...problem, problemId: "valid-anagram", problemName: "Valid Anagram" })
		await recordOutcome("failed")
		await start(problem)
		await recordOutcome("solved")
		const history = await listHistory()
		assert.equal(history.length, 3)
		assert.deepEqual(
			[...history].map((session) => session.status).sort(),
			["attempted", "failed", "solved"],
		)
		assert.equal((await loadStore()).timer.accumulatedMs, 0, "timer resets after a recorded result")
	})

	it("deletes a single session and clears history", async () => {
		await start(problem)
		const session = await recordOutcome("solved")
		await deleteSession(session.id)
		assert.deepEqual(await listHistory(), [])
		await assert.rejects(() => deleteSession(session.id), /no longer exists/)
		await clearHistory()
		assert.deepEqual(await listHistory(), [])
	})
})
