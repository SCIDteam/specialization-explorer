export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  sources_used?: string[];
  time: number;
  isTyping?: boolean;
  isGuidedQuestion?: boolean;
  guidedData?: {
    templateId: string;
    questionIndex: number;
    totalQuestions: number;
  };
  isFromSharedChat?: boolean;
}