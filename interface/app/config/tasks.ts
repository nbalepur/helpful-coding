/**
 * Configuration for task-related constants
 */

// Tasks with website requirements (must all be completed before showing all tasks)
// These should match the task.name field from the API
export const WEBSITE_REQUIREMENT_TASKS = [
  'website_tutorial_intro',
  'zic_zac_zoe',
  'website_tutorial_follow_up',
  'zic_zac_zoe_follow_up',
] as const;
export const GAME_REQUIRED_TASKS = ['platformer'] as const;
export const WEBSITE_TUTORIAL_TASKS = ['website_tutorial_intro', 'website_tutorial_follow_up'] as const;
export const TIMED_TASKS = [
  ...WEBSITE_REQUIREMENT_TASKS.filter((taskName) => !WEBSITE_TUTORIAL_TASKS.includes(taskName as any)),
  ...GAME_REQUIRED_TASKS,
] as const;
export const WEBSITE_REQUIREMENTS_LABEL = 'website_requirements' as const;

export type StudyTaskMode = 'website-requirements' | 'game';

type TaskLike = {
  id?: string;
  name?: string;
  label?: string;
  status?: string;
};

export const isWebsiteRequirementTask = (task: TaskLike): boolean => {
  const label = (task.label || '').toLowerCase();
  return label === WEBSITE_REQUIREMENTS_LABEL || WEBSITE_REQUIREMENT_TASKS.includes(task.name as any);
};

export const getWebsiteRequirementTaskNames = (tasks: TaskLike[]): string[] => {
  const namesFromTasks = tasks
    .filter((task) => task.id !== 'playground' && isWebsiteRequirementTask(task) && !!task.name)
    .map((task) => task.name as string);

  if (namesFromTasks.length > 0) {
    const namesSet = new Set(namesFromTasks);
    const orderedKnownTasks = WEBSITE_REQUIREMENT_TASKS.filter((taskName) => namesSet.has(taskName));
    const extraWebsiteTasks = Array.from(namesSet).filter(
      (taskName) => !WEBSITE_REQUIREMENT_TASKS.includes(taskName as any)
    );
    return [...orderedKnownTasks, ...extraWebsiteTasks];
  }

  return [...WEBSITE_REQUIREMENT_TASKS];
};

export const getStudyTaskMode = (
  tasks: TaskLike[],
  websiteRequirementsCompletedOverride: boolean = false
): StudyTaskMode => {
  if (websiteRequirementsCompletedOverride) {
    return 'game';
  }
  const websiteRequirementTaskNames = getWebsiteRequirementTaskNames(tasks);
  const completedTaskNames = new Set(
    tasks
      .filter((task) => task.id !== 'playground' && task.status === 'completed' && !!task.name)
      .map((task) => task.name as string)
  );
  const websiteRequirementsCompleted = websiteRequirementTaskNames.every((taskName) =>
    completedTaskNames.has(taskName)
  );
  return websiteRequirementsCompleted ? 'game' : 'website-requirements';
};

export const getRequiredTasksForMode = (mode: StudyTaskMode, tasks: TaskLike[] = []): readonly string[] => {
  if (mode === 'website-requirements') {
    return getWebsiteRequirementTaskNames(tasks);
  }
  return GAME_REQUIRED_TASKS;
};

// Usernames to filter out from the leaderboard (e.g., test accounts, internal users)
export const LEADERBOARD_FILTERED_USERNAMES: string[] = ['testtest', 'test-example', 'test', 'test1', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8', 'test9', 'test10', 'test11', 'test12', 'test13', 'test14', 'test15', 'test16', 'test17', 'test18', 'test19', 'test20'];

