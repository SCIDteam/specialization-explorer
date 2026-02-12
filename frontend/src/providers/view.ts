import { createContext, useContext } from "react";

export type ChatSession = {
  id: string;
  name: string;
  user_id: string;
  context?: unknown;
  created_at: string;
  metadata?: unknown;
};

export type ViewContextType = {
  loading: boolean;
  error: Error | null;

  // Chat session management
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  setActiveChatSessionId: (id: string) => void;
  isLoadingChatSessions: boolean;
  createNewChatSession: () => Promise<ChatSession | null>;
  refreshChatSessions: () => Promise<void>;
  updateChatSessionName: (sessionId: string, name: string) => void;
};

export const ViewContext = createContext<
  ViewContextType | undefined
>(undefined);

export function useView() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error("useView must be used within ViewProvider");
  }
  return context;
}
