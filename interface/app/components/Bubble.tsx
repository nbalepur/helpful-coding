import React, { useState, Dispatch, SetStateAction, useEffect } from "react";
import classNames from "classnames";

import CodeBlock from "./CodeBlock";
import Markdown from "react-markdown";
import { CopyBlock, nord, shadesOfPurple, atomOneDark } from "react-code-blocks";
// import { dotPulse } from 'ldrs'

// dotPulse.register()

interface BubbleProps {
  msg: any;
  text: string;
  sender: string;
  setTelemetry: Dispatch<SetStateAction<any[]>>;
  task_index: number;
  messageAIindex: number;
}

export const md_regex_pattern: RegExp = /(```[\s\S]*?```)/g;
const check_has_code = (text: string) => {
  return text.split(md_regex_pattern).length > 1;
}

const Bubble: React.FC<BubbleProps> = ({
  msg,
  text,
  sender,
  setTelemetry,
  task_index,
  messageAIindex,
}) => {
  const [textString, setTextString] = useState(text);

  useEffect(() => {
    setTextString(msg.text);
  }, [msg]);


  const handleCopy = async (event: any) => {
    // let copyText = await navigator.clipboard.readText();

    setTelemetry((prev) => [
      ...prev,
      {
        event_type: "copy_code",
        task_index: task_index,
        message: text,
        timestamp: Date.now(),
      },
    ]);
  };

  const textBlock = (text: string, copy_fn: any = handleCopy) => {
    return (text.split(md_regex_pattern).map((txt, index) => {
      if (
        txt.length > 6 &&
        txt.charAt(0) == "`" &&
        txt.charAt(1) == "`" &&
        txt.charAt(2) == "`" &&
        txt.charAt(txt.length - 1) == "`" &&
        txt.charAt(txt.length - 2) == "`" &&
        txt.charAt(txt.length - 3) == "`"
      ) {
        return (
          <div onCopy={copy_fn}>
            <CopyBlock
              text={txt.slice(3, txt.length - 3).replace(/^python\n/, '')}
              language={"python"}
              showLineNumbers={true}
              // theme={shadesOfPurple}
              // theme={a11yDark}
              theme={atomOneDark}
              onCopy={copy_fn}
              key={index}
              customStyle={{ overflowX: "hidden", overflowY: "auto", maxHeight: "400px", fontSize: "0.8em", lineHeight: "1em", margin: "1em 0", wordBreak: "break-word" }}
            />
          </div>
        );
      } else {
        return <Markdown key={index}>{txt}</Markdown>;
      }
    }));
  }

  return (sender === "user" ? (
    <div
      className={classNames(
        "text-xs py-2 pl-10 pr-0 rounded-none justify-end float-right items-center w-full"
      )}
    >
      <div
        className="flex flex-row mt-2 justify-end float-right">
        <div className="user-message" style={{ wordBreak: "break-word", maxWidth: "100%" }}>
          {/* <b  style={{lineHeight: "1.5em"}}>{"You\n"}</b> */}
          <Markdown>{textString}</Markdown></div>
        {/* <div > */}
        <img
          id="sender_icon"
          src="/user_icon.png"
          className="h-8 w-8 ml-3 invert"
        ></img>

      </div>
      {/* </div> */}
    </div>
  ) : (
    <div
      className={classNames(
        "text-xs py-2 pr-3 rounded-none justify-center items-center overflow-auto w-full"
      )}
    >
      <div
        className="flex flex-row justify-stretch mt-2"
      >
        <img
          id="sender_icon"
          src={sender === "user" ? "/user_icon.png" : "/chatbot_icon.png"}
          className="h-8 w-8 mr-3 invert"
        ></img>
        <div className="markdown-content" style={{ overflowX: "hidden", borderRadius: "0", wordBreak: "break-word", maxWidth: "100%" }}>
          {textBlock(textString)}
        </div>
      </div>
    </div>
  ));
};

export default Bubble;
