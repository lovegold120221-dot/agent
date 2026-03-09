import { GoogleGenAI, ThinkingLevel, Type, Modality } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const models = {
  chat: "gemini-3.1-pro-preview",
  fast: "gemini-3.1-flash-lite-preview",
  image: "gemini-3.1-flash-image-preview",
  imageBasic: "gemini-2.5-flash-image",
  imagePro: "gemini-3-pro-image-preview",
  audio: "gemini-3-flash-preview",
  tts: "gemini-2.5-flash-preview-tts",
  live: "gemini-2.5-flash-native-audio-preview-09-2025",
};

export async function generateChatResponse(prompt: string, history: any[] = [], useThinking = false, useFast = false) {
  if (!ai) throw new Error("API key not configured");

  const config: any = {
    tools: [{ googleSearch: {} }],
  };

  if (useThinking) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  const response = await ai.models.generateContent({
    model: useFast ? models.fast : models.chat,
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    config,
  });

  return {
    text: response.text,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata,
  };
}

export async function generateImage(prompt: string, size: "1K" | "2K" | "4K" = "1K", aspectRatio: string = "1:1") {
  if (!ai) throw new Error("API key not configured");

  const isBasic = size === "1K" && aspectRatio === "1:1";
  const model = isBasic ? models.imageBasic : models.image;

  const config: any = {
    imageConfig: {
      aspectRatio: aspectRatio as any,
    },
  };

  if (!isBasic) {
    config.imageConfig.imageSize = size;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [{ text: prompt }] }],
    config,
  });

  const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  }
  return null;
}

export async function analyzeImage(prompt: string, base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.chat,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
    },
  });

  return response.text;
}

export async function textToSpeech(text: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.tts,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Zephyr" },
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (audioData) {
    return `data:audio/wav;base64,${audioData}`;
  }
  return null;
}

export async function transcribeAudio(base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.audio,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: "Transcribe this audio exactly." },
      ],
    },
  });

  return response.text;
}

export function connectLive(callbacks: {
  onopen?: () => void;
  onmessage: (message: any) => void;
  onerror?: (error: any) => void;
  onclose?: () => void;
}) {
  if (!ai) throw new Error("API key not configured");

  return ai.live.connect({
    model: models.live,
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
      },
      systemInstruction: "You are a helpful assistant named Echo.",
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
  });
}
