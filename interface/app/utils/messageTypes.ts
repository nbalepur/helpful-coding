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
