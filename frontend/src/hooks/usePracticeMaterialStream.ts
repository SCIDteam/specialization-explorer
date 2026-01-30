import { useState, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";

interface PracticeMaterialProgress {
    type: "practice_material_progress";
    status: "initializing" | "retrieving" | "generating" | "validating" | "complete" | "error";
    progress: number;
    data?: PracticeMaterialResult;
    error?: string;
}

export interface PracticeMaterialResult {
    title: string;
    questions?: any[];
    cards?: any[];
    sources_used: string[];
}

interface GeneratePracticeMaterialParams {
    textbook_id: string;
    topic: string;
    material_type?: "mcq" | "flashcard" | "short_answer";
    difficulty?: "beginner" | "intermediate" | "advanced";
    num_questions?: number;
    num_options?: number;
    num_cards?: number;
    card_type?: "definition" | "concept" | "example";
    force_fresh?: boolean;
}

interface UsePracticeMaterialStreamReturn {
    generate: (params: GeneratePracticeMaterialParams) => void;
    cancel: () => void;
    status: PracticeMaterialProgress["status"] | "idle";
    progress: number;
    result: PracticeMaterialResult | null;
    error: string | null;
    isGenerating: boolean;
    isConnected: boolean;
}

/**
 * Hook for generating practice materials with WebSocket streaming progress updates.
 * 
 * Progress stages:
 * - initializing (5-10%): Loading models and credentials
 * - retrieving (15-30%): Fetching relevant content from textbook
 * - generating (35-85%): LLM generating questions/cards
 * - validating (85-95%): Parsing and validating response
 * - complete (100%): Done!
 */
export const usePracticeMaterialStream = (
    websocketUrl: string | null
): UsePracticeMaterialStreamReturn => {
    const [status, setStatus] = useState<PracticeMaterialProgress["status"] | "idle">("idle");
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<PracticeMaterialResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Use state instead of ref for reactivity - UI will re-render when this changes
    const [isGenerating, setIsGenerating] = useState(false);

    const handleMessage = useCallback((message: any) => {
        // Only handle practice material progress messages
        if (message.type !== "practice_material_progress") {
            return;
        }

        const progressMsg = message as PracticeMaterialProgress;
        console.log("[PracticeMaterialStream] Progress:", progressMsg.status, progressMsg.progress);

        setStatus(progressMsg.status);
        setProgress(progressMsg.progress);

        if (progressMsg.status === "complete") {
            console.log("[PracticeMaterialStream] Complete! Data received:", progressMsg.data);
            console.log("[PracticeMaterialStream] Questions count:", progressMsg.data?.questions?.length);
            // Set result even if data is missing (will be null)
            setResult(progressMsg.data ?? null);
            // Always stop generating on complete, even if data is missing
            setIsGenerating(false);
        } else if (progressMsg.status === "error") {
            setError(progressMsg.error || "Unknown error");
            setIsGenerating(false);
        }
    }, []);

    const {
        sendMessage,
        isConnected,
        connectionState,
    } = useWebSocket(websocketUrl, {
        onMessage: handleMessage,
    });

    const generate = useCallback((params: GeneratePracticeMaterialParams) => {
        // Validate WebSocket URL is available
        if (!websocketUrl) {
            setError("WebSocket not configured. Please refresh the page.");
            return;
        }

        if (!isConnected) {
            setError("WebSocket not connected. Please wait for connection or refresh the page.");
            return;
        }

        if (isGenerating) {
            console.warn("[PracticeMaterialStream] Generation already in progress");
            return;
        }

        // Validate required fields
        if (!params.textbook_id || params.textbook_id.trim() === '') {
            setError("Textbook ID is required.");
            return;
        }

        if (!params.topic || params.topic.trim() === '') {
            setError("Topic is required.");
            return;
        }

        // Reset state
        setStatus("initializing");
        setProgress(0);
        setResult(null);
        setError(null);
        setIsGenerating(true);

        const message = {
            action: "generate_practice_material",
            textbook_id: params.textbook_id,
            topic: params.topic,
            material_type: params.material_type || "mcq",
            difficulty: params.difficulty || "intermediate",
            num_questions: params.num_questions || 5,
            num_options: params.num_options || 4,
            num_cards: params.num_cards || 10,
            card_type: params.card_type || "definition",
            force_fresh: params.force_fresh || false,
        };

        console.log("[PracticeMaterialStream] Sending generate request:", message);
        const success = sendMessage(message);

        if (!success) {
            setError("Failed to send message");
            setStatus("error");
            setIsGenerating(false);
        }
    }, [websocketUrl, isConnected, isGenerating, sendMessage]);

    const cancel = useCallback(() => {
        setIsGenerating(false);
        setStatus("idle");
        setProgress(0);
        setResult(null); // Clear result on cancel
        setError(null);
    }, []);

    // Debug connection state
    useEffect(() => {
        console.log("[PracticeMaterialStream] Connection state:", connectionState);
    }, [connectionState]);

    return {
        generate,
        cancel,
        status,
        progress,
        result,
        error,
        isGenerating,
        isConnected,
    };
};
