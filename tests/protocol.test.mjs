import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	RUNNER_CHANNEL,
	buildRunnerRequest,
	isRunnerRequest,
	isRunnerResponse,
} from "../dist/practice/protocol.js"

const validRequest = () =>
	buildRunnerRequest({
		requestId: "run-1",
		code: "function twoSum(){ return [] }",
		functionName: "twoSum",
		cases: [{ name: "case 1", args: [[1, 2], 3], expected: [0, 1] }],
	})

describe("runner protocol", () => {
	it("builds a namespaced request", () => {
		const request = validRequest()
		assert.equal(request.channel, RUNNER_CHANNEL)
		assert.equal(request.type, "run")
		assert.equal(request.functionName, "twoSum")
		assert.ok(isRunnerRequest(request))
	})

	it("refuses to build a request for a non-identifier function name", () => {
		for (const name of ["two sum", "twoSum()", "a;b", "", "1abc", "fetch('x')"]) {
			assert.throws(
				() => buildRunnerRequest({ requestId: "r", code: "", functionName: name, cases: [] }),
				/not a valid function name/,
				name,
			)
		}
	})

	it("rejects hostile or malformed run requests", () => {
		const base = validRequest()
		assert.equal(isRunnerRequest(null), false)
		assert.equal(isRunnerRequest("run"), false)
		assert.equal(isRunnerRequest([base]), false)
		assert.equal(isRunnerRequest({ ...base, channel: "other-extension" }), false)
		assert.equal(isRunnerRequest({ ...base, type: "eval" }), false)
		assert.equal(isRunnerRequest({ ...base, requestId: "" }), false)
		assert.equal(isRunnerRequest({ ...base, code: 42 }), false)
		// An injected call expression must never reach the evaluator.
		assert.equal(isRunnerRequest({ ...base, functionName: "alert(1)" }), false)
		assert.equal(isRunnerRequest({ ...base, cases: "all" }), false)
		assert.equal(isRunnerRequest({ ...base, cases: [{ name: "x" }] }), false)
		assert.equal(isRunnerRequest({ ...base, cases: [{ args: [] }] }), false)
	})

	it("accepts a well formed response and rejects anything else", () => {
		const response = {
			channel: RUNNER_CHANNEL,
			type: "run-result",
			requestId: "run-1",
			ok: true,
			results: [],
			logs: [],
			summary: { total: 0, passed: 0, failed: 0, allPassed: false },
		}
		assert.ok(isRunnerResponse(response))
		assert.equal(isRunnerResponse({ ...response, channel: "x" }), false)
		assert.equal(isRunnerResponse({ ...response, type: "run" }), false)
		assert.equal(isRunnerResponse({ ...response, ok: "yes" }), false)
		assert.equal(isRunnerResponse({ ...response, results: null }), false)
		assert.equal(isRunnerResponse({ ...response, logs: "none" }), false)
		assert.equal(isRunnerResponse({ ...response, summary: undefined }), false)
		assert.equal(isRunnerResponse(undefined), false)
	})
})
