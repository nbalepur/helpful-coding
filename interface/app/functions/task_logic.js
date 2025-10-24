import { ENV } from '../config/env';

// Settings for the application
const defaultSettings = {
  prompts: {
    system_prompt: "default system prompt",
    prompt: "default chat prompt",
    debug_prompt: "default debug prompt"
  },
  model_settings: {
    chat_model: "Off",
    autocomplete_model: "Off",
    max_tokens: 512,
    active_refresh_time_seconds: 30,
    inactive_refresh_time_seconds: 30,
    suggestion_max_options: 3,
    insert_cursor: false,
    proactive_delete_time_seconds: 60
  },
  task_settings: {
    duration_minutes: 60,
    proactive_available_start: null,
    proactive_switch_minutes: 20,
    show_ai_settings: false,
    tasks_id: "Personal Website",
    skip_task_minutes: 1
  }
};

export async function writeUserData(response_id, telemetry) {
  // Store telemetry data locally (can be extended to send to backend later)
  // localStorage.setItem(`telemetry_${response_id}`, JSON.stringify(telemetry));
}

export function loadlocalstorage(setResponseId, setTaskId, setExpCondition, setWorkerId) {
  const myData = JSON.parse(localStorage["objectToPass"] || "[]");
  setResponseId(myData[0] || "");
  setTaskId(myData[1] || "");
  setExpCondition(myData[2] || "");
  setWorkerId(myData[3] || "");
}

// loadTaskData function removed - we now use load_next_task directly

export async function loadSettings(
  setTaskId,
  setModelChat,
  setModelAutocomplete,
  setProactive,
  setMaxTokensTask,
  setPrompts,
  setProactiveRefreshTimeActive,
  setProactiveRefreshTimeInactive,
  setDurationMinutes,
  setProactiveAvailableStart,
  setProactiveSwitchMinutes,
  setShowAIOptions,
  setSuggestionMaxOptions,
  setInsertCursor,
  setProactiveDeleteTime,
  setSkipTime,
) {
  const { model_settings, task_settings, prompts } = defaultSettings;

  setTaskId(task_settings.tasks_id);
  setDurationMinutes(task_settings.duration_minutes);
  
  const proactiveStart = task_settings.proactive_available_start === null 
    ? Math.random() < 0.5 
    : task_settings.proactive_available_start;
  
  setProactiveAvailableStart(proactiveStart);
  setProactive(proactiveStart);
  
  setProactiveSwitchMinutes(task_settings.proactive_switch_minutes);
  setShowAIOptions(task_settings.show_ai_settings);
  setSkipTime(task_settings.skip_task_minutes * 60_000);

  setModelChat(model_settings.chat_model);
  setModelAutocomplete(model_settings.autocomplete_model);
  setMaxTokensTask(model_settings.max_tokens);
  setProactiveRefreshTimeActive(model_settings.active_refresh_time_seconds * 1000);
  setProactiveRefreshTimeInactive(model_settings.inactive_refresh_time_seconds * 1000);
  setSuggestionMaxOptions(model_settings.suggestion_max_options);
  setInsertCursor(model_settings.insert_cursor);
  setProactiveDeleteTime(model_settings.proactive_delete_time_seconds * 1000);

  setPrompts(prev => ({
    ...prev,
    system_prompt: prompts.system_prompt,
    chat_prompt: prompts.prompt,
    debug_prompt: prompts.debug_prompt,
  }));

  return "settings_loaded";
}

// Load next task definition from a static JSON by name and return file nodes
export async function load_next_task(task_name) {
  try {
    const res = await fetch(`${ENV.BACKEND_URL}/tasks/${encodeURIComponent(task_name)}`);
    if (!res.ok) {
      console.error('Failed to fetch task from backend', res.status, res.statusText);
      return { files: [], task: null };
    }
    const data = await res.json();
    return { files: data.files || [], task: data.task || null };
  } catch (e) {
    console.error('Error loading next task:', e);
    return { files: [], task: null };
  }
}

// inferLanguageFromName no longer needed on frontend for backend mode

export async function loadCurrentTask(
  task_index,
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
  if (task_index >= function_signatures.length) {
    // localStorage.setItem("code", "");
    if (response_id) {
      // localStorage.setItem("objectToPass", JSON.stringify([response_id, task_id, exp_condition, worker_id]));
    }
    return;
  }

  if (actualEditorRef) actualEditorRef.current.clearDiffEditor();
  editor.setValue(function_signatures[task_index].replace(/\\n/g, "\n"));

  setMessages([{ text: "How can I help you today?", sender: "bot" }]);

  setTelemetry(prev => [...prev, {
    event_type: "load_task",
    task_id: task_id,
    task_index: task_index,
    timestamp: Date.now(),
  }]);
}

export function restoreAfterRefresh(setTaskIndex, setTelemetry) {
  const task_index = localStorage.getItem("task_index");
  setTaskIndex(task_index ? parseInt(task_index) : 0);

  const telemetry_data = localStorage.getItem("telemetry_data");
  if (telemetry_data) {
    setTelemetry(JSON.parse(telemetry_data));
  }
}
