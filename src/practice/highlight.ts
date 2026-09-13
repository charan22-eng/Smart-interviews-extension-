/**
 * A small, dependency-free tokenizer used for editor syntax highlighting.
 *
 * Why not Monaco or CodeMirror: both are megabytes of JavaScript and would
 * have to be vendored into the extension (no CDN loading is allowed under the
 * MV3 content security policy). The editor here needs keyword/string/comment/
 * number colouring and line numbers only, which this ~120 line tokenizer
 * covers for the five supported languages.
 *
 * `tokenize` is pure and round-trip safe: joining the token values always
 * reproduces the input exactly. The DOM layer builds one span per token with
 * createElement/textContent, so highlighted code is never parsed as HTML.
 */

import type { Language } from "../types/models.js"

export type TokenType = "plain" | "keyword" | "string" | "comment" | "number"

export interface Token {
	type: TokenType
	value: string
}

const SHARED_KEYWORDS = [
	"break",
	"case",
	"continue",
	"default",
	"do",
	"else",
	"for",
	"if",
	"return",
	"switch",
	"while",
]

const KEYWORDS: Record<Language, readonly string[]> = {
	javascript: [
		...SHARED_KEYWORDS,
		"async",
		"await",
		"class",
		"const",
		"delete",
		"export",
		"extends",
		"false",
		"function",
		"import",
		"in",
		"instanceof",
		"let",
		"new",
		"null",
		"of",
		"this",
		"throw",
		"true",
		"try",
		"catch",
		"typeof",
		"undefined",
		"var",
	],
	python: [
		"and",
		"as",
		"assert",
		"break",
		"class",
		"continue",
		"def",
		"del",
		"elif",
		"else",
		"except",
		"False",
		"finally",
		"for",
		"from",
		"global",
		"if",
		"import",
		"in",
		"is",
		"lambda",
		"None",
		"not",
		"or",
		"pass",
		"raise",
		"return",
		"self",
		"True",
		"try",
		"while",
		"with",
		"yield",
	],
	cpp: [
		...SHARED_KEYWORDS,
		"auto",
		"bool",
		"char",
		"class",
		"const",
		"delete",
		"double",
		"false",
		"float",
		"int",
		"long",
		"namespace",
		"new",
		"nullptr",
		"private",
		"public",
		"sizeof",
		"static",
		"string",
		"struct",
		"template",
		"true",
		"unsigned",
		"using",
		"vector",
		"void",
	],
	java: [
		...SHARED_KEYWORDS,
		"boolean",
		"char",
		"class",
		"double",
		"extends",
		"false",
		"final",
		"float",
		"implements",
		"import",
		"int",
		"long",
		"new",
		"null",
		"private",
		"public",
		"protected",
		"static",
		"String",
		"this",
		"throw",
		"true",
		"try",
		"void",
	],
	c: [
		...SHARED_KEYWORDS,
		"bool",
		"char",
		"const",
		"double",
		"float",
		"int",
		"long",
		"short",
		"sizeof",
		"static",
		"struct",
		"typedef",
		"unsigned",
		"void",
	],
}

const BLOCK_COMMENT_LANGUAGES: readonly Language[] = ["javascript", "cpp", "java", "c"]

function isIdentifierStart(char: string): boolean {
	return /[A-Za-z_$]/.test(char)
}

function isIdentifierPart(char: string): boolean {
	return /[A-Za-z0-9_$]/.test(char)
}

function isDigit(char: string): boolean {
	return char >= "0" && char <= "9"
}

/** Splits code into highlight tokens. Joining the values restores the input. */
export function tokenize(code: string, language: Language): Token[] {
	const keywords = new Set(KEYWORDS[language])
	const allowsBlockComments = BLOCK_COMMENT_LANGUAGES.includes(language)
	const lineComment = language === "python" ? "#" : "//"
	const tokens: Token[] = []
	let plain = ""

	const flush = (): void => {
		if (plain !== "") {
			tokens.push({ type: "plain", value: plain })
			plain = ""
		}
	}
	const push = (type: TokenType, value: string): void => {
		flush()
		tokens.push({ type, value })
	}

	let index = 0
	while (index < code.length) {
		const char = code[index] as string
		const rest = code.slice(index)

		if (rest.startsWith(lineComment)) {
			const end = code.indexOf("\n", index)
			const stop = end === -1 ? code.length : end
			push("comment", code.slice(index, stop))
			index = stop
			continue
		}

		if (allowsBlockComments && rest.startsWith("/*")) {
			const end = code.indexOf("*/", index + 2)
			const stop = end === -1 ? code.length : end + 2
			push("comment", code.slice(index, stop))
			index = stop
			continue
		}

		if (language === "python" && (rest.startsWith('"""') || rest.startsWith("'''"))) {
			const fence = rest.slice(0, 3)
			const end = code.indexOf(fence, index + 3)
			const stop = end === -1 ? code.length : end + 3
			push("string", code.slice(index, stop))
			index = stop
			continue
		}

		if (char === '"' || char === "'" || (language === "javascript" && char === "`")) {
			let cursor = index + 1
			while (cursor < code.length) {
				const current = code[cursor]
				if (current === "\\") {
					cursor += 2
					continue
				}
				if (current === char) {
					cursor += 1
					break
				}
				// An unterminated single-quoted string stops at the line end.
				if (current === "\n" && char !== "`") break
				cursor += 1
			}
			push("string", code.slice(index, Math.min(cursor, code.length)))
			index = Math.min(cursor, code.length)
			continue
		}

		if (isDigit(char)) {
			let cursor = index
			while (cursor < code.length && /[0-9a-fA-FxX._]/.test(code[cursor] as string)) cursor += 1
			push("number", code.slice(index, cursor))
			index = cursor
			continue
		}

		if (isIdentifierStart(char)) {
			let cursor = index
			while (cursor < code.length && isIdentifierPart(code[cursor] as string)) cursor += 1
			const word = code.slice(index, cursor)
			if (keywords.has(word)) push("keyword", word)
			else plain += word
			index = cursor
			continue
		}

		plain += char
		index += 1
	}

	flush()
	return tokens
}

/** Number of lines in the editor, used to render the gutter. */
export function lineCount(code: string): number {
	return code.split("\n").length
}

/** Inserts an indent at the caret; returns the new value and caret position. */
export function insertIndent(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	tabSize: number,
): { value: string; caret: number } {
	const indent = " ".repeat(Math.min(Math.max(tabSize, 1), 8))
	return {
		value: value.slice(0, selectionStart) + indent + value.slice(selectionEnd),
		caret: selectionStart + indent.length,
	}
}
