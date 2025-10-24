"use client";
import { useState, Dispatch, SetStateAction, use, useImperativeHandle } from "react";
// import Message from "./Message";
import { MessageData, ProactiveMessageData } from "./Message";
// CSS imported via globals.css
import ChatWindow from "./ChatWindow";
import { useEffect, useRef, forwardRef, useCallback } from "react";
import TextInput from "./TextInput";
import { send } from "process";
import {
  get_openai_chat_response,
  get_openai_chat_response_streaming,
} from "../functions/cloud_functions_helper";
import { streamChatResponse } from "../functions/websocket_helper";

import { loadlocalstorage } from "../functions/task_logic";

import { Message } from "postcss";
import { getAIResponse } from "../functions/chat_logic";
import PromptModal, { PromptProp } from './PromptModal';
import { trackProactiveSuggestion } from "../functions/telemetry";

interface ChatProps {
  theme: string;
  code: string;
  setCode: (code: string) => void;
  awaitingResponse: boolean;
  setAwaitingResponse: (awaitingResponse: boolean) => void;
  taskId: string;
  setTaskId: (taskId: string) => void;
  responseId: string;
  setResponseId: (responseId: string) => void;
  expCondition: string;
  setExpCondition: (expCondition: string) => void;
  workerId: string;
  setWorkerId: (workerId: string) => void;
  inputValue: string;
  setInputValue: (inputValue: string) => void;
  model: string;
  // chatHistory: Array<Record<string, string>>;
  max_tokens: number;
  messages: MessageData[];
  setMessages: Dispatch<SetStateAction<MessageData[]>>;
  setTelemetry: Dispatch<SetStateAction<any[]>>;
  task_index: number;
  setChatHistory: Dispatch<SetStateAction<any[]>>;
  chatHistory: any[];
  messageAIIndex: number;
  setMessageAIIndex: Dispatch<SetStateAction<number>>;
  logprob: any;
  setChatLogProbs: Dispatch<SetStateAction<any>>;
  modelChat: string;
  proactive: boolean;
  proactive_refresh_time: number;
  prompt: PromptProp;
  suggestion_max_options: number;
  insert_cursor: boolean;
  proactive_delete_time: number;
  awaitingManualSuggestions: boolean;
  setAwaitingManualSuggestions: (awaitingManualSuggestions: boolean) => void;
  editorRef: any;
  actualEditorRef: any;
}

const Chat: React.FC<ChatProps> = forwardRef(({
  theme,
  code,
  setCode,
  awaitingResponse,
  setAwaitingResponse,
  taskId,
  setTaskId,
  responseId,
  setResponseId,
  expCondition,
  setExpCondition,
  workerId,
  setWorkerId,
  inputValue,
  setInputValue,
  model,
  max_tokens,
  messages,
  setMessages,
  setTelemetry,
  task_index,
  setChatHistory,
  chatHistory,
  messageAIIndex,
  setMessageAIIndex,
  logprob,
  setChatLogProbs,
  modelChat,
  proactive,
  proactive_refresh_time,
  prompt,
  suggestion_max_options,
  insert_cursor,
  proactive_delete_time,
  awaitingManualSuggestions,
  setAwaitingManualSuggestions,
  editorRef,
  actualEditorRef
}, ref) => {
  // Use a ref to get the new value of awaitingResponse
  const awaitingRef = useRef(awaitingResponse);
  const [awaitingSuggestions, setAwaitingSuggestions] = useState(false);
  const awaitingSuggestionsRef = useRef(awaitingSuggestions);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const openai_models = ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini"];
  const groq_models = ["llama3-8b-8192", "llama3-70b-8192", "mixtral-8x7b-32768", "gemma-7b-it"];
  // const insert_cursor = true;
  // const suggestion_max_options = 3;

  // const proactive_refresh_time = 15000;
  // let interval_time_savecode = 20000;
  const typing_time = 5000;
  const throttleRef = useRef<{ inThrottle: boolean, timer: any }>({ inThrottle: false, timer: null });
  const typingRef = useRef<{ isTyping: boolean, timer: any }>({ isTyping: false, timer: null });
  const [refreshState, setRefreshState] = useState(0);

  const clearThrottle = useCallback(() => {
    if (throttleRef.current.timer) {
      clearTimeout(throttleRef.current.timer);
      throttleRef.current.timer = null;
    }
    throttleRef.current.inThrottle = false;
  }, []);

  const startThrottle = useCallback(() => {
    if (throttleRef.current.timer) {
      clearTimeout(throttleRef.current.timer);
    }
    throttleRef.current.inThrottle = true;
    throttleRef.current.timer = setTimeout(clearThrottle, proactive_refresh_time);
  }, []);

  const clearTyping = useCallback(() => {
    if (typingRef.current.timer) {
      clearTimeout(typingRef.current.timer);
      typingRef.current.timer = null;
    }
    if (typingRef.current.isTyping) {
      typingRef.current.isTyping = false;
    }
  }, []);

  const setTyping = useCallback(() => {
    if (typingRef.current.timer) {
      clearTimeout(typingRef.current.timer);
      typingRef.current.timer = null;
    }
    typingRef.current.isTyping = true;
  }, []);

  const handleHash = async (message: string) => {
    const encoded = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    // const hashArray = Array.from(new Uint8Array(hashBuffer));
    // const hashedString = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashString = String.fromCharCode.apply(null, hashArray);
    const hashedString = btoa(hashString);

    return hashedString;
  };

  useEffect(() => {
    setAwaitingResponse(false);
    setAwaitingSuggestions(false);
    setAwaitingManualSuggestions(false);
    setChatHistory([{ role: "system", content: "Help with programming Python" }]);
  }, [task_index]);


  useEffect(() => {
    awaitingRef.current = awaitingResponse;
  }, [awaitingResponse]);

  useEffect(() => {
    awaitingSuggestionsRef.current = awaitingSuggestions;
  }, [awaitingSuggestions]);

  useEffect(() => {
    // proactive_refresh_time changed
    clearThrottle();
  }, [proactive_refresh_time]);

  async function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(event.target.value);
  }

  async function handleKeydown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    setTyping();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Store the message before clearing input
      const messageText = inputValue;
      // Clear input immediately when Enter is pressed
      setInputValue("");
      submitMessage(messageText);
    }
  }

  async function handleKeyup(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    typingRef.current.timer = setTimeout(clearTyping, typing_time);
  }

  async function autoMessage({ replaceHash = null, err = null, source = "active", cancel = false }: any) {

    if (awaitingSuggestions) {
      return false;
    }

    if (cancel && !awaitingManualSuggestions) {
      setAwaitingSuggestions(false);
      awaitingSuggestionsRef.current = false;
      return false;
    }

    if (modelChat == "Off") {
      return false;
    }
    if (!proactive) {
      return false;
    }


    // setAwaitingResponse(true);
    // awaitingRef.current = true;
    setAwaitingSuggestions(true);
    awaitingSuggestionsRef.current = true;

    if (source == "manual") {
      setAwaitingManualSuggestions(true);
    }


    let message = "";
    let code = editorRef?.current?.getValue?.() ?? "";
    if (insert_cursor) {
      const model = editorRef?.current?.getModel?.();
      const position = editorRef?.current?.getPosition?.();
      if (model && position) {
        const offset = model.getOffsetAt(position);
        code = code.slice(0, offset) + " {cursor} " + code.slice(offset);
      }
    }

    if (err) {
      message = eval('`' + prompt.debug_prompt.replace(/`/g, '\\`') + '`');

    }
    else {
      message = eval('`' + prompt.chat_prompt.replace(/`/g, '\\`') + '`');
    }

    let systemPrompt = prompt.system_prompt;
    let proactiveResponse: any[] = [];

    // try parsing the response using regex which is a list of options
    let count = 0;
    let maxTries = 5;

    while (modelChat != "Off" && count < maxTries) {
      try {
        let response = "";
        if (openai_models.includes(modelChat)) {
          response = await get_openai_chat_response(modelChat,
            [...chatHistory, { role: "system", content: systemPrompt }, { role: "user", content: message }],
            max_tokens,
            setChatLogProbs
          );
        }
        else if (groq_models.includes(modelChat)) {
          response = await get_chat_groq(modelChat,
            [...chatHistory, { role: "system", content: systemPrompt }, { role: "user", content: message }],
            max_tokens,
            setChatLogProbs
          );
        }
        else {
          response = await get_openai_chat_response("gpt-4",
            [...chatHistory, { role: "system", content: systemPrompt }, { role: "user", content: message }],
            max_tokens,
            setChatLogProbs
          );
        }


        let lines = response.split("\n");
        proactiveResponse = [];
        let currlines: string[] = [];
        let short_text = "";
        let full_text = "";

        // Regular expression to match the options
        // let optionRegex = /^Option \d+: (.+)$/;
        // let optionRegex = /\d+\..*/g;
        let optionRegex = /^\p{P}*(?:Option\s*\d+:|\d+\.|\d+\))\s*/gu;

        // Iterate through each line
        lines.forEach(line => {
          let optionMatch = line.match(optionRegex);

          if (optionMatch) {
            // line = line.replace(/^\p{P}+|\p{P}+$/gu, '');
            line = line.replaceAll('**', '');
            full_text = currlines.join("\n");
            proactiveResponse.push({ short_text: short_text, full_text: full_text });
            // short_text = line.split(/(?:Option\s*\d+:|\d+\.|\d+\))/)[1].trim();
            short_text = line.split(optionRegex)[1].trim();
            currlines = [`**${short_text}**`];
          } else {
            // console.log(line);
            currlines.push(line);
          }

        });
        full_text = currlines.join("\n");  // Add the last text
        proactiveResponse.push({ short_text: short_text, full_text: full_text });
        proactiveResponse.shift();  // Remove the first empty element
        proactiveResponse = proactiveResponse.slice(0, suggestion_max_options);

        if (proactiveResponse.length == 0) {
          throw "No options found in response";
        }

        // this will return undefined if the message is not found
        const last_message = messages.findLast(message => message.proactiveResponse && !message.keep);
        // messageIndex = messageIndex || last_message && last_message.messageAIIndex;
        replaceHash = replaceHash || last_message && last_message.hash;
        const messageHash = await handleHash(response);
        const currIndex = messageAIIndex;

        // condition: suggestion not cancelled and not awaiting regular response
        if (source != "manual" && !awaitingSuggestionsRef.current || awaitingRef.current) {
          // clearThrottle();
          // throttleRef.current.timer = setTimeout(clearThrottle, 10);
          setAwaitingSuggestions(false);
          // if (source == "manual") {
          //   setAwaitingManualSuggestions(false);
          // }
          return false;
        }

        if (replaceHash === undefined) {
          setMessages((prevMessages: MessageData[]) => {
            return [
              ...prevMessages,
              {
                text: "", sender: "bot", proactiveResponse: proactiveResponse,
                notify: true, messageAIIndex: currIndex + 1, hash: messageHash
              } as MessageData,
            ];
          });
          setMessageAIIndex((prevMessageAIIndex) => prevMessageAIIndex + 1);
        } else {
          setMessages((prevMessages) => {
            let newMessages = [...prevMessages];
            newMessages = newMessages.filter(message => message.hash !== replaceHash);
            newMessages = [...newMessages,
            {
              text: "", sender: "bot", proactiveResponse: proactiveResponse,
              notify: true, messageAIIndex: currIndex + 1, hash: messageHash
            } as MessageData];
            return newMessages;
          }
          );
          setMessageAIIndex((prevMessageAIIndex) => prevMessageAIIndex + 1);
        }

        trackProactiveSuggestion(setTelemetry, proactiveResponse, source, modelChat, task_index, message, messageHash);
        break;
      }
      catch (e) {
        if (++count === maxTries) throw e;

        // setAwaitingResponse(false);
        setAwaitingSuggestions(false);
        if (source == "manual") {
          setAwaitingManualSuggestions(false);
        }
      }
    }

    // setAwaitingResponse(false);
    setAwaitingSuggestions(false);
    if (source == "manual") {
      setAwaitingManualSuggestions(false);
    }
    return true;
  }


  async function submitMessage(messageText: string = inputValue) {
    setTyping();

    if (awaitingResponse) {

      typingRef.current.timer = setTimeout(clearTyping, typing_time);
      setAwaitingResponse(false);

      setTelemetry((prevTelemetry: any[]) => {
        return [
          ...prevTelemetry,
          {
            event_type: "cancel_request",
            task_index: task_index,
            message: messages[messages.length - 1].text, // Last message text
            timestamp: Date.now(),
          },
        ];
      });
      return;
    }

    if (awaitingSuggestions) {
      // cancel proactive suggestions
      setAwaitingSuggestions(false);
    }

    setMessages((prevMessages: MessageData[]) => {
      return [
        ...prevMessages,
        { text: messageText, sender: "user" } as MessageData,
      ]; // { text: messageText, sender: "user" }];
    });

    setTelemetry((prevTelemetry: any[]) => {
      return [
        ...prevTelemetry,
        {
          event_type: "user_message",
          task_index: task_index,
          message: messageText,
          timestamp: Date.now(),
        },
      ];
    });

    setChatHistory((prevChatHistory) => {
      return [...prevChatHistory, { role: "user", content: messageText }];
    });

    setAwaitingResponse(true);
    awaitingRef.current = true;

    let response = "";
    if (modelChat == "Off") {
      response = "Chat Model has been disabled.";
    }
    else if (openai_models.includes(modelChat)) {
      let current_code = actualEditorRef.current.getCodeValue();

      
      // Create a streaming message first
      const streamingMessageId = Date.now().toString();
      setStreamingMessageId(streamingMessageId);
      setIsStreaming(true);
      
      setMessages((prevMessages) => {
        return [
          ...prevMessages,
          { 
            text: "", 
            sender: "bot", 
            id: streamingMessageId,
            isStreaming: true 
          } as MessageData,
        ];
      });

      const messagesToSend = proactive 
        ? [...chatHistory, { role: "user", content: "Code:\n" + current_code + "\n" + "Message:\n" + messageText }]
        : [...chatHistory, { role: "user", content: messageText }];

      try {
        await streamChatResponse(
          messagesToSend,
          modelChat,
          max_tokens,
          proactive,
          current_code,
          // onChunk callback
          (chunk: string) => {
            // Throttle updates to prevent excessive re-renders
            requestAnimationFrame(() => {
              setMessages((prevMessages) => {
                return prevMessages.map(message => 
                  message.id === streamingMessageId 
                    ? { ...message, text: message.text + chunk }
                    : message
                );
              });
            });
          },
          // onComplete callback
          (fullResponse: string, generatedCode?: string) => {
            setIsStreaming(false);
            setStreamingMessageId(null);
            setMessages((prevMessages) => {
              return prevMessages.map(message => 
                message.id === streamingMessageId 
                  ? { ...message, text: fullResponse, isStreaming: false, keep: true }
                  : message
              );
            });
            
            // Update chat history and telemetry
            let currChatHistory: any = null;
            setChatHistory((prevChatHistory) => {
              currChatHistory = prevChatHistory;
              return [...prevChatHistory, { role: "assistant", content: fullResponse }];
            });

            setTelemetry((prevTelemetry) => {
              return [
                ...prevTelemetry,
                {
                  event_type: "assistant_response",
                  task_index: task_index,
                  chatHistory: currChatHistory,
                  response: fullResponse,
                  generated_code: generatedCode || "",
                  logprob: logprob,
                  timestamp: Date.now(),
                  messageAIIndex: messageAIIndex,
                },
              ];
            });

            setMessageAIIndex((prevMessageAIIndex) => prevMessageAIIndex + 1);
          },
          // onError callback
          (error: string) => {
            setIsStreaming(false);
            setStreamingMessageId(null);
            setMessages((prevMessages) => {
              return prevMessages.map(message => 
                message.id === streamingMessageId 
                  ? { ...message, text: "Error: " + error, isStreaming: false }
                  : message
              );
            });
          },
          // onCodeReady callback - apply code immediately when ready
          (generatedCode: string) => {
            const currentCode = actualEditorRef.current.getCodeValue();
    actualEditorRef.current?.setEditorType(true, currentCode, generatedCode);
    actualEditorRef.current?.setEditorReadOnly(false);
          }
        );
        
        // Don't set response for streaming, let the completion callback handle everything
        response = null;
      } catch (error) {
        console.error('WebSocket streaming error:', error);
        setIsStreaming(false);
        setStreamingMessageId(null);
        setMessages((prevMessages) => {
          return prevMessages.map(message => 
            message.id === streamingMessageId 
              ? { ...message, text: "Error: Failed to connect to backend", isStreaming: false }
              : message
          );
        });
        response = null;
      }

      // let prompt = integrate_suggestion_into_code_chat.replace("${code}", code).replace("${suggestion}", response).replace("${question}", inputValue);

      // let new_code = await get_openai_chat_response("gpt-4o-mini",
      //   [{role: "user", content: prompt}],
      //   max_tokens,
      //   setChatLogProbs
      // );
      // new_code = new_code.slice(3, new_code.length -3).replace(/^python\n/, '');     

      // actualEditorRef.current.setEditorType(true,  current_code, new_code);
      // actualEditorRef.current.setEditorReadOnly(false);



    }
    else if (groq_models.includes(modelChat)) {
      response = await get_chat_groq(modelChat,
        [...chatHistory, { role: "user", content: messageText }],
        max_tokens,
        setChatLogProbs
      );
    }
    else {
      response = await get_openai_chat_response("gpt-4",
        [...chatHistory, { role: "user", content: messageText }],
        max_tokens,
        setChatLogProbs
      );
    }

    // Return "Dummy response for development ```def foo(bar): ```" after 5 seconds.

    //await new Promise((resolve) => setTimeout(resolve, 5000));
    //let response = "Dummy response for development ```def foo(bar): ```";

    if (response != null && awaitingRef.current) {
      // For non-streaming responses (like when model is "Off" or other models)
      if (!isStreaming) {
        setMessages((prevMessages) => {
          let newMessages = [...prevMessages, { text: response, sender: "bot" } as MessageData];
          newMessages = newMessages.map(message => ({ ...message, keep: true }));
          return newMessages;
        });
        
        let currChatHistory: any = null;
        setChatHistory((prevChatHistory) => {
          currChatHistory = prevChatHistory;
          return [...prevChatHistory, { role: "assistant", content: response }];
        });

        setTelemetry((prevTelemetry) => {
          return [
            ...prevTelemetry,
            {
              event_type: "assistant_response",
              task_index: task_index,
              chatHistory: currChatHistory,
              response: response,
              logprob: logprob,
              timestamp: Date.now(),
              messageAIIndex: messageAIIndex,
            },
          ];
        });

        setMessageAIIndex((prevMessageAIIndex) => prevMessageAIIndex + 1);
      }
      // For streaming responses, the completion callback handles everything
    }
    setAwaitingResponse(false);

    typingRef.current.timer = setTimeout(clearTyping, typing_time);
    startThrottle();

  }

  async function clearChat() {
    setMessages([]);
    setChatHistory([{ role: "system", content: "Help with programming Python" }]);
    setAwaitingResponse(false);
    setAwaitingSuggestions(false);

    setTelemetry((prevTelemetry) => {
      return [
        ...prevTelemetry,
        {
          event_type: "clear_chat",
          task_index: task_index,
          timestamp: Date.now(),
        },
      ];
    });
  }

  async function getDiff(text: any) {

    let current_code = actualEditorRef.current.getCodeValue();

    // let prompt = integrate_suggestion_into_code.replace("${code}", current_code).replace("${suggestion}", text);
    let message = prompt.integrate_prompt.replace("${code}", current_code).replace("${suggestion}", text);

    //console.log(message)

    actualEditorRef.current.setEditorReadOnly(true);

    // let new_code = await get_openai_chat_response("gpt-4o-mini",
    //   [{role: "user", content: prompt}],
    //   max_tokens,
    //   setChatLogProbs
    // );

    // new_code = new_code.slice(3, new_code.length -3).replace(/^python\n/, '');  

    let new_code = "";
    const useGroq = false;
    if (useGroq) {
      new_code = await get_chat_groq(
        "llama3-70b-8192",
        // "llama-3.1-70b-versatile",
        [{ role: "user", content: message }],
        max_tokens,
        setChatLogProbs
      );
    }
    else {
      new_code = await get_openai_chat_response(
        modelChat,
        [{ role: "user", content: message }],
        max_tokens,
        setChatLogProbs
      );
    }
    const md_regex_pattern: RegExp = /(```[\s\S]*?```)/g;
    let match = new_code.match(md_regex_pattern);

    if (useGroq) {
      if (match) {
        new_code = match[0].replace('\`\`\`\n', '').replace('\n\`\`\`', '').replace(/^python\n/, '');
      }
      else {
        new_code = new_code.replace(/^python\n/, '');
      }
    }
    else {
      new_code = new_code.slice(3, new_code.length - 3).replace(/^python\n/, '');
    }
    if (new_code.length < 3) {
      // remove the preview button and set the editor to read only
    }
    else {
      // create a 0.2 second delay to allow the editor to update
      actualEditorRef.current.setEditorType(true, current_code, new_code);

    }
    actualEditorRef.current.setEditorReadOnly(false);

    setTelemetry((prevTelemetry: any[]) => {
      return [
        ...prevTelemetry,
        {
          event_type: "incorporate_edit",
          task_index: task_index,
          message: new_code,
          timestamp: Date.now(),
        },
      ];
    });
  }

  useImperativeHandle(ref, () => {
    return {
      async getProactiveSuggestions({ id = null, manual = false, source = "active" }) {
        // Proactive suggestions disabled
        return;
      },
      async cancelProactiveSuggestions() {
        // Proactive suggestions disabled
        return;
      },
      async getProactiveDebuggingSuggestions(err: any, id = null) {
        // Proactive debugging suggestions disabled
        return;
      },
      async acceptMessage(id: string, option: number, text: string) {
        setMessages((prevMessages) => {
          let newMessages = [...prevMessages];
          newMessages = [...prevMessages, { text: text, sender: "bot" }];
          newMessages = newMessages.map(message => (
            message.hash === id && message.proactiveResponse && message.proactiveResponse[option] ?
              {
                ...message, notify: false, proactiveResponse: message.proactiveResponse.filter((_, i) => i !== option)
              } :
              message
          ));
          newMessages = newMessages.filter(message => !message.proactiveResponse || message.proactiveResponse.length > 0);

          return newMessages;
        }
        );
        setChatHistory((prevChatHistory) => {
          return [...prevChatHistory, { role: "assistant", content: text }];
        });

      },
      async previewMessage(id: string, option: number, text: string) {
        await getDiff(text)
      },
      deleteMessage(id: string, all: boolean, option: number) {
        setMessages((prevMessages) => {
          let newMessages = [...prevMessages];
          newMessages = all ? newMessages.filter(message => message.hash !== id)
            : newMessages.map(message => (
              message.hash === id && message.proactiveResponse && message.proactiveResponse[option] ?
                {
                  ...message, notify: false, proactiveResponse: message.proactiveResponse.filter((_, i) => i !== option)
                } :
                message
            ));
          newMessages = newMessages.filter(message => message.sender === 'user' || !message.proactiveResponse || message.proactiveResponse.length > 0);
          return newMessages;
        });
        // setMessages((prevMessages) => {
        //   let newMessages = [...prevMessages];
        //   // newMessages = newMessages.filter(message => message.messageAIIndex !== index);
        //   newMessages = newMessages.map(message => (message.messageAIIndex === index ? {...message, proactiveResponse: {}} : message));
        //   return newMessages;
        // });
        setRefreshState(refreshState + 1);
      },
      updateMessageKeep(id: string, isKeep = true) {
        setMessages((prevMessages) => {
          let newMessages = [...prevMessages];
          newMessages = newMessages.map(message => (
            message.hash === id ?
              { ...message, keep: isKeep } :
              message
          ));
          return newMessages;
        }
        );
      },
      startThrottle() {
        startThrottle();
      },
      clearThrottle() {
        clearThrottle();
        clearTyping();
      }
    };
  },
    [messages, proactive, modelChat, prompt]
  );

  return (
    <>
      <div className="flex flex-col h-full">
        {/* <div id="chat-window"> */}
        <ChatWindow
          messages={messages}
          awaitingResponse={awaitingResponse}
          clearChat={clearChat}
          setTelemetry={setTelemetry}
          task_index={task_index}
          messageAIIndex={messageAIIndex}
          proactive={proactive}
          proactive_delete_time={proactive_delete_time}
          chatRef={ref}
          awaitingSuggestions={awaitingManualSuggestions}
          actualEditorRef={actualEditorRef}
        />
        {/* </div> */}
        <TextInput
          onChange={handleChange}
          submitMessage={(messageText) => {
            // Clear input immediately when button is clicked
            setInputValue("");
            submitMessage(messageText);
          }}
          onKeyDown={handleKeydown}
          onKeyUp={handleKeyup}
          text_value={inputValue}
          awaitingResponse={awaitingResponse}
          actualEditorRef={actualEditorRef}
        />
      </div>
    </>
  );
});

Chat.displayName = "Chat";
export default Chat;
