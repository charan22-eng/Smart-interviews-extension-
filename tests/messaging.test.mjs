import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
	CHANNEL,
	PAGE_CHANNEL,
	buildPageAck,
	buildPageEnvelope,
	isAllowedLocalOrigin,
	isExtensionMessage,
	isPageAck,
	isPageEnvelope,
	validateInsertPayload,
} from "../dist/services/messaging.js"

const payload = {
	snippetId: "snip_1",
	title: "Two Sum",
	language: "python",
	code: "print(1)",
	mode: "replace",
}

describe("popup -> background messages", () => {
	it("accepts the supported message types", () => {
		assert.equal(isExtensionMessage({ type: "insert-snippet", snippetId: "snip_1" }), true)
		assert.equal(isExtensionMessage({ type: "open-practice" }), true)
		assert.equal(isExtensionMessage({ type: "open-snippet-manager" }), true)
		assert.equal(isExtensionMessage({ type: "practice-ready" }), true)
		assert.equal(isExtensionMessage({ type: "ping" }), true)
	})

	it("rejects unknown, malformed and hostile messages", () => {
		assert.equal(isExtensionMessage({ type: "delete-everything" }), false)
		assert.equal(isExtensionMessage({ type: "insert-snippet" }), false)
		assert.equal(isExtensionMessage({ type: "insert-snippet", snippetId: "" }), false)
		assert.equal(isExtensionMessage("insert-snippet"), false)
		assert.equal(isExtensionMessage(null), false)
		assert.equal(isExtensionMessage([{ type: "ping" }]), false)
		assert.equal(isExtensionMessage(JSON.parse('{"type":"ping","__proto__":{"x":1}}')), false)
	})

	it("validates the nested insert payload", () => {
		assert.equal(isExtensionMessage({ type: "insert-into-practice", payload }), true)
		assert.equal(
			isExtensionMessage({ type: "insert-into-practice", payload: { ...payload, code: "" } }),
			false,
		)
	})
})

describe("insert payload validation", () => {
	it("accepts a valid snippet payload and keeps both insert modes", () => {
		const check = validateInsertPayload(payload)
		assert.equal(check.ok, true)
		assert.equal(check.payload.code, "print(1)")
		assert.equal(validateInsertPayload({ ...payload, mode: "append" }).payload.mode, "append")
		assert.equal(validateInsertPayload({ ...payload, mode: "replace" }).payload.mode, "replace")
	})

	it("defaults an omitted mode to replace but rejects an unknown one", () => {
		const { mode, ...withoutMode } = payload
		assert.equal(validateInsertPayload(withoutMode).payload.mode, "replace")
		// Fail closed: an unrecognised mode must not be guessed, because guessing
		// "replace" would discard whatever the user already had in the editor.
		const weird = validateInsertPayload({ ...payload, mode: "weird" })
		assert.equal(weird.ok, false)
		assert.match(weird.error, /unsupported insert mode/)
	})

	it("rejects empty code with a user-facing message", () => {
		const check = validateInsertPayload({ ...payload, code: "" })
		assert.equal(check.ok, false)
		assert.match(check.error, /no code to insert/)
	})

	it("rejects missing ids, wrong types, oversized code and bad languages", () => {
		assert.match(validateInsertPayload({ ...payload, snippetId: "  " }).error, /snippet id/)
		assert.match(validateInsertPayload({ ...payload, code: 42 }).error, /must be a string/)
		assert.match(validateInsertPayload({ ...payload, code: "a".repeat(200_001) }).error, /too large/)
		assert.match(validateInsertPayload({ ...payload, language: "rust" }).error, /unsupported language/)
		assert.match(validateInsertPayload("nope").error, /must be an object/)
	})

	it("falls back to a safe title", () => {
		const { payload: normalized } = validateInsertPayload({ ...payload, title: 5 })
		assert.equal(normalized.title, "Snippet")
	})
})

describe("content script <-> practice page envelopes", () => {
	it("builds and recognises a namespaced insert envelope", () => {
		const envelope = buildPageEnvelope(payload)
		assert.equal(envelope.channel, CHANNEL)
		assert.equal(isPageEnvelope(envelope), true)
	})

	it("ignores envelopes from other channels or with bad payloads", () => {
		assert.equal(isPageEnvelope({ channel: "someone-else", type: "insert-code", payload }), false)
		assert.equal(isPageEnvelope({ channel: CHANNEL, type: "other", payload }), false)
		assert.equal(isPageEnvelope({ channel: CHANNEL, type: "insert-code", payload: {} }), false)
		assert.equal(isPageEnvelope(undefined), false)
	})

	it("builds and recognises the page acknowledgement", () => {
		const ok = buildPageAck({ ok: true, target: "practice editor" })
		assert.equal(ok.channel, PAGE_CHANNEL)
		assert.equal(isPageAck(ok), true)
		assert.equal(isPageAck(buildPageAck({ ok: false, error: "Editor unavailable" })), true)
		assert.equal(isPageAck({ channel: PAGE_CHANNEL, type: "insert-result" }), false)
		assert.equal(isPageAck({ channel: "evil", type: "insert-result", result: { ok: true } }), false)
	})
})

describe("origin allow-list", () => {
	it("allows only local practice origins", () => {
		assert.equal(isAllowedLocalOrigin("http://localhost:5173"), true)
		assert.equal(isAllowedLocalOrigin("http://127.0.0.1:8080"), true)
	})

	it("refuses every remote origin, including assessment platforms", () => {
		assert.equal(isAllowedLocalOrigin("https://smartinterviews.in"), false)
		assert.equal(isAllowedLocalOrigin("https://localhost.evil.com"), false)
		assert.equal(isAllowedLocalOrigin("file:///etc/passwd"), false)
		assert.equal(isAllowedLocalOrigin("null"), false)
	})
})
