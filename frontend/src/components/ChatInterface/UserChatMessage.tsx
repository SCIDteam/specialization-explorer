import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause } from "lucide-react";
import { useSpeech } from "@/contexts/SpeechContext";
import { useEffect } from "react";

// Props for saving a user's message as a shared prompt
type UserChatMessageProps = {
  text: string;
  messageTime?: number;
  initialLoadTime?: number | null;
  id?: string;
};

export default function UserChatMessage({ text, messageTime, initialLoadTime, id }: UserChatMessageProps) {
  const { settings, speak, cancel, isSpeaking, currentUtteranceId } = useSpeech();
  const isPlaying = isSpeaking && currentUtteranceId === id;

  useEffect(() => {
    try {
      if (!settings.enabled) return;
      if (!settings.autoplay) return;
      if (settings.mode === "ai") return; // don't autoplay AI only if set
      if (!messageTime || !initialLoadTime) return;
      if (messageTime < initialLoadTime) return;
      speak(text, { id });
    } catch (e) {
      console.error("Speech autoplay failed", e);
    }
  }, [settings, messageTime, initialLoadTime, speak]);


  return (
    // main msg container
    <div className="flex flex-col items-end gap-1 group">
      <div className="flex justify-end w-full">
        <Card className="py-[10px] max-w-[90%]">
          <CardContent className="px-[10px] text-sm lg:text-md break-words">
            <p className="whitespace-pre-wrap">{text}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <button
          className="text-muted-foreground hover:text-foreground p-1 mr-2"
          onClick={() => {
            if (isPlaying) cancel();
            else speak(text, { enabled: true, id });
          }}
          aria-label={isSpeaking ? "Stop narration" : "Read aloud"}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
