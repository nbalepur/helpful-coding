// Task logic functions for loading and managing tasks

/**
 * Loads the current task based on task index from dummy_tasks.json
 * @param {number} taskIndex - Index of the task to load
 * @param {string} response_id - Response ID for tracking
 * @param {string} task_id - Task ID for tracking
 * @param {string} exp_condition - Experiment condition
 * @param {string} worker_id - Worker ID for tracking
 * @param {any} editor - Monaco editor instance
 * @param {Function} setMessages - Function to set messages state
 * @param {Array} function_signatures - Array of function signatures
 * @param {Array} telemetry - Telemetry data array
 * @param {Function} setTelemetry - Function to set telemetry state
 * @param {any} actualEditorRef - Reference to the actual editor
 */
export async function loadCurrentTask(
  taskIndex,
  response_id,
  task_id,
  exp_condition,
  worker_id,
  editor,
  setMessages,
  function_signatures,
  telemetry,
  setTelemetry,
  actualEditorRef
) {
  try {
    // Fetch tasks from API (proxied to backend DB)
    const response = await fetch('/api/tasks');
    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.status}`);
    }
    const data = await response.json();
    const tasks = data.tasks || [];
    
    // Validate task index
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      console.error(`Invalid task index: ${taskIndex}. Available tasks: ${tasks.length}`);
      return;
    }
    
    const currentTask = tasks[taskIndex];
    
    // Fetch files for the selected task and populate editor
    if (editor && currentTask?.id) {
      const filesRes = await fetch(`/api/task-files?taskId=${encodeURIComponent(currentTask.id)}`);
      const filesData = filesRes.ok ? await filesRes.json() : { files: [] };
      const files = Array.isArray(filesData.files) ? filesData.files : [];

      // // Clear existing models
      // const models = editor.getModels();
      // models.forEach(model => {
      //   if (!model.isDisposed()) {
      //     model.dispose();
      //   }
      // });

      files.forEach((file, index) => {
        const name = file.name || `file-${index}`;
        const content = file.content || '';
        let language = file.language || 'plaintext';
        if (name.endsWith('.html')) language = 'html';
        else if (name.endsWith('.css')) language = 'css';
        else if (name.endsWith('.js')) language = 'javascript';
        else if (name.endsWith('.ts')) language = 'typescript';
        else if (name.endsWith('.py')) language = 'python';
        else if (name.endsWith('.json')) language = 'json';

        const model = window.monaco.editor.createModel(
          content,
          language,
          window.monaco.Uri.parse(`file:///${name}`)
        );
        if (index === 0) {
          editor.setModel(model);
        }
      });
    }
    
    // Set up initial message with task description
    const initialMessage = {
      id: `task-${taskIndex}-${Date.now()}`,
      type: 'system',
      content: `**Task: ${currentTask.name}**\n\n${currentTask.description}`,
      timestamp: new Date().toISOString(),
      role: 'system'
    };
    
    setMessages([initialMessage]);
    
    // Log telemetry for task loading
    const taskLoadTelemetry = {
      type: 'task_loaded',
      taskIndex,
      taskName: currentTask.name,
      timestamp: new Date().toISOString(),
      response_id,
      task_id,
      exp_condition,
      worker_id
    };
    
    setTelemetry([...telemetry, taskLoadTelemetry]);
    
    console.log(`Loaded task ${taskIndex}: ${currentTask.name}`);
    
  } catch (error) {
    console.error('Error loading current task:', error);
    
    // Set error message
    const errorMessage = {
      id: `error-${Date.now()}`,
      type: 'error',
      content: `Failed to load task ${taskIndex}: ${error.message}`,
      timestamp: new Date().toISOString(),
      role: 'system'
    };
    
    setMessages([errorMessage]);
  }
}

/**
 * Get task data by index without loading it into the editor
 * @param {number} taskIndex - Index of the task to get
 * @returns {Promise<Object|null>} Task data or null if not found
 */
export async function getTaskData(taskIndex) {
  try {
    const response = await fetch('/data/dummy_tasks.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.status}`);
    }
    
    const data = await response.json();
    const tasks = data.tasks;
    
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      return null;
    }
    
    return tasks[taskIndex];
  } catch (error) {
    console.error('Error getting task data:', error);
    return null;
  }
}

/**
 * Load the next task (placeholder function)
 * @param {number} currentTaskIndex - Current task index
 * @returns {Promise<number>} Next task index
 */
export async function load_next_task(currentTaskIndex) {
  try {
    const tasks = await getAllTasks();
    const nextIndex = (currentTaskIndex + 1) % tasks.length;
    return nextIndex;
  } catch (error) {
    console.error('Error loading next task:', error);
    return currentTaskIndex;
  }
}

/**
 * Submit code for evaluation (placeholder function)
 * @param {any} editor - Editor instance
 * @param {Function} setOutput - Function to set output
 * @param {Function} setTelemetry - Function to set telemetry
 * @param {number} taskIndex - Task index
 * @returns {Promise<any>} Submission result
 */
export async function submitCode(editor, setOutput, setTelemetry, taskIndex) {
  try {
    const code = editor.getValue();
    setOutput('Code submitted successfully!');
    
    // Log telemetry
    const telemetry = {
      type: 'code_submitted',
      taskIndex,
      codeLength: code.length,
      timestamp: new Date().toISOString()
    };
    setTelemetry(prev => [...prev, telemetry]);
    
    return { success: true, message: 'Code submitted successfully!' };
  } catch (error) {
    console.error('Error submitting code:', error);
    setOutput('Error submitting code: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Track code submission telemetry
 * @param {Function} setTelemetry - Function to set telemetry
 * @param {number} taskIndex - Task index
 * @param {string} message - Message to log
 * @param {boolean} success - Whether submission was successful
 * @param {any} editor - Editor instance
 */
export function trackSubmitCode(setTelemetry, taskIndex, message, success, editor) {
  const telemetry = {
    type: 'submit_track',
    taskIndex,
    message,
    success,
    timestamp: new Date().toISOString(),
    codeLength: editor?.getValue?.()?.length || 0
  };
  setTelemetry(prev => [...prev, telemetry]);
}
