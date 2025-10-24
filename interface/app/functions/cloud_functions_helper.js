/////////////////////////////////////////
// CLOUD FUNCTIONS CALLS
/////////////////////////////////////////
import axios from "axios";
import {OPENAI_API_KEY, RAPID_API_KEY, TOGETHER_API_KEY } from "../components/settings";
import { ENV } from "../config/env";

export async function get_openai_chat_response(model, messages, max_tokens, setLogprobs) {
  
  try {
    // Call the Python backend instead of OpenAI directly
    const response = await fetch(`${ENV.BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
        model: model,
        max_tokens: max_tokens,
        proactive: false,
        current_code: ""
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Set logprobs if provided (backend doesn't return logprobs yet)
    if (setLogprobs) {
      setLogprobs(null); // Backend doesn't return logprobs currently
    }
    
    return data.response;
  } catch (error) {
    return null;
  }
}

export async function get_openai_chat_response_streaming(model, messages, max_tokens, onChunk, onComplete, onError) {
  try {
    // Use the WebSocket helper instead of direct OpenAI calls
    const { streamChatResponse } = await import('./websocket_helper');
    
    const response = await streamChatResponse(
      messages,
      model,
      max_tokens,
      false, // proactive
      "", // current_code
      onChunk,
      onComplete,
      onError
    );
    
    return response;
  } catch (error) {
    onError(error);
    return null;
  }
}

// NOT TESTED
export function get_chat_together(model, messages, max_tokens, setLogprobs) {
  return new Promise((resolve, reject) => {
    axios.post('https://api.together.xyz/v1/chat/completions', {
      model: model,
      messages: messages,
      max_tokens: max_tokens
    }, {
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      }
    })
    .then((response) => {
      const text_response = response.data.choices[0].message.content;
      let chat_logprobs = response.data.choices[0].logprobs.token_logprobs;
      //chat_logprobs = get_summary_statistics(chat_logprobs);
      setLogprobs(chat_logprobs);
      resolve(text_response);
    })
    .catch((error) => {
      reject(error);
    });
  });
}
// NOT TESTED
export function get_chat_groq(model, messages, max_tokens, setLogprobs) {
  return new Promise((resolve, reject) => {
    axios.post('https://api.groq.com/v1/chat/completions', {
      model: model,
      messages: messages,
      max_tokens: max_tokens
    }, {
      headers: {
        'Authorization': `Bearer ${RAPID_API_KEY}`
      }
    })
    .then((response) => {
      const text_response = response.data.choices[0].message.content;
      resolve(text_response);
    })
    .catch((error) => {
      reject(error);
    });
  });
}

export async function get_openai_response(prefix, suffix, max_tokens, setLogprobs) {
  try {
    const response = await openai.completions.create({
      prompt:  prefix,
      max_tokens: max_tokens,
      model: "gpt-3.5-turbo-instruct",
      suffix: suffix,
      logprobs: 1,
    });
    const text_response = response.choices[0].text;
    let logprobs = response.choices[0].logprobs;
    //logprobs = get_summary_statistics(logprobs);
    setLogprobs(logprobs);
    return text_response;
  } catch (error) {
    return;
  }
}

// NOT TESTED
export function get_completion_together(model, prompt, max_tokens, setLogprobs) {
  return new Promise((resolve, reject) => {
    axios.post('https://api.together.xyz/v1/completions', {
      model: model,
      prompt: prompt,
      max_tokens: max_tokens
    }, {
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`
      }
    })
    .then((response) => {
      const text_response = response.data.choices[0].text;
      let logprobs = response.data.choices[0].logprobs.token_logprobs;
      //logprobs = get_summary_statistics(logprobs);
      setLogprobs(logprobs);
      resolve(text_response);
    })
    .catch((error) => {
      reject(error);
    });
  });
}

export async function submitCode(editor, setOutput, setTelemetry, task_index) {
  try {
    setOutput("Running...");

    const options = {
      method: 'POST',
      url: 'https://onecompiler-apis.p.rapidapi.com/api/v1/run',
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': 'onecompiler-apis.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      data: {
        language: 'python',
        files: [
          {
            name: 'index.py',
            content: editor.getValue(),
          },
        ],
      },
      timeout: 45000,
    };

    const response = await axios.request(options);
    const result = response;
    var log = "";
    if (result.data.stderr == null && result.data.exception == null) {
      log = result.data.stdout || "No output";
    } else {
      log = result.data.stdout || "";
      log += result.data.stderr || result.data.exception;
    }
    setTelemetry((prev) => {
      return [
        ...prev,
        {
          event_type: "run_code",
          task_index: task_index,
          log: log,
          timestamp: Date.now(),
        },
      ];
    });

    setOutput(log);

    return result;
  } catch (error) {
    alert("Error running the code.");
  }
}

export async function runCodeTest(editor, task_index, unit_tests) {
  try {
    const currentUnitTests = unit_tests[task_index];

    // Replace '\n' in the unit tests string with actual newlines
    const formattedUnitTests = currentUnitTests.replace(/\\n/g, "\n");

    // Step 3: Append Unit Tests
    const python_ignore_warnings = "import warnings\nwarnings.filterwarnings('ignore')\n";
    const testCode = python_ignore_warnings + "\n\n" + editor.getValue() + "\n\n" + formattedUnitTests;

    // Step 4: Call the API
    const options = {
      method: 'POST',
      url: 'https://onecompiler-apis.p.rapidapi.com/api/v1/run',
      headers: {
        'x-rapidapi-key': RAPID_API_KEY,
        'x-rapidapi-host': 'onecompiler-apis.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      data: {
        language: 'python',
        files: [
          {
            name: 'index.py',
            content: testCode,
          },
        ],
      },
      timeout: 45000,
    };

    const response = await axios.request(options);
    const result = response;

    // Step 5: Display Results
    // Return the result and let this be handled elsewhere.
    return result;

  } catch (error) {
    alert("Error running the code test.");
  }
}

function get_constant_response(prefix, suffix) {
  return new Promise((resolve, reject) => {
    var text_response =
      "if True:\n    x =1\n    y = 2\n    z = 3\n    if z == 3:\n        print('hello')\n    else:\n        print('world')\nelse:\n    print('hello world')\n";
    resolve(text_response);
  });
}

/////////////////////////////////////////
// END CLOUD FUNCTIONS CALLS
/////////////////////////////////////////

function get_summary_statistics(data) {
  if (!Array.isArray(data) || data.length === 0) {
      return {};
  }

  // Sorting the array for median calculation
  const sortedData = data.slice().sort((a, b) => a - b);
  const n = sortedData.length;
  const middleIndex = Math.floor(n / 2);

  // Calculating mean
  const sum = sortedData.reduce((acc, val) => acc + val, 0);
  const mean = sum / n;

  // Calculating median
  const median = n % 2 === 0 ? (sortedData[middleIndex - 1] + sortedData[middleIndex]) / 2 : sortedData[middleIndex];

  // Calculating standard deviation
  const meanDiffSquaredSum = sortedData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  const std = Math.sqrt(meanDiffSquaredSum / n);

  return {
      min: sortedData[0],
      max: sortedData[n - 1],
      mean: mean,
      median: median,
      std: std,
      firstElement: data[0],
      middleElement: sortedData[middleIndex],
      lastElement: data[n - 1]
  };
}





