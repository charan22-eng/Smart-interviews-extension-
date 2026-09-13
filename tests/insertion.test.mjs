/**
 * Code-insertion tests (Phase I).
 *
 * These cover the decision layer that every insert path shares: the popup and
 * options page both send an insert request to the background worker, which
 * forwards it either to the bundled practice page or, for a locally served
 * copy, through the content script. Whatever the hop, the resulting editor
 * text is decided by planInsert/composeCode, so that is what is tested here.
 *
 * Not covered automatically (documented honestly in the final report): the
 * live DOM write inside practice.ts and the content-script acknowledgement
 * timeout, both of which need a real browser.
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { composeCode, describeInsert, planInsert } from "../dist/practice/insert.js"
import {
	buildPageAck,
	buildPageEnvelope,
	isPageAck,
	isPageEnvelope,
} from "../dist/services/messaging.js"

const validPayload = {
	snippetId: "snip_two_sum",
	title: "Two Sum",
	language: "javascript",
	code: "function twoSum(nums, target) {\n\treturn []\n}",
	mode: "replace",
}

const payload = (overrides = {}) => ({ ...validPayload, ...overrides })

describe("insertion: valid snippet", () => {
	it("replaces the editor contents in replace mode", () => {
		const plan = planInsert(payload(), "// starter code", "javascript")
		assert.equal(plan.ok, true)
		assert.equal(plan.nextCode, validPayload.code)
		assert.equal(plan.payload.snippetId, "snip_two_sum")
	})

	it("reports when the editor language has to follow the snippet", () => {
		const changed = planInsert(payload({ language: "python" }), "", "javascript")
		assert.equal(changed.ok, true)
		assert.equal(changed.languageChanged, true)

		const same = planInsert(payload(), "", "javascript")
		assert.equal(same.ok, true)
		assert.equal(same.languageChanged, false)
	})

	it("does not mutate the snippet code it was given", () => {
		const input = payload()
		const before = input.code
		planInsert(input, "existing work", "javascript")
		assert.equal(input.code, before)
	})
})

describe("insertion: append mode", () => {
	it("separates appended code with a blank line", () => {
		const result = composeCode("const a = 1", payload({ mode: "append", code: "const b = 2" }))
		assert.equal(result, "const a = 1\n\nconst b = 2")
	})

	it("does not double a newline the user already typed", () => {
		const result = composeCode("const a = 1\n", payload({ mode: "append", code: "const b = 2" }))
		assert.equal(result, "const a = 1\n\nconst b = 2")
	})

	it("behaves like replace when the editor is empty or whitespace only", () => {
		assert.equal(composeCode("", payload({ mode: "append" })), validPayload.code)
		assert.equal(composeCode("   \n\t\n", payload({ mode: "append" })), validPayload.code)
	})

	it("keeps the existing work intact", () => {
		const existing = "function solved() {\n\treturn true\n}"
		const result = composeCode(existing, payload({ mode: "append" }))
		assert.ok(result.startsWith(existing))
		assert.ok(result.endsWith(validPayload.code))
	})
})

describe("insertion: rejected requests", () => {
	it("rejects empty code instead of clearing the editor", () => {
		const plan = planInsert(payload({ code: "" }), "const keep = 1", "javascript")
		assert.equal(plan.ok, false)
		assert.equal(typeof plan.error, "string")
		assert.ok(plan.error.length > 0)
	})

	it("rejects non-string code", () => {
		const plan = planInsert(payload({ code: 42 }), "", "javascript")
		assert.equal(plan.ok, false)
		assert.equal(plan.error, "Insert payload code must be a string.")
	})

	it("rejects a missing snippet id", () => {
		const plan = planInsert(payload({ snippetId: "  " }), "", "javascript")
		assert.equal(plan.ok, false)
		assert.equal(plan.error, "Insert payload is missing a snippet id.")
	})

	it("rejects an unknown language", () => {
		const plan = planInsert(payload({ language: "rust" }), "", "javascript")
		assert.equal(plan.ok, false)
	})

	it("rejects an unknown insert mode instead of guessing replace", () => {
		const plan = planInsert(payload({ mode: "overwrite-everything" }), "const keep = 1", "javascript")
		assert.equal(plan.ok, false)
		assert.equal(plan.error, "Insert payload has an unsupported insert mode.")
	})

	it("still defaults an omitted mode to replace", () => {
		const { mode, ...withoutMode } = payload()
		const plan = planInsert(withoutMode, "const keep = 1", "javascript")
		assert.equal(plan.ok, true)
		assert.equal(plan.payload.mode, "replace")
		assert.equal(plan.nextCode, validPayload.code)
	})

	it("rejects malformed messages of any shape", () => {
		for (const bad of [null, undefined, 0, "insert", [], true]) {
			const plan = planInsert(bad, "", "javascript")
			assert.equal(plan.ok, false, `expected ${String(bad)} to be rejected`)
			assert.equal(plan.error, "Insert payload must be an object.")
		}
	})

	it("never exposes a payload on a rejected plan", () => {
		const plan = planInsert({ snippetId: "x" }, "", "javascript")
		assert.equal(plan.ok, false)
		assert.equal(plan.payload, undefined)
		assert.equal(plan.nextCode, undefined)
	})
})

describe("insertion: content script hop", () => {
	it("wraps a validated payload in a page envelope the page accepts", () => {
		const envelope = buildPageEnvelope(validPayload)
		assert.equal(isPageEnvelope(envelope), true)
		const plan = planInsert(envelope.payload, "", "javascript")
		assert.equal(plan.ok, true)
		assert.equal(plan.nextCode, validPayload.code)
	})

	it("refuses envelopes carrying an invalid payload", () => {
		assert.equal(isPageEnvelope({ ...buildPageEnvelope(validPayload), payload: { code: "" } }), false)
		assert.equal(isPageEnvelope({ channel: "someone-else", type: "insert-code", payload: validPayload }), false)
	})

	it("round-trips success and failure acknowledgements", () => {
		const success = buildPageAck({ ok: true, target: "practice editor" })
		assert.equal(isPageAck(success), true)
		assert.equal(success.result.ok, true)

		const failure = buildPageAck({ ok: false, error: "The practice editor is unavailable." })
		assert.equal(isPageAck(failure), true)
		assert.equal(failure.result.ok, false)
		assert.equal(failure.result.error, "The practice editor is unavailable.")
	})
})

describe("insertion: user feedback", () => {
	it("describes what was inserted, where and how", () => {
		const message = describeInsert(payload({ mode: "append" }), "JavaScript")
		assert.match(message, /Two Sum/)
		assert.match(message, /JavaScript/)
		assert.match(message, /append/)
	})
})
