import React, { Dispatch, SetStateAction } from "react";
import Bubble from "./Bubble";


export interface MessageData {
  text: string;
  sender: "user" | "bot";
  messageAIIndex?: number;
  keep?: boolean;
  notify?: boolean;
  hash?: string;
  id?: string;
  isStreaming?: boolean;
}

export interface MessageProps {
  msg: MessageData;
  text: string;
  sender: "user" | "bot";
  setTelemetry: Dispatch<SetStateAction<any[]>>;
  task_index: number;
  messageAIIndex: number;
}

const Message: React.FC<MessageProps> = ({
  msg,
  text,
  sender,
  setTelemetry,
  task_index,
  messageAIIndex,
}) => {
  return (
    <div className="flex justify-start">
      <Bubble
        msg={msg}
        text={text}
        sender={sender}
        setTelemetry={setTelemetry}
        task_index={task_index}
        messageAIindex={messageAIIndex}
      />
    </div>
  );
};

export default Message;

{
  /* <div className={sender === 'user' ? "flex justify-end" : "flex justify-start"}>
<Bubble text={text} sender={sender}/>

</div> */
}
