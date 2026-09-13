import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LANGUAGES } from "../dist/utils/constants.js"
import { insertIndent, lineCount, tokenize } from "../dist/practice/highlight.js"
import { PROBLEMS } from "../dist/practice/problems.js"

const join = (tokens) => tokens.map((token) => token.value).join("")
const typesOf = (tokens, type) => tokens.filter((token) => token.type === type).map((token) => token.value)

describe("editor tokenizer", () => {
	it("is round-trip safe for every bundled starter snippet", () => {
		for (const problem of PROBLEMS) {
			for (const language of LANGUAGES) {
				const code = problem.starterCode[language]
				assert.equal(join(tokenize(code, language)), code, `${problem.name}/${language}`)
			}
		}
	})

	it("is round-trip safe for awkward input", () => {
		const samples = [
			"",
			"   ",
			"\n\n",
			"const s = 'unterminated\nlet x = 1",
			"/* unterminated block",
			"// trailing comment",
			"const t = `a ${b} c`",
			"const escaped = 'it\\'s fine'",
			"0x1f + 3.14 + 42",
			"<>!@#%^&*()[]{}",
		]
		for (const sample of samples) {
			assert.equal(join(tokenize(sample, "javascript")), sample, JSON.stringify(sample))
		}
	})

	it("recognises JavaScript keywords, strings, numbers and comments", () => {
		const tokens = tokenize('function f() { /* hi */ return "a" + 12 } // done', "javascript")
		assert.ok(typesOf(tokens, "keyword").includes("function"))
		assert.ok(typesOf(tokens, "keyword").includes("return"))
		assert.deepEqual(typesOf(tokens, "string"), ['"a"'])
		assert.deepEqual(typesOf(tokens, "number"), ["12"])
		assert.deepEqual(typesOf(tokens, "comment"), ["/* hi */", "// done"])
	})

	it("uses # comments and triple-quoted strings for Python", () => {
		const tokens = tokenize('def f():\n    """doc"""\n    # note\n    return None', "python")
		assert.ok(typesOf(tokens, "keyword").includes("def"))
		assert.ok(typesOf(tokens, "keyword").includes("None"))
		assert.deepEqual(typesOf(tokens, "string"), ['"""doc"""'])
		assert.deepEqual(typesOf(tokens, "comment"), ["# note"])
	})

	it("does not treat # as a comment in C-like languages", () => {
		const tokens = tokenize("#include <stdio.h>\nint main() { return 0; }", "c")
		assert.deepEqual(typesOf(tokens, "comment"), [])
		assert.ok(typesOf(tokens, "keyword").includes("int"))
	})

	it("keeps language keyword sets separate", () => {
		assert.ok(typesOf(tokenize("vector<int> v;", "cpp"), "keyword").includes("vector"))
		assert.equal(typesOf(tokenize("vector v;", "java"), "keyword").includes("vector"), false)
		assert.ok(typesOf(tokenize("String s;", "java"), "keyword").includes("String"))
	})

	it("does not highlight keywords inside identifiers", () => {
		const tokens = tokenize("const returnValue = 1", "javascript")
		assert.equal(typesOf(tokens, "keyword").includes("return"), false)
		assert.ok(typesOf(tokens, "keyword").includes("const"))
	})

	it("counts editor lines for the gutter", () => {
		assert.equal(lineCount(""), 1)
		assert.equal(lineCount("a"), 1)
		assert.equal(lineCount("a\nb"), 2)
		assert.equal(lineCount("a\nb\n"), 3)
	})
})

describe("editor indentation", () => {
	it("inserts spaces at the caret", () => {
		assert.deepEqual(insertIndent("ab", 1, 1, 2), { value: "a  b", caret: 3 })
	})

	it("replaces the selection", () => {
		assert.deepEqual(insertIndent("abcd", 1, 3, 4), { value: "a    d", caret: 5 })
	})

	it("clamps unreasonable tab sizes", () => {
		assert.equal(insertIndent("", 0, 0, 0).value, " ")
		assert.equal(insertIndent("", 0, 0, 99).value, " ".repeat(8))
	})
})
