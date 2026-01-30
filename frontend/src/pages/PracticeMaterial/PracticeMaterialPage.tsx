import { useState, useEffect, useMemo } from "react";
import { GenerateForm } from "@/components/PracticeMaterialPage/GenerateForm";
import { MCQQuiz } from "@/components/PracticeMaterialPage/MCQQuiz";
import { FlashcardSet } from "@/components/PracticeMaterialPage/FlashcardSet";
import { ShortAnswer } from "@/components/PracticeMaterialPage/ShortAnswer";
import type { PracticeMaterial } from "@/types/PracticeMaterial";
import { isMCQQuiz, isFlashcardSet, isShortAnswer } from "@/types/PracticeMaterial";
import { Card, CardDescription } from "@/components/ui/card";
import { useTextbookView } from "@/providers/textbookView";
import { usePracticeMaterialStream } from "@/hooks/usePracticeMaterialStream";
import { Progress } from "@/components/ui/progress";

// Status display mapping
const STATUS_LABELS: Record<string, string> = {
  idle: "",
  initializing: "Initializing models...",
  retrieving: "Retrieving relevant content...",
  generating: "Generating practice material...",
  validating: "Validating response...",
  complete: "Complete!",
  error: "Error occurred",
};

export default function PracticeMaterialPage() {
  const [materials, setMaterials] = useState<PracticeMaterial[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { textbook } = useTextbookView();

  // WebSocket authentication token
  const [wsToken, setWsToken] = useState<string | null>(null);

  // Fetch authentication token on mount
  useEffect(() => {
    const apiEndpoint = import.meta.env.VITE_API_ENDPOINT;
    if (!apiEndpoint) return;

    let isActive = true;
    let refreshTimeoutId: number | undefined;
    const refreshDelayMs = 14 * 60 * 1000; // Refresh before 15 min expiry

    async function fetchToken() {
      if (!isActive) return;

      try {
        const response = await fetch(`${apiEndpoint}/user/publicToken`);
        if (!response.ok) throw new Error("Token request failed");

        const { token } = await response.json();
        if (!isActive) return;

        setWsToken(token);
        // Check isActive before scheduling to prevent race condition
        if (isActive) {
          refreshTimeoutId = window.setTimeout(fetchToken, refreshDelayMs);
        }
      } catch (error) {
        console.error("[PracticeMaterial] Failed to fetch token:", error);
        if (!isActive) return;

        setWsToken(null);
        // Check isActive before scheduling retry to prevent race condition
        if (isActive) {
          refreshTimeoutId = window.setTimeout(fetchToken, 30000);
        }
      }
    }

    fetchToken();

    return () => {
      isActive = false;
      if (refreshTimeoutId) window.clearTimeout(refreshTimeoutId);
    };
  }, []);

  // Build authenticated WebSocket URL
  const baseWsUrl = import.meta.env.VITE_WEBSOCKET_URL;
  const wsUrl = useMemo(() => {
    if (!baseWsUrl || !wsToken) return null;

    try {
      const url = new URL(baseWsUrl);
      url.searchParams.set("token", wsToken);
      return url.toString();
    } catch {
      return null;
    }
  }, [baseWsUrl, wsToken]);

  // Use the streaming hook with authenticated URL
  const {
    generate,
    status,
    progress,
    result,
    error: streamError,
    isConnected,
  } = usePracticeMaterialStream(wsUrl);

  // Handle successful result from WebSocket streaming
  useEffect(() => {
    if (status === "complete" && result) {
      setMaterials((prev) => [result as PracticeMaterial, ...prev]);
    }
  }, [status, result]);

  // Handle errors from streaming
  useEffect(() => {
    if (streamError) {
      setErrorMsg(streamError);
    }
  }, [streamError]);

  const handleGenerate = async (formData: any) => {
    console.log("handleGenerate called with:", formData);
    setErrorMsg(null);

    if (!textbook?.id) {
      setErrorMsg("Please select a textbook before generating practice materials.");
      return;
    }

    // Map form data to streaming hook params
    const materialType = formData.materialType === "flashcards"
      ? "flashcard"
      : formData.materialType === "shortAnswer"
        ? "short_answer"
        : "mcq";

    generate({
      textbook_id: textbook.id,
      topic: formData.topic,
      material_type: materialType,
      difficulty: formData.difficulty,
      num_questions: formData.numQuestions,
      num_options: formData.numOptions,
      num_cards: formData.numCards,
      card_type: formData.cardType,
      force_fresh: formData.forceFresh || false,
    });
  };

  const handleDeleteMaterial = (index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index));
  };

  // Get status label
  const statusLabel = STATUS_LABELS[status] || "";
  const isProcessing = status !== "idle" && status !== "complete" && status !== "error";

  return (
    <div className="w-full max-w-[1800px] px-4 py-4">
      <div className="min-h-screen flex flex-col md:flex-row md:items-start md:justify-center gap-6">
        <div className="w-full md:w-[30%]">
          <GenerateForm onGenerate={handleGenerate} isProcessing={isProcessing} />

          {/* Connection warning */}
          {!isConnected && !isProcessing && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ Connecting to server... Please wait.
            </p>
          )}

          {errorMsg && (
            <p className="text-sm text-destructive mt-2">{errorMsg}</p>
          )}
        </div>

        <div className="w-full md:w-[70%] space-y-6">
          <h2 className="text-2xl font-semibold">Practice Materials</h2>
          {/* Show progress bar when generating, hide empty state message */}
          {isProcessing ? (
            <Card>
              <div className="p-6 space-y-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{statusLabel}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-3" />
                <p className="text-center text-sm text-muted-foreground">
                  Generating practice materials...
                </p>
              </div>
            </Card>
          ) : materials.length === 0 ? (
            <Card>
              <CardDescription className="flex flex-col justify-center items-center p-6">
                <p className="text-center text-muted-foreground">No practice materials have been generated for this session</p>
                <p className="text-destructive text-center mt-2">Reminder: All Sessions are temporary and will not persist after exiting OR refreshing the page.</p>
              </CardDescription>
            </Card>
          ) : (
            materials.map((material, index) => {
              if (isMCQQuiz(material)) {
                return (
                  <MCQQuiz
                    key={index}
                    title={material.title}
                    questions={material.questions}
                    sources_used={material.sources_used}
                    onDelete={() => handleDeleteMaterial(index)}
                  />
                );
              } else if (isFlashcardSet(material)) {
                return (
                  <FlashcardSet
                    key={index}
                    title={material.title}
                    cards={material.cards}
                    onDelete={() => handleDeleteMaterial(index)}
                  />
                );
              } else if (isShortAnswer(material)) {
                return (
                  <ShortAnswer
                    key={index}
                    title={material.title}
                    questions={material.questions}
                    sources_used={material.sources_used}
                    onDelete={() => handleDeleteMaterial(index)}
                  />
                );
              }
              return null;
            })
          )}
        </div>
      </div>
    </div>
  );
}

