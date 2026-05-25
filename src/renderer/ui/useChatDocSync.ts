// Loads the chat thread for the current document whenever the open file
// changes, so each document keeps its own conversation (persisted in
// localStorage by the chat store).

import { useEffect } from "react";
import { useDocument } from "../store/document.js";
import { useChat } from "../store/chat.js";

function docKeyFor(file: { path?: string; displayName: string } | null): string {
  if (!file) return "untitled";
  return file.path ?? file.displayName ?? "untitled";
}

export function useChatDocSync(): void {
  const currentFile = useDocument((s) => s.currentFile);
  useEffect(() => {
    useChat.getState().loadFor(docKeyFor(currentFile));
  }, [currentFile]);
}
