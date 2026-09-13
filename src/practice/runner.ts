/**
 * The single code evaluator in this project, and the only file allowed to
 * compile strings into functions.
 *
 * It runs inside practice/runner.html, which is declared as a sandboxed page
 * in the manifest. A sandboxed extension page has a unique opaque origin and
 * no access to the chrome.* APIs, so code typed into the practice editor can
 * be executed for practice without reaching extension storage, the user's
 * tabs, or any site. The practice page talks to this frame with postMessage.
 *
 * Browser verification showed that evaluating on this frame's own thread was
 * not enough: a sandboxed frame shares the renderer main thread with the page
 * that embeds it, so `while (true) {}` froze the whole practice tab and the
 * page-side timeout never got a chance to fire. Runs therefore happen on a
 * dedicated worker thread, which can actually be terminated when it overruns.
 * If a browser refuses to start that worker, the frame falls back to running
 * on its own thread so the feature still works, with the old caveat.
 *
 * Only the user's own editor contents are ever evaluated here, on an explicit
 * Run/Test click. Nothing is fetched, imported or executed from the network,
 * and imported JSON is never sent to this frame.
 */

import { describeValue, gradeCase, structuredCopy, summarize, type CaseResult } from "./grading.js"
import { RUNNER_CHANNEL, isRunnerRequest, type RunnerRequest, type RunnerResponse } from "./protocol.js"

/**
 * How long one run may take on the worker thread. The practice page keeps its
 * own, slightly longer timeout as a backstop for the whole round trip.
 */
const WORKER_TIMEOUT_MS = 4000
const MAX_LOGS = 200

export const TIMEOUT_MESSAGE = `Your code did not finish within ${WORKER_TIMEOUT_MS / 1000} seconds and was stopped. Check for an infinite loop or a very slow solution.`

/** One case, executed. `value` is JSON-shaped so it survives postMessage. */
type CaseOutcome =
	| { ok: true; value: unknown; isUndefined?: boolean }
	| { ok: false; error: string }

interface RunOutput {
	logs: string[]
	outcomes: CaseOutcome[]
	error?: string
}

/**
 * Source for the worker thread. It is deliberately plain ES5-style script so
 * it can be started from a blob URL without a build step, and it only ever
 * receives the editor contents plus the problem's test cases.
 */
const WORKER_SOURCE = `"use strict";
var MAX_LOGS = ${MAX_LOGS};

function safeText(value) {
	if (typeof value === "string") return value;
	try {
		var text = JSON.stringify(value);
		return typeof text === "string" ? text : String(value);
	} catch (error) {
		return String(value);
	}
}

function jsonClone(value) {
	try {
		return JSON.parse(JSON.stringify(value === undefined ? null : value));
	} catch (error) {
		return safeText(value);
	}
}

function describeError(error) {
	if (error && typeof error.message === "string") {
		return (error.name || "Error") + ": " + error.message;
	}
	return String(error);
}

self.onmessage = function (event) {
	var request = event.data || {};
	var logs = [];

	function writer(prefix) {
		return function () {
			if (logs.length >= MAX_LOGS) return;
			var parts = [];
			for (var i = 0; i < arguments.length; i += 1) parts.push(safeText(arguments[i]));
			logs.push(prefix + parts.join(" "));
		};
	}

	var sandboxConsole = {
		log: writer(""),
		info: writer(""),
		debug: writer(""),
		warn: writer("warning: "),
		error: writer("error: ")
	};

	try {
		var factory = new Function(
			"console",
			'"use strict";\\n' + request.code + '\\n;return typeof ' + request.functionName + ' === "function" ? ' + request.functionName + ' : null;'
		);
		var solution = factory(sandboxConsole);
		if (typeof solution !== "function") {
			self.postMessage({
				logs: logs,
				outcomes: [],
				error: "No function named " + request.functionName + " was found. Define function " + request.functionName + "(...) so the tests can call it."
			});
			return;
		}

		var cases = request.cases || [];
		var outcomes = [];
		for (var index = 0; index < cases.length; index += 1) {
			var args = jsonClone(cases[index] && cases[index].args ? cases[index].args : []);
			try {
				var value = solution.apply(null, args);
				outcomes.push({ ok: true, value: jsonClone(value), isUndefined: typeof value === "undefined" });
			} catch (error) {
				outcomes.push({ ok: false, error: describeError(error) });
			}
		}
		self.postMessage({ logs: logs, outcomes: outcomes });
	} catch (error) {
		self.postMessage({ logs: logs, outcomes: [], error: describeError(error) });
	}
};
`

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Trusts nothing from the worker message: shapes are checked, not assumed. */
function readRunOutput(value: unknown): RunOutput {
	if (!isRecord(value)) return { logs: [], outcomes: [], error: "The code runner returned an unreadable result." }
	const logs = Array.isArray(value.logs)
		? value.logs.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_LOGS)
		: []
	const outcomes: CaseOutcome[] = []
	if (Array.isArray(value.outcomes)) {
		for (const entry of value.outcomes) {
			if (!isRecord(entry)) continue
			if (entry.ok === true) {
				outcomes.push({ ok: true, value: entry.value, isUndefined: entry.isUndefined === true })
			} else {
				outcomes.push({ ok: false, error: typeof entry.error === "string" ? entry.error : "The code threw an error." })
			}
		}
	}
	return {
		logs,
		outcomes,
		error: typeof value.error === "string" ? value.error : undefined,
	}
}

class RunTimeoutError extends Error {
	constructor() {
		super(TIMEOUT_MESSAGE)
		this.name = "RunTimeoutError"
	}
}

/** Runs the request on a worker thread that can be terminated on overrun. */
function runOnWorker(request: RunnerRequest): Promise<RunOutput> {
	return new Promise<RunOutput>((resolve, reject) => {
		const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }))
		let worker: Worker
		try {
			worker = new Worker(blobUrl)
		} catch (error) {
			URL.revokeObjectURL(blobUrl)
			reject(error instanceof Error ? error : new Error(String(error)))
			return
		}

		let settled = false
		const finish = (outcome: { value: RunOutput } | { failure: Error }): void => {
			if (settled) return
			settled = true
			window.clearTimeout(timer)
			worker.terminate()
			URL.revokeObjectURL(blobUrl)
			if ("value" in outcome) resolve(outcome.value)
			else reject(outcome.failure)
		}

		const timer = window.setTimeout(() => finish({ failure: new RunTimeoutError() }), WORKER_TIMEOUT_MS)
		worker.onmessage = (event: MessageEvent<unknown>) => finish({ value: readRunOutput(event.data) })
		worker.onerror = (event: ErrorEvent) => {
			event.preventDefault?.()
			finish({ failure: new Error(event.message || "The code runner could not start.") })
		}

		try {
			worker.postMessage({
				code: request.code,
				functionName: request.functionName,
				cases: request.cases.map((testCase) => ({ name: testCase.name, args: structuredCopy(testCase.args) })),
			})
		} catch (error) {
			finish({ failure: error instanceof Error ? error : new Error(String(error)) })
		}
	})
}

function renderLogValue(value: unknown): string {
	return typeof value === "string" ? value : describeValue(value)
}

/** Captures console output so it can be shown in the page's output panel. */
function createConsole(logs: string[]): Record<string, (...args: unknown[]) => void> {
	const write = (prefix: string) => (...args: unknown[]) => {
		if (logs.length >= MAX_LOGS) return
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

/**
 * Fallback path used only when the worker cannot start. This blocks the
 * frame's thread, which is exactly the limitation the worker removes.
 */
function runOnThisThread(request: RunnerRequest): RunOutput {
	const logs: string[] = []
	try {
		const factory = new Function(
			"console",
			`"use strict";\n${request.code}\n;return typeof ${request.functionName} === "function" ? ${request.functionName} : null;`,
		)
		const solution = factory(createConsole(logs)) as unknown
		if (typeof solution !== "function") {
			return {
				logs,
				outcomes: [],
				error: `No function named ${request.functionName} was found. Define function ${request.functionName}(...) so the tests can call it.`,
			}
		}
		const callable = solution as (...args: unknown[]) => unknown
		const outcomes = request.cases.map((testCase): CaseOutcome => {
			try {
				const value = callable(...structuredCopy(testCase.args))
				return { ok: true, value, isUndefined: value === undefined }
			} catch (error) {
				return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
			}
		})
		return { logs, outcomes }
	} catch (error) {
		return {
			logs,
			outcomes: [],
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
		}
	}
}

/** Reuses the shared grading rules on the values the run produced. */
function gradeOutcomes(request: RunnerRequest, outcomes: CaseOutcome[]): CaseResult[] {
	return request.cases.map((testCase, index) => {
		const outcome = outcomes[index]
		return gradeCase(testCase, () => {
			if (!outcome) throw new Error("The code runner did not report a result for this case.")
			if (!outcome.ok) throw new Error(outcome.error)
			return outcome.isUndefined ? undefined : outcome.value
		})
	})
}

async function handle(request: RunnerRequest): Promise<RunnerResponse> {
	const base: Pick<RunnerResponse, "channel" | "type" | "requestId"> = {
		channel: RUNNER_CHANNEL,
		type: "run-result",
		requestId: request.requestId,
	}
	const failure = (error: string, logs: string[] = []): RunnerResponse => ({
		...base,
		ok: false,
		results: [],
		logs,
		summary: { total: 0, passed: 0, failed: 0, allPassed: false },
		error,
	})

	let output: RunOutput
	try {
		output = await runOnWorker(request)
	} catch (error) {
		if (error instanceof RunTimeoutError) return failure(error.message)
		// The worker could not start (for example a stricter CSP): run here instead.
		output = runOnThisThread(request)
	}

	if (output.error) return failure(output.error, output.logs)
	const results = gradeOutcomes(request, output.outcomes)
	return { ...base, ok: true, results, logs: output.logs, summary: summarize(results) }
}

function respond(target: MessageEventSource, origin: string, response: RunnerResponse): void {
	// The embedding page has a normal chrome-extension origin; "null" would only
	// appear if this frame were embedded by another sandboxed document.
	const destination = origin === "null" ? "*" : origin
	;(target as Window).postMessage(response, destination)
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
	// Only the embedding practice page may ask this frame to run anything.
	if (!event.source || event.source !== window.parent) return
	if (!isRunnerRequest(event.data)) return
	const source = event.source
	const origin = event.origin
	void handle(event.data).then((response) => respond(source, origin, response))
})
