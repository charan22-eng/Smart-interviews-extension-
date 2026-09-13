import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isCategory, isDifficulty, LANGUAGES } from "../dist/utils/constants.js"
import {
	deepEqual,
	describeValue,
	formatArgs,
	gradeCase,
	matches,
	structuredCopy,
	summarize,
} from "../dist/practice/grading.js"
import {
	PROBLEMS,
	firstProblem,
	getProblem,
	isRunnable,
	starterCodeFor,
} from "../dist/practice/problems.js"

/* Reference solutions, used only to prove the bundled test cases are correct. */
const SOLUTIONS = {
	twoSum(nums, target) {
		const seen = new Map()
		for (let i = 0; i < nums.length; i += 1) {
			const need = target - nums[i]
			if (seen.has(need)) return [seen.get(need), i]
			seen.set(nums[i], i)
		}
		return []
	},
	isValid(s) {
		const pairs = { ")": "(", "]": "[", "}": "{" }
		const stack = []
		for (const char of s) {
			if (char === "(" || char === "[" || char === "{") stack.push(char)
			else if (stack.pop() !== pairs[char]) return false
		}
		return stack.length === 0
	},
	search(nums, target) {
		let low = 0
		let high = nums.length - 1
		while (low <= high) {
			const mid = low + Math.floor((high - low) / 2)
			if (nums[mid] === target) return mid
			if (nums[mid] < target) low = mid + 1
			else high = mid - 1
		}
		return -1
	},
	maxSubArray(nums) {
		let best = nums[0]
		let current = nums[0]
		for (let i = 1; i < nums.length; i += 1) {
			current = Math.max(nums[i], current + nums[i])
			best = Math.max(best, current)
		}
		return best
	},
	reverseList(values) {
		const out = []
		for (let i = values.length - 1; i >= 0; i -= 1) out.push(values[i])
		return out
	},
	isAnagram(s, t) {
		if (s.length !== t.length) return false
		const counts = new Map()
		for (const char of s) counts.set(char, (counts.get(char) ?? 0) + 1)
		for (const char of t) {
			const left = counts.get(char) ?? 0
			if (left === 0) return false
			counts.set(char, left - 1)
		}
		return true
	},
	climbStairs(n) {
		let previous = 1
		let current = 1
		for (let step = 2; step <= n; step += 1) {
			const next = previous + current
			previous = current
			current = next
		}
		return current
	},
	numIslands(grid) {
		let islands = 0
		const sink = (row, col) => {
			if (row < 0 || col < 0 || row >= grid.length || col >= grid[row].length) return
			if (grid[row][col] !== "1") return
			grid[row][col] = "0"
			sink(row + 1, col)
			sink(row - 1, col)
			sink(row, col + 1)
			sink(row, col - 1)
		}
		for (let row = 0; row < grid.length; row += 1) {
			for (let col = 0; col < grid[row].length; col += 1) {
				if (grid[row][col] === "1") {
					islands += 1
					sink(row, col)
				}
			}
		}
		return islands
	},
}

describe("problem set", () => {
	it("contains the eight required problems", () => {
		assert.equal(PROBLEMS.length, 8)
		assert.deepEqual(
			PROBLEMS.map((problem) => problem.name),
			[
				"Two Sum",
				"Valid Parentheses",
				"Binary Search",
				"Maximum Subarray",
				"Reverse Linked List",
				"Valid Anagram",
				"Climbing Stairs",
				"Number of Islands",
			],
		)
	})

	it("uses unique ids that can be looked up", () => {
		const ids = PROBLEMS.map((problem) => problem.id)
		assert.equal(new Set(ids).size, ids.length)
		assert.equal(getProblem("two-sum").name, "Two Sum")
		assert.equal(getProblem("nope"), null)
		assert.equal(firstProblem().id, "two-sum")
	})

	it("describes every problem completely", () => {
		for (const problem of PROBLEMS) {
			assert.ok(problem.description.length > 40, `${problem.name}: description too short`)
			assert.ok(problem.examples.length > 0, `${problem.name}: no examples`)
			assert.ok(problem.constraints.length > 0, `${problem.name}: no constraints`)
			assert.ok(problem.expectedBehavior.length > 20, `${problem.name}: no expected behaviour`)
			assert.ok(isDifficulty(problem.difficulty), `${problem.name}: bad difficulty`)
			assert.ok(isCategory(problem.category), `${problem.name}: bad category`)
			assert.ok(problem.functionName.length > 0)
			for (const example of problem.examples) {
				assert.ok(example.input.length > 0 && example.output.length > 0)
			}
		}
	})

	it("ships starter code for all five languages", () => {
		for (const problem of PROBLEMS) {
			for (const language of LANGUAGES) {
				const starter = starterCodeFor(problem, language)
				assert.equal(typeof starter, "string")
				assert.ok(starter.trim().length > 10, `${problem.name}/${language}: starter code missing`)
			}
		}
	})

	it("marks JavaScript as the only runnable language here", () => {
		assert.equal(isRunnable("javascript"), true)
		assert.equal(isRunnable("cpp"), false)
	})

	it("has at least three test cases per problem", () => {
		for (const problem of PROBLEMS) {
			assert.ok(problem.testCases.length >= 3, `${problem.name}: too few test cases`)
			for (const testCase of problem.testCases) {
				assert.ok(testCase.name.length > 0)
				assert.ok(Array.isArray(testCase.args))
			}
		}
	})
})

describe("bundled test cases are correct", () => {
	for (const problem of PROBLEMS) {
		it(`${problem.name}: a correct solution passes every case`, () => {
			const solution = SOLUTIONS[problem.functionName]
			assert.equal(typeof solution, "function", `no reference solution for ${problem.functionName}`)
			const results = problem.testCases.map((testCase) =>
				gradeCase(testCase, (args) => solution(...args)),
			)
			const failed = results.filter((result) => !result.passed)
			assert.deepEqual(failed, [], `failing cases: ${describeValue(failed)}`)
			assert.equal(summarize(results).allPassed, true)
		})
	}

	it("fails a wrong solution instead of passing it", () => {
		const problem = getProblem("climbing-stairs")
		const results = problem.testCases.map((testCase) => gradeCase(testCase, () => 0))
		const summary = summarize(results)
		assert.equal(summary.allPassed, false)
		assert.ok(summary.failed >= 4)
	})
})

describe("grading helpers", () => {
	it("compares values structurally", () => {
		assert.equal(deepEqual([1, [2, 3]], [1, [2, 3]]), true)
		assert.equal(deepEqual([1, 2], [2, 1]), false)
		assert.equal(deepEqual({ a: 1 }, { a: 1 }), true)
		assert.equal(deepEqual({ a: 1 }, { a: 1, b: 2 }), false)
		assert.equal(deepEqual(NaN, NaN), true)
		assert.equal(deepEqual(null, undefined), false)
	})

	it("supports order-insensitive answers", () => {
		assert.equal(matches([0, 1], [1, 0], "unordered"), true)
		assert.equal(matches([0, 1], [1, 0]), false)
		assert.equal(matches([0, 1], [0, 2], "unordered"), false)
	})

	it("renders values and arguments without throwing", () => {
		assert.equal(describeValue([1, "a"]), '[1,"a"]')
		assert.equal(describeValue(undefined), "undefined")
		const cyclic = {}
		cyclic.self = cyclic
		assert.equal(typeof describeValue(cyclic), "string")
		assert.equal(formatArgs([[1, 2], 3]), "[1,2], 3")
	})

	it("protects test inputs from mutating solutions", () => {
		const testCase = {
			name: "mutating solution",
			args: [[["1", "1"]]],
			expected: 1,
		}
		const first = gradeCase(testCase, (args) => SOLUTIONS.numIslands(args[0]))
		const second = gradeCase(testCase, (args) => SOLUTIONS.numIslands(args[0]))
		assert.equal(first.passed, true)
		assert.equal(second.passed, true, "the second run must see a fresh grid")
		assert.deepEqual(testCase.args, [[["1", "1"]]], "the original args are untouched")
	})

	it("copies nested structures", () => {
		const source = { list: [1, { deep: true }] }
		const copy = structuredCopy(source)
		copy.list[1].deep = false
		assert.equal(source.list[1].deep, true)
		assert.equal(structuredCopy(5), 5)
		assert.equal(structuredCopy("text"), "text")
	})

	it("reports a thrown error as a failed case", () => {
		const result = gradeCase({ name: "throws", args: [], expected: 1 }, () => {
			throw new Error("boom")
		})
		assert.equal(result.passed, false)
		assert.equal(result.error, "boom")
		assert.equal(result.actual, "threw an error")
	})

	it("summarises an empty run as not passing", () => {
		assert.deepEqual(summarize([]), { total: 0, passed: 0, failed: 0, allPassed: false })
	})
})
