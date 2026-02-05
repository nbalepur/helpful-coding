/**
 * Configuration for task-related constants
 */

// Required tasks for post-test (must all be completed before showing all tasks)
// These should match the task.name field from the API
export const POST_TEST_REQUIRED_TASKS = ['connect_four', 'snake', 'platformer'] as const;

// Usernames to filter out from the leaderboard (e.g., test accounts, internal users)
export const LEADERBOARD_FILTERED_USERNAMES: string[] = ['testtest', 'test-example', 'test', 'test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8', 'test9', 'test10', 'test11', 'test12', 'test13', 'test14', 'test15', 'test16', 'test17', 'test18', 'test19', 'test20'];

