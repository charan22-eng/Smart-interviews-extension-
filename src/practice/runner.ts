/**
 * The single code evaluator in this project, and the only file allowed to use
 * `new Function`.
 *
 * It runs inside practice/runner.html, which is declared as a sandboxed page
 * in the manifest. A sandboxed extension page has a unique opaque origin and
 * no access to the chrome.* APIs, so code typed into the practice editor can
 * be executed for practice without reaching extension storage, the user's
 * tabs, or any site. The practice page talks to this frame with postMessage
 * and applies its own timeout, so an accidental infinite loop only hangs this
 * frame.
 *
 * Only the user's own editor contents are ever evaluated here, on an explicit
 * Run/Test click. Nothing is fetched, imported or executed from the network,
 * and imported JSON is never sent to this frame.
 */

import { describeValue, gradeCase, summarize, type CaseResult, type TestCase } from "./grading.js"

export const RUNNER_CHANNEL = "dsa-practice-runner"

export interface RunnerRequest {
	channel: typeof RUNNER_CHANNEL
	type: "run"
	requestId: string
	code: string
	functionName: string
	cases: TestCase[]
}

export interface RunnerResponse {
	channel: typeof RUNNER_CHANNEL
	type: "run-result"
	requestId: string
	ok: boolean
	results: CaseResult[]
	logs: string[]
	summary: { total: number; passed: number; failed: number; allPassed: boolean }
	error?: string
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function isRunnerRequest(value: unknown): value is RunnerRequest {
	if (typeof value !== "object" || value === null) return false
	const record = value as Record<string, unknown>
	return (
		record.channel === RUNNER_CHANNEL &&
		record.type === "run" &&
		typeof record.requestId === "string" &&
		typeof record.code === "string" &&
		typeof record.functionName === "string" &&
		IDENTIFIER.test(record.functionName) &&
		Array.isArray(record.cases)
	)
}

function renderLogValue(value: unknown): string {
	return typeof value === "string" ? value : describeValue(value)
}

/** Captures console output so it can be shown in the page's output panel. */
function createConsole(logs: string[]): Record<string, (...args: unknown[]) => void> {
	const write = (prefix: string) => (...args: unknown[]) => {
		if (logs.length >= 200) return
		logs.push(prefix + args.map(renderLogValue).join(" "))
	}
	return {
		log: write(""),
		info: write(""),
		debug: write(""),
		warn: write("warning: "),
		error: write("error: "),
	}
}

function compile(
	code: string,
	functionName: string,
	logs: string[],
): (...args: unknown[]) => unknown {
	const factory = new Function(
		"console",
		`"use strict";\n${code}\n;return typeof ${functionName} === "function" ? ${functionName} : null;`,
	)
	const candidate = factory(createConsole(logs)) as unknown
	if (typeof candidate !== "function") {
		throw new Error(
			`No function named ${functionName} was found. Define function ${functionName}(...) so the tests can call it.`,
		)
	}
	return candidate as (...args: unknown[]) => unknown
}

function respond(target: MessageEventSource, origin: string, response: RunnerResponse): void {
	const destination = origin === "null" ? "*" : origin
	;(target as Window).postMessage(response, destination)
}

function handle(request: RunnerRequest): RunnerResponse {
	const logs: string[] = []
	const base = {
		channel: RUNNER_CHANNEL as typeof RUNNER_CHANNEL,
		type: "run-result" as const,
		requestId: request.requestId,
	}
	try {
		const solution = compile(request.code, request.functionName, logs)
		const results = request.cases.map((testCase) =>
			gradeCase(testCase, (args) => solution(...args)),
		)
		return { ...base, ok: true, results, logs, summary: summarize(results) }
	} catch (error) {
		return {
			...base,
			ok: false,
			results: [],
			logs,
			summary: { total: 0, passed: 0, failed: 0, allPassed: false },
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
		}
	}
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
	// Only the embedding practice page may ask this frame to run anything.
	if (!event.source || event.source !== window.parent) return
	if (!isRunnerRequest(event.data)) return
	respond(event.source, event.origin, handle(event.data))
})
