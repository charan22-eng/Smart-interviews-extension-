/**
 * The message contract between the practice page and its sandboxed runner
 * frame.
 *
 * This lives in its own module on purpose: the practice page must be able to
 * build and validate runner messages without importing runner.ts, because
 * importing that module would install an evaluating message listener in the
 * main page. The page imports only these pure helpers; the evaluator stays
 * inside the sandboxed frame.
 */

import type { CaseResult, RunSummary, TestCase } from "./grading.js"

export const RUNNER_CHANNEL = "dsa-practice-runner"

/** The runner may only call a plain identifier, never an expression. */
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

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
	summary: RunSummary
	error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isTestCase(value: unknown): value is TestCase {
	return isRecord(value) && typeof value.name === "string" && Array.isArray(value.args)
}

export interface RunnerRequestInput {
	requestId: string
	code: string
	functionName: string
	cases: TestCase[]
}

export function buildRunnerRequest(input: RunnerRequestInput): RunnerRequest {
	if (!IDENTIFIER.test(input.functionName)) {
		throw new Error(`"${input.functionName}" is not a valid function name.`)
	}
	return {
		channel: RUNNER_CHANNEL,
		type: "run",
		requestId: input.requestId,
		code: input.code,
		functionName: input.functionName,
		cases: input.cases,
	}
}

export function isRunnerRequest(value: unknown): value is RunnerRequest {
	if (!isRecord(value)) return false
	return (
		value.channel === RUNNER_CHANNEL &&
		value.type === "run" &&
		typeof value.requestId === "string" &&
		value.requestId.length > 0 &&
		typeof value.code === "string" &&
		typeof value.functionName === "string" &&
		IDENTIFIER.test(value.functionName) &&
		Array.isArray(value.cases) &&
		value.cases.every(isTestCase)
	)
}

export function isRunnerResponse(value: unknown): value is RunnerResponse {
	if (!isRecord(value)) return false
	return (
		value.channel === RUNNER_CHANNEL &&
		value.type === "run-result" &&
		typeof value.requestId === "string" &&
		typeof value.ok === "boolean" &&
		Array.isArray(value.results) &&
		Array.isArray(value.logs) &&
		isRecord(value.summary)
	)
}
