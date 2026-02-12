import { Card, CardContent } from "@/components/ui/card";
import { SaveIcon, Play, Pause } from "lucide-react";
import { useSpeech } from "@/contexts/SpeechContext";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

// Props for saving a user's message as a shared prompt
type UserChatMessageProps = {
  text: string;
  onSaveError?: (error: Error) => void; // optional callback on error
  messageTime?: number;
  initialLoadTime?: number | null;
  id?: string;
};

export default function UserChatMessage({ text, onSaveError, messageTime, initialLoadTime, id }: UserChatMessageProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(text);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  function handleOpen() {
    setName("");
    setPrompt(text);
    setOpen(true);
  }

  async function handleSubmit() {
    setErrorMsg(null);

    try {
      setIsSaving(true);
      // Close dialog and notify
      setOpen(false);
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Unknown error");
      setErrorMsg(e.message);
      onSaveError?.(e);
    } finally {
      setIsSaving(false);
    }
  }
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

      {/* hover save button */}
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
        <button
          // visible by default on small (touch) screens, hidden on md+ until hover/focus
          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity focus:opacity-100 p-0"
          onClick={handleOpen}
          aria-label="Save message"
        >
          <SaveIcon className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" />
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save prompt</DialogTitle>
              <DialogDescription>
                Give this prompt a name and edit the prompt text before saving.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label className="text-sm">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="A short name for this prompt"
              />

              <label className="text-sm">Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[120px]"
              />
            </div>

            {errorMsg && (
              <p className="text-sm text-red-500">{errorMsg}</p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save prompt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
