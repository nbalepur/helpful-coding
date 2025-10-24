"use client";
import React from 'react';
import Chat from './Chat';
import { BsX, BsTrash } from 'react-icons/bs';

interface ChatbotPaneProps {
  // Chat props
  theme: string;
  code: string;
  setCode: (code: string) => void;
  inputValue: string;
  setInputValue: (inputValue: string) => void;
  awaitingResponse: boolean;
  setAwaitingResponse: (awaitingResponse: boolean) => void;
  actualEditorRef: any;
  setTaskId: (taskId: string) => void;
  responseId: string;
  setResponseId: (responseId: string) => void;
  expCondition: string;
  setExpCondition: (expCondition: string) => void;
  setWorkerId: (workerId: string) => void;
  model: string;
  chatHistory: any[];
  max_tokens: number;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setTelemetry: React.Dispatch<React.SetStateAction<any[]>>;
  task_index: number;
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  messageAIIndex: number;
  setMessageAIIndex: React.Dispatch<React.SetStateAction<number>>;
  chatLogProbs: any;
  setChatLogProbs: React.Dispatch<React.SetStateAction<any>>;
  modelChat: string;
  proactive: boolean;
  proactive_refresh_time: number;
  prompts: any;
  suggestion_max_options: number;
  insert_cursor: boolean;
  proactive_delete_time: number;
  awaitingManualSuggestions: boolean;
  setAwaitingManualSuggestions: (awaitingManualSuggestions: boolean) => void;
  chatRef: any;
  onHide?: () => void;
}

const ChatbotPane: React.FC<ChatbotPaneProps> = ({
  theme,
  code,
  setCode,
  inputValue,
  setInputValue,
  awaitingResponse,
  setAwaitingResponse,
  actualEditorRef,
  setTaskId,
  responseId,
  setResponseId,
  expCondition,
  setExpCondition,
  setWorkerId,
  model,
  chatHistory,
  max_tokens,
  messages,
  setMessages,
  setTelemetry,
  task_index,
  setChatHistory,
  messageAIIndex,
  setMessageAIIndex,
  chatLogProbs,
  setChatLogProbs,
  modelChat,
  proactive,
  proactive_refresh_time,
  prompts,
  suggestion_max_options,
  insert_cursor,
  proactive_delete_time,
  awaitingManualSuggestions,
  setAwaitingManualSuggestions,
  chatRef,
  onHide,
}) => {
  const handleClearChat = () => {
    setMessages([{ text: "How can I help you today?", sender: "bot" }]);
    setChatHistory([{ role: "system", content: "help with python" }]);
    setMessageAIIndex(0);
  };
  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 w-full min-w-0">
      <div className="p-3 border-b border-gray-700/50 bg-gray-800/30">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-white">AI Help</h3>
          <div className="flex items-center space-x-1.5">
            <button 
              className="px-2.5 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-md transition-all duration-300 flex items-center space-x-1.5 hover:scale-105"
              onClick={handleClearChat}
              title="Clear chat history"
            >
              <BsTrash className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
            {onHide && (
              <button 
                className="p-1 hover:bg-gray-700/50 rounded transition-all duration-300"
                onClick={onHide}
                title="Hide AI Assistant"
              >
                <BsX className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="p-3">
        <Chat
          theme={theme}
          code={code}
          setCode={setCode}
          inputValue={inputValue}
          setInputValue={setInputValue}
          awaitingResponse={awaitingResponse}
          setAwaitingResponse={setAwaitingResponse}
          actualEditorRef={actualEditorRef}
          setTaskId={setTaskId}
          responseId={responseId}
          setResponseId={setResponseId}
          expCondition={expCondition}
          setExpCondition={setExpCondition}
          workerId={setWorkerId}
          setWorkerId={setWorkerId}
          model={model}
          chatHistory={chatHistory}
          max_tokens={max_tokens}
          messages={messages}
          setMessages={setMessages}
          setTelemetry={setTelemetry}
          task_index={task_index}
          setChatHistory={setChatHistory}
          messageAIIndex={messageAIIndex}
          setMessageAIIndex={setMessageAIIndex}
          logprob={chatLogProbs}
          setChatLogProbs={setChatLogProbs}
          modelChat={modelChat}
          proactive={proactive}
          proactive_refresh_time={proactive_refresh_time}
          prompt={prompts}
          actualEditorRef={actualEditorRef}
          editorRef={null}
          suggestion_max_options={suggestion_max_options}
          insert_cursor={insert_cursor}
          proactive_delete_time={proactive_delete_time}
          awaitingManualSuggestions={awaitingManualSuggestions}
          setAwaitingManualSuggestions={setAwaitingManualSuggestions}
          ref={chatRef}
        />
      </div>
    </div>
  );
};

export default ChatbotPane;
