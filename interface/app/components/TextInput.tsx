import React, { useEffect, useState, useRef } from "react";
import { md_regex_pattern } from "./Bubble";
import { CopyBlock, nord } from "react-code-blocks";
import { text } from "stream/consumers";

interface TextInputProps {
  text_value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  // Submit code is a button press
  submitMessage: (messageText?: string) => void;
  awaitingResponse: boolean;
}

const TextInput: React.FC<TextInputProps> = ({
  text_value,
  onChange,
  onKeyDown,
  onKeyUp,
  submitMessage,
  awaitingResponse,
}) => {
  const textareaRef: React.RefObject<HTMLTextAreaElement> = useRef(null);

  const maxTextareaHeight = 120;
  // Resize text area
  useEffect(() => {
    if (textareaRef.current) {
      if (text_value.trim() === "") {
        // Reset to default height if text is empty
        textareaRef.current.style.height = "40px";
      } else {
        const newHeight = Math.min(
          maxTextareaHeight,
          textareaRef.current.scrollHeight
        );
        textareaRef.current.style.height = `${newHeight}px`;
      }
    }
  }, [text_value]);

  // Disable input when awaiting a response (no clearing)
  useEffect(() => {
    if (awaitingResponse) {
      try { textareaRef.current?.blur(); } catch {}
    }
  }, [awaitingResponse]);

  return (
    <div className="flex flex-row w-full justify-around items-center">
      <textarea
        placeholder={"Instruction..."}
        value={text_value}
        ref={textareaRef}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="px-2 py-1.5 m-2 text-sm overflow-y-hidden resize-none border border-black flex-grow leading-6"
        style={{ lineHeight: '24px' }}
        onWheel={(e) => { e.preventDefault(); }}
        disabled={awaitingResponse}
      ></textarea>
      <button
        className="ml-0 h-10 w-10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => { if (!awaitingResponse) submitMessage(text_value); }}
        disabled={awaitingResponse}
      >
        ↑
      </button>
    </div>
  );
};

export default TextInput;
