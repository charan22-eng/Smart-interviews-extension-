/**
 * The eight practice problems bundled with the controlled practice
 * environment. This is plain data: descriptions, examples, constraints,
 * per-language starter code and test cases.
 *
 * Starter code is provided for all five supported languages so the editor and
 * the snippet manager are useful for every one of them. Only JavaScript can
 * actually be executed here: Run/Test evaluate the editor contents inside the
 * sandboxed runner frame (practice/runner.html). For the other languages the
 * editor is a scratchpad: write, copy, and save the solution as a snippet.
 */

import type { Category, Difficulty, Language } from "../types/models.js"
import type { TestCase } from "./grading.js"

export interface ProblemExample {
	input: string
	output: string
	explanation?: string
}

export interface Problem {
	id: string
	name: string
	difficulty: Difficulty
	category: Category
	/** Function the runner calls; the editor must define it for Run/Test. */
	functionName: string
	description: string
	examples: ProblemExample[]
	constraints: string[]
	expectedBehavior: string
	starterCode: Record<Language, string>
	testCases: TestCase[]
}

export const PROBLEMS: readonly Problem[] = [
	{
		id: "two-sum",
		name: "Two Sum",
		difficulty: "Easy",
		category: "Hashing",
		functionName: "twoSum",
		description:
			"Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Each input has exactly one solution and the same element may not be used twice.",
		examples: [
			{ input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] === 9" },
			{ input: "nums = [3,2,4], target = 6", output: "[1,2]" },
			{ input: "nums = [3,3], target = 6", output: "[0,1]" },
		],
		constraints: [
			"2 <= nums.length <= 10^4",
			"-10^9 <= nums[i] <= 10^9",
			"Exactly one valid answer exists",
		],
		expectedBehavior:
			"Return an array of the two indices in any order. The reference solution runs in O(n) time with a hash map.",
		starterCode: {
			javascript:
				"function twoSum(nums, target) {\n  // Return the two indices whose values add up to target.\n}\n",
			python: "def two_sum(nums, target):\n    # Return the two indices whose values add up to target.\n    pass\n",
			cpp: "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // your code here\n    }\n}\n",
			c: "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "answer at the start", args: [[2, 7, 11, 15], 9], expected: [0, 1], match: "unordered" },
			{ name: "answer in the middle", args: [[3, 2, 4], 6], expected: [1, 2], match: "unordered" },
			{ name: "duplicate values", args: [[3, 3], 6], expected: [0, 1], match: "unordered" },
			{ name: "negative numbers", args: [[-3, 4, 3, 90], 0], expected: [0, 2], match: "unordered" },
		],
	},
	{
		id: "valid-parentheses",
		name: "Valid Parentheses",
		difficulty: "Easy",
		category: "Stack",
		functionName: "isValid",
		description:
			"Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine whether the input string is valid. Brackets must close in the correct order and every closing bracket must match the most recent unclosed opening bracket.",
		examples: [
			{ input: 's = "()"', output: "true" },
			{ input: 's = "()[]{}"', output: "true" },
			{ input: 's = "(]"', output: "false" },
		],
		constraints: ["1 <= s.length <= 10^4", "s consists only of the six bracket characters"],
		expectedBehavior:
			"Return a boolean. Push opening brackets onto a stack and pop on each closing bracket: O(n) time, O(n) space.",
		starterCode: {
			javascript: "function isValid(s) {\n  // Return true when every bracket is closed in the right order.\n}\n",
			python: "def is_valid(s):\n    # Return True when every bracket is closed in the right order.\n    pass\n",
			cpp: "class Solution {\npublic:\n    bool isValid(string s) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public boolean isValid(String s) {\n        // your code here\n    }\n}\n",
			c: "bool isValid(char* s) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "simple pair", args: ["()"], expected: true },
			{ name: "all three kinds", args: ["()[]{}"], expected: true },
			{ name: "mismatched pair", args: ["(]"], expected: false },
			{ name: "crossed brackets", args: ["([)]"], expected: false },
			{ name: "nested brackets", args: ["{[]}"], expected: true },
			{ name: "unclosed bracket", args: ["("], expected: false },
		],
	},
	{
		id: "binary-search",
		name: "Binary Search",
		difficulty: "Easy",
		category: "Binary Search",
		functionName: "search",
		description:
			"Given a sorted array of distinct integers nums and an integer target, return the index of target. If target does not exist in nums, return -1. The algorithm must run in O(log n) time.",
		examples: [
			{ input: "nums = [-1,0,3,5,9,12], target = 9", output: "4" },
			{ input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1" },
		],
		constraints: [
			"1 <= nums.length <= 10^4",
			"nums is sorted in ascending order and all values are distinct",
			"-10^4 < nums[i], target < 10^4",
		],
		expectedBehavior:
			"Return the index or -1. Use a half-open or closed interval consistently and compute the midpoint without overflow.",
		starterCode: {
			javascript: "function search(nums, target) {\n  // Return the index of target, or -1.\n}\n",
			python: "def search(nums, target):\n    # Return the index of target, or -1.\n    pass\n",
			cpp: "class Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public int search(int[] nums, int target) {\n        // your code here\n    }\n}\n",
			c: "int search(int* nums, int numsSize, int target) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "target present", args: [[-1, 0, 3, 5, 9, 12], 9], expected: 4 },
			{ name: "target missing", args: [[-1, 0, 3, 5, 9, 12], 2], expected: -1 },
			{ name: "single element hit", args: [[5], 5], expected: 0 },
			{ name: "single element miss", args: [[5], -5], expected: -1 },
			{ name: "first element", args: [[1, 2, 3, 4], 1], expected: 0 },
			{ name: "last element", args: [[1, 2, 3, 4], 4], expected: 3 },
		],
	},
	{
		id: "maximum-subarray",
		name: "Maximum Subarray",
		difficulty: "Medium",
		category: "Dynamic Programming",
		functionName: "maxSubArray",
		description:
			"Given an integer array nums, find the contiguous subarray with the largest sum and return that sum. The subarray must contain at least one number.",
		examples: [
			{
				input: "nums = [-2,1,-3,4,-1,2,1,-5,4]",
				output: "6",
				explanation: "The subarray [4,-1,2,1] has the largest sum 6.",
			},
			{ input: "nums = [5,4,-1,7,8]", output: "23" },
		],
		constraints: ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
		expectedBehavior:
			"Return a number. Kadane's algorithm gives O(n) time and O(1) space; an all-negative array must return its largest element, not 0.",
		starterCode: {
			javascript: "function maxSubArray(nums) {\n  // Return the largest contiguous subarray sum.\n}\n",
			python: "def max_sub_array(nums):\n    # Return the largest contiguous subarray sum.\n    pass\n",
			cpp: "class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public int maxSubArray(int[] nums) {\n        // your code here\n    }\n}\n",
			c: "int maxSubArray(int* nums, int numsSize) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "mixed signs", args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
			{ name: "single element", args: [[1]], expected: 1 },
			{ name: "mostly positive", args: [[5, 4, -1, 7, 8]], expected: 23 },
			{ name: "all negative", args: [[-3, -1, -2]], expected: -1 },
		],
	},
	{
		id: "reverse-linked-list",
		name: "Reverse Linked List",
		difficulty: "Easy",
		category: "Linked List",
		functionName: "reverseList",
		description:
			"Reverse a singly linked list and return the reversed list. In this practice environment the list is represented as an array of its values, so reverseList(values) receives an array and must return the reversed array. In a real interview you would walk the list with prev/curr pointers instead.",
		examples: [
			{ input: "head = [1,2,3,4,5]", output: "[5,4,3,2,1]" },
			{ input: "head = [1,2]", output: "[2,1]" },
			{ input: "head = []", output: "[]" },
		],
		constraints: [
			"0 <= number of nodes <= 5000",
			"-5000 <= Node.val <= 5000",
			"Solve it iteratively in O(n) time and O(1) extra space",
		],
		expectedBehavior:
			"Return the values in reverse order. The empty list must return an empty list rather than throwing.",
		starterCode: {
			javascript:
				"// values is an array standing in for the linked list nodes.\nfunction reverseList(values) {\n  // Return the values in reverse order.\n}\n",
			python: "def reverse_list(head):\n    # prev, curr = None, head ...\n    pass\n",
			cpp: "class Solution {\npublic:\n    ListNode* reverseList(ListNode* head) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public ListNode reverseList(ListNode head) {\n        // your code here\n    }\n}\n",
			c: "struct ListNode* reverseList(struct ListNode* head) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "five nodes", args: [[1, 2, 3, 4, 5]], expected: [5, 4, 3, 2, 1] },
			{ name: "two nodes", args: [[1, 2]], expected: [2, 1] },
			{ name: "single node", args: [[7]], expected: [7] },
			{ name: "empty list", args: [[]], expected: [] },
		],
	},
	{
		id: "valid-anagram",
		name: "Valid Anagram",
		difficulty: "Easy",
		category: "Strings",
		functionName: "isAnagram",
		description:
			"Given two strings s and t, return true if t is an anagram of s, and false otherwise. An anagram uses exactly the same letters with the same frequencies.",
		examples: [
			{ input: 's = "anagram", t = "nagaram"', output: "true" },
			{ input: 's = "rat", t = "car"', output: "false" },
		],
		constraints: ["1 <= s.length, t.length <= 5 * 10^4", "s and t consist of lowercase English letters"],
		expectedBehavior:
			"Return a boolean. Counting characters is O(n); different lengths can be rejected immediately.",
		starterCode: {
			javascript: "function isAnagram(s, t) {\n  // Return true when t is an anagram of s.\n}\n",
			python: "def is_anagram(s, t):\n    # Return True when t is an anagram of s.\n    pass\n",
			cpp: "class Solution {\npublic:\n    bool isAnagram(string s, string t) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public boolean isAnagram(String s, String t) {\n        // your code here\n    }\n}\n",
			c: "bool isAnagram(char* s, char* t) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "is an anagram", args: ["anagram", "nagaram"], expected: true },
			{ name: "not an anagram", args: ["rat", "car"], expected: false },
			{ name: "same single letter", args: ["a", "a"], expected: true },
			{ name: "different lengths", args: ["ab", "abb"], expected: false },
			{ name: "same letters, different counts", args: ["aacc", "ccac"], expected: false },
		],
	},
	{
		id: "climbing-stairs",
		name: "Climbing Stairs",
		difficulty: "Easy",
		category: "Dynamic Programming",
		functionName: "climbStairs",
		description:
			"You are climbing a staircase with n steps. Each time you can climb either 1 or 2 steps. Return the number of distinct ways to reach the top.",
		examples: [
			{ input: "n = 2", output: "2", explanation: "1+1 and 2" },
			{ input: "n = 3", output: "3", explanation: "1+1+1, 1+2 and 2+1" },
		],
		constraints: ["1 <= n <= 45"],
		expectedBehavior:
			"Return a number. The answer is the (n+1)-th Fibonacci number; keep two rolling values for O(n) time and O(1) space.",
		starterCode: {
			javascript: "function climbStairs(n) {\n  // Return the number of distinct ways to climb n steps.\n}\n",
			python: "def climb_stairs(n):\n    # Return the number of distinct ways to climb n steps.\n    pass\n",
			cpp: "class Solution {\npublic:\n    int climbStairs(int n) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public int climbStairs(int n) {\n        // your code here\n    }\n}\n",
			c: "int climbStairs(int n) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{ name: "one step", args: [1], expected: 1 },
			{ name: "two steps", args: [2], expected: 2 },
			{ name: "three steps", args: [3], expected: 3 },
			{ name: "five steps", args: [5], expected: 8 },
			{ name: "ten steps", args: [10], expected: 89 },
		],
	},
	{
		id: "number-of-islands",
		name: "Number of Islands",
		difficulty: "Medium",
		category: "Graphs",
		functionName: "numIslands",
		description:
			"Given an m x n grid of '1' (land) and '0' (water), return the number of islands. An island is surrounded by water and is formed by connecting adjacent land cells horizontally or vertically.",
		examples: [
			{
				input: 'grid = [["1","1","0"],["1","0","0"],["0","0","1"]]',
				output: "2",
				explanation: "The three connected cells in the top-left form one island; the bottom-right cell forms another.",
			},
			{ input: 'grid = [["0","0"],["0","0"]]', output: "0" },
		],
		constraints: [
			"1 <= m, n <= 300",
			"grid[i][j] is '0' or '1'",
			"Only vertical and horizontal neighbours are connected",
		],
		expectedBehavior:
			"Return a number. Flood-fill each unvisited land cell with DFS or BFS: O(m*n) time. The grid may be mutated; each test case receives a fresh copy.",
		starterCode: {
			javascript: "function numIslands(grid) {\n  // Return the number of connected groups of '1' cells.\n}\n",
			python: "def num_islands(grid):\n    # Return the number of connected groups of '1' cells.\n    pass\n",
			cpp: "class Solution {\npublic:\n    int numIslands(vector<vector<char>>& grid) {\n        // your code here\n    }\n};\n",
			java: "class Solution {\n    public int numIslands(char[][] grid) {\n        // your code here\n    }\n}\n",
			c: "int numIslands(char** grid, int gridSize, int* gridColSize) {\n    /* your code here */\n}\n",
		},
		testCases: [
			{
				name: "two islands",
				args: [
					[
						["1", "1", "0"],
						["1", "0", "0"],
						["0", "0", "1"],
					],
				],
				expected: 2,
			},
			{
				name: "all water",
				args: [
					[
						["0", "0"],
						["0", "0"],
					],
				],
				expected: 0,
			},
			{
				name: "one large island",
				args: [
					[
						["1", "1", "1"],
						["0", "1", "0"],
						["1", "1", "1"],
					],
				],
				expected: 1,
			},
			{
				name: "diagonals are not connected",
				args: [
					[
						["1", "0"],
						["0", "1"],
					],
				],
				expected: 2,
			},
		],
	},
]

export function getProblem(id: string): Problem | null {
	return PROBLEMS.find((problem) => problem.id === id) ?? null
}

export function firstProblem(): Problem {
	const problem = PROBLEMS[0]
	if (!problem) throw new Error("The practice problem set is empty.")
	return problem
}

export function starterCodeFor(problem: Problem, language: Language): string {
	return problem.starterCode[language]
}

/** Languages the bundled runner can execute; the rest are scratchpad-only. */
export const RUNNABLE_LANGUAGES: readonly Language[] = ["javascript"]

export function isRunnable(language: Language): boolean {
	return RUNNABLE_LANGUAGES.includes(language)
}
