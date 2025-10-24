import React, { Dispatch, SetStateAction } from "react";
import { MessageData, ProactiveMessageData } from "./Message";
import Message from "./Message";
import { useEffect, useRef } from "react";
import AIThinking from "./AIThinking";

import { useState, useCallback } from 'react'


interface ChatWindowProps {
  messages: MessageData[];
  awaitingResponse: boolean;
  clearChat: () => void;
  setTelemetry: Dispatch<SetStateAction<any[]>>;
  task_index: number;
  messageAIIndex: number;
  proactive: boolean;
  proactive_delete_time: number;
  chatRef: any;
  awaitingSuggestions: boolean
  actualEditorRef: any
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  awaitingResponse,
  clearChat,
  setTelemetry,
  task_index,
  messageAIIndex,
  proactive,
  proactive_delete_time,
  chatRef,
  awaitingSuggestions,
  actualEditorRef
}) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Function to scroll the chat container to the bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  };

  const [messageLen, setMessageLen] = useState(0);
  const [lastMessageText, setLastMessageText] = useState("");
  
  useEffect(() => {
    if (chatContainerRef.current != null && messages.length === 0) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.clientHeight;
    } else if (messages.length <= messageLen) {
    }
    else {
      // Scroll for new messages
      const isNewMessage = messages.length > messageLen;
      if (isNewMessage) {
        scrollToBottom();
      }
    }
    setMessageLen(messages.length);
  }, [messages]);

  // Effect to handle streaming updates and AI assistant responses
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // Scroll when AI assistant starts responding or when streaming
      if (lastMessage && lastMessage.sender === "bot") {
        // Check if this is a streaming message or if the text has changed
        const isStreaming = lastMessage.isStreaming || false;
        const textChanged = lastMessage.text !== lastMessageText;
        
        if (isStreaming || textChanged) {
          // Small delay to ensure DOM is updated
          setTimeout(() => {
            scrollToBottom();
          }, 10);
        }
      }
      
      // Always scroll for user messages
      if (lastMessage && lastMessage.sender === "user") {
        setTimeout(() => {
          scrollToBottom();
        }, 10);
      }
      
      // Update the last message text for comparison
      setLastMessageText(lastMessage.text);
    }
  }, [messages]);

  // Effect to scroll when AI starts responding (when awaitingResponse changes to true)
  useEffect(() => {
    if (awaitingResponse) {
      // Small delay to ensure the loading indicator is rendered
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [awaitingResponse]);


  const textCopy = useCallback(async (event: any) => {
    const selection = window.getSelection();
    let selectedText: null | string = null;
    if (selection != null) {
      selectedText = selection.toString();
    }

    if (selectedText) {
      // Text is selected and copied
      // navigator.clipboard.writeText(selectedText);
      // Push the data to telemetry
      setTelemetry((prev) => [
        ...prev,
        {
          event_type: "copy_from_chat",
          task_index: task_index,
          messageAIindex: messageAIIndex,
          copied_text: selectedText,
        },
      ]);
    }

  }, []);

  return (
    <>
      <div
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden"
        ref={chatContainerRef}
        // onCopy={textCopy}
      >
        {messages.map((message, index) => (
          <Message
            key={index}
            msg={message}
            text={message.text}
            sender={message.sender}
            setTelemetry={setTelemetry}
            task_index={task_index}
            messageAIIndex={messageAIIndex}
            proactiveResponse={message.proactiveResponse || []}
            chatRef={chatRef}
            keep={message.keep || false}
            notify={message.notify || false}
            proactive_delete_time={proactive_delete_time}
            chatWindowRef={chatContainerRef}
            actualEditorRef={actualEditorRef}
            proactive={proactive}
          />
        ))}
        <div className="flex-1" />
        {awaitingResponse && !messages.some(msg => msg.sender === "bot" && (msg.isStreaming && msg.text.length > 0)) ? (
          <div className="flex justify-start mt-2">
            <img
              id="sender_icon"
              src="/chatbot_icon.png"
              className="h-8 w-8 mr-3 invert"
            />
            <div className="flex items-center">
              <AIThinking className="opacity-70" />
            </div>
          </div>
        ) : null}
        {awaitingSuggestions ? <div className="text-xs text-gray-400 p-2">Awaiting agent suggestions...</div> : null}
      </div>
    </>
  );
};

export default ChatWindow;
