/**
 * Pure grading helpers for the controlled practice environment.
 *
 * These functions never execute code themselves: the caller supplies a `run`
 * callback. In the extension that callback is a message round-trip to the
 * sandboxed runner frame (practice/runner.html); in the automated tests it is
 * a plain JavaScript function. Keeping comparison logic here means the
 * pass/fail rules are unit-tested without any code evaluation at all.
 */

/** "unordered" compares arrays ignoring order (e.g. any valid index pair). */
export type MatchMode = "deep" | "unordered"

export interface TestCase {
	/** Short human-readable name shown in the output panel. */
	name: string
	/** Arguments passed to the candidate function, in order. */
	args: unknown[]
	expected: unknown
	match?: MatchMode
}

export interface CaseResult {
	name: string
	passed: boolean
	expected: string
	actual: string
	error?: string
}

export interface RunSummary {
	total: number
	passed: number
	failed: number
	allPassed: boolean
}

/** Structural equality for the JSON-shaped values used by the problem set. */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a === "number" && typeof b === "number") {
		return Number.isNaN(a) && Number.isNaN(b)
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
		return a.every((item, index) => deepEqual(item, b[index]))
	}
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
	const left = a as Record<string, unknown>
	const right = b as Record<string, unknown>
	const leftKeys = Object.keys(left).sort()
	const rightKeys = Object.keys(right).sort()
	if (!deepEqual(leftKeys, rightKeys)) return false
	return leftKeys.every((key) => deepEqual(left[key], right[key]))
}

/** Stable ordering used by the "unordered" match mode. */
function canonical(value: unknown): unknown {
	if (!Array.isArray(value)) return value
	return [...value].map(canonical).sort((left, right) => describeValue(left).localeCompare(describeValue(right)))
}

export function matches(expected: unknown, actual: unknown, mode: MatchMode = "deep"): boolean {
	if (mode === "unordered") return deepEqual(canonical(expected), canonical(actual))
	return deepEqual(expected, actual)
}

/** Renders a value for the output panel. Always a string, never throws. */
export function describeValue(value: unknown): string {
	if (value === undefined) return "undefined"
	try {
		const text = JSON.stringify(value)
		return typeof text === "string" ? text : String(value)
	} catch {
		return String(value)
	}
}

export function formatArgs(args: unknown[]): string {
	return args.map(describeValue).join(", ")
}

/** Grades one test case. A thrown error is reported, never swallowed. */
export function gradeCase(testCase: TestCase, run: (args: unknown[]) => unknown): CaseResult {
	const expected = describeValue(testCase.expected)
	try {
		const actual = run(structuredCopy(testCase.args))
		return {
			name: testCase.name,
			passed: matches(testCase.expected, actual, testCase.match ?? "deep"),
			expected,
			actual: describeValue(actual),
		}
	} catch (error) {
		return {
			name: testCase.name,
			passed: false,
			expected,
			actual: "threw an error",
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

/**
 * Copies arguments so a solution that mutates its input (for example the grid
 * in Number of Islands) cannot corrupt the next test case.
 */
export function structuredCopy<T>(value: T): T {
	if (Array.isArray(value)) return value.map((item) => structuredCopy(item)) as unknown as T
	if (typeof value === "object" && value !== null) {
		const copy: Record<string, unknown> = {}
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			copy[key] = structuredCopy(item)
		}
		return copy as unknown as T
	}
	return value
}

export function summarize(results: readonly CaseResult[]): RunSummary {
	const passed = results.filter((result) => result.passed).length
	return {
		total: results.length,
		passed,
		failed: results.length - passed,
		allPassed: results.length > 0 && passed === results.length,
	}
}
