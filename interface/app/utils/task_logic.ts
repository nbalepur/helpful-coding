// Task logic functions for loading and managing tasks (database-backed via /api/tasks and /api/task-files)

/** Task shape returned by /api/tasks (from database) */
export interface TaskFromApi {
  id: string;
  name: string;
  title?: string;
  description?: string;
  requirements?: string[];
  projectId?: number;
  status?: string;
  [key: string]: unknown;
}

/** File shape returned by /api/task-files */
interface TaskFileFromApi {
  id?: string;
  name: string;
  type?: string;
  content: string;
  language?: string;
}

const TASKS_API = '/api/tasks';
const TASK_FILES_API = '/api/task-files';

/**
 * Fetches all tasks from the database via the API.
 * @param userId - Optional user ID for task status (e.g. in-progress, completed)
 */
export async function getAllTasks(userId?: number | null): Promise<TaskFromApi[]> {
  try {
    const query = userId != null ? `?userId=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`${TASKS_API}${query}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch (error) {
    console.error('Error getting tasks:', error);
    return [];
  }
}

/**
 * Loads the current task from the database: fetches task list and task files from the API,
 * sets up the editor with file content, and posts the task description as the initial message.
 */
export async function loadCurrentTask(
  taskIndex: number,
  response_id: string,
  task_id: string,
  exp_condition: string,
  worker_id: string,
  editor: any,
  setMessages: (messages: any[]) => void,
  function_signatures: any[],
  telemetry: any[],
  setTelemetry: (t: any[] | ((prev: any[]) => any[])) => void,
  actualEditorRef: any,
  userId?: number | null
) {
  try {
    const tasks = await getAllTasks(userId ?? undefined);
    if (tasks.length === 0) {
      throw new Error('No tasks available');
    }

    const currentTask: TaskFromApi | undefined = task_id
      ? tasks.find((t) => t.id === task_id)
      : tasks[taskIndex];

    if (!currentTask) {
      const byIndex = taskIndex >= 0 && taskIndex < tasks.length ? tasks[taskIndex] : null;
      const resolved = byIndex ?? tasks[0];
      if (!resolved) {
        throw new Error('Task not found');
      }
      if (taskIndex < 0 || taskIndex >= tasks.length) {
        console.warn(`Invalid task index ${taskIndex}, using first task`);
      }
    }

    const task = currentTask ?? (tasks[taskIndex] ?? tasks[0]);
    const taskIdForFiles = task.id;

    const filesRes = await fetch(
      `${TASK_FILES_API}?taskId=${encodeURIComponent(taskIdForFiles)}${userId != null ? `&userId=${encodeURIComponent(userId)}` : ''}`,
      { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } }
    );
    if (!filesRes.ok) {
      throw new Error(`Failed to fetch task files: ${filesRes.status}`);
    }
    const filesData = await filesRes.json();
    const files: TaskFileFromApi[] = Array.isArray(filesData.files) ? filesData.files : [];

    if (editor && typeof window !== 'undefined' && (window as any).monaco && files.length > 0) {
      const monaco = (window as any).monaco;
      files.forEach((file, index) => {
        const content = typeof file.content === 'string' ? file.content : '';
        let language = file.language || 'plaintext';
        if (file.name.endsWith('.html')) language = 'html';
        else if (file.name.endsWith('.css')) language = 'css';
        else if (file.name.endsWith('.js')) language = 'javascript';
        else if (file.name.endsWith('.ts')) language = 'typescript';
        else if (file.name.endsWith('.py')) language = 'python';
        else if (file.name.endsWith('.json')) language = 'json';
        const model = monaco.editor.createModel(
          content,
          language,
          monaco.Uri.parse(`file:///${file.name}`)
        );
        if (index === 0) {
          editor.setModel(model);
        }
      });
    }

    const requirements = task.requirements ?? [];
    const requirementsBlock =
      requirements.length > 0 ? `\n\n**Requirements:**\n${requirements.map((req) => `- ${req}`).join('\n')}` : '';
    const initialMessage = {
      id: `task-${taskIndex}-${Date.now()}`,
      type: 'system',
      content: `**Task: ${task.name}**\n\n${task.description ?? ''}${requirementsBlock}`,
      timestamp: new Date().toISOString(),
      role: 'system',
    };
    setMessages([initialMessage]);

    setTelemetry([
      ...telemetry,
      {
        type: 'task_loaded',
        taskIndex,
        taskName: task.name,
        timestamp: new Date().toISOString(),
        response_id,
        task_id: task_id || task.id,
        exp_condition,
        worker_id,
      },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error loading current task:', error);
    setMessages([
      {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load task: ${message}`,
        timestamp: new Date().toISOString(),
        role: 'system',
      },
    ]);
  }
}

/**
 * Get task data by index (from database via API).
 * @param taskIndex - Index of the task
 * @param userId - Optional user ID for the tasks request
 * @returns Task or null if index invalid
 */
export async function getTaskData(
  taskIndex: number,
  userId?: number | null
): Promise<TaskFromApi | null> {
  const tasks = await getAllTasks(userId ?? undefined);
  if (taskIndex < 0 || taskIndex >= tasks.length) {
    return null;
  }
  return tasks[taskIndex];
}

/**
 * Returns the next task index (wraps to 0 after last task).
 */
export async function load_next_task(currentTaskIndex: number): Promise<number> {
  try {
    const tasks = await getAllTasks();
    const nextIndex = (currentTaskIndex + 1) % Math.max(1, tasks.length);
    return nextIndex;
  } catch (error) {
    console.error('Error loading next task:', error);
    return currentTaskIndex;
  }
}

/**
 * Submit code for evaluation (placeholder function).
 */
export async function submitCode(
  editor: { getValue: () => string },
  setOutput: (s: string) => void,
  setTelemetry: (t: any[] | ((prev: any[]) => any[])) => void,
  taskIndex: number
): Promise<{ success: boolean; message: string }> {
  try {
    const code = editor.getValue();
    setOutput('Code submitted successfully!');
    setTelemetry((prev: any[]) => [
      ...prev,
      { type: 'code_submitted', taskIndex, codeLength: code.length, timestamp: new Date().toISOString() },
    ]);
    return { success: true, message: 'Code submitted successfully!' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error submitting code:', error);
    setOutput('Error submitting code: ' + message);
    return { success: false, message };
  }
}

/**
 * Track code submission telemetry.
 */
export function trackSubmitCode(
  setTelemetry: (t: any[] | ((prev: any[]) => any[])) => void,
  taskIndex: number,
  message: string,
  success: boolean,
  editor: { getValue?: () => string } | null
) {
  setTelemetry((prev: any[]) => [
    ...prev,
    {
      type: 'submit_track',
      taskIndex,
      message,
      success,
      timestamp: new Date().toISOString(),
      codeLength: editor?.getValue?.()?.length ?? 0,
    },
  ]);
}

/**
 * Track proactive assistance toggle.
 */
export function trackProactiveTurnedOnOff(
  setTelemetry: (t: any[] | ((prev: any[]) => any[])) => void,
  enabled: boolean,
  taskIndex: number
) {
  setTelemetry((prev: any[]) => [
    ...prev,
    { type: 'proactive_toggle', enabled, taskIndex, timestamp: new Date().toISOString() },
  ]);
}
