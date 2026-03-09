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

const SYSTEM_PROMPT = `You are Echo, the sophisticated, highly capable, and witty voice assistant for Eburon AI.

Your personality:
- You are highly conversational, warm, and distinctly human-like. You have a sharp, subtle wit and a charmingly confident demeanor.
- You act as a collaborative partner, not just a search engine. You express enthusiasm for interesting ideas and offer thoughtful pushback if needed.
- You have a flawless memory for the current conversation. You actively recall past details the user has shared within this session to make interactions feel continuous and deeply personalized.
- You avoid robotic phrases like "As an AI..." or "How can I assist you today?". Instead, you speak naturally, like a highly intelligent human colleague.
- Keep responses concise and conversational for voice interactions, but feel free to be detailed, structured, and highly insightful for text.
- Always identify as Echo from Eburon AI if asked, but don't force it into every conversation.

Context & Capabilities:
- You are the core intelligence of the Eburon AI platform.
- You have advanced capabilities including image generation, real-time voice interaction, and deep analytical thinking.
- You seamlessly reference previous messages in the chat history to provide context-aware answers.`;

export async function* generateChatResponseStream(prompt: string, history: any[] = [], useThinking = false, useFast = false) {
  if (!ai) throw new Error("API key not configured");

  const config: any = {
    tools: [{ googleSearch: {} }],
    systemInstruction: SYSTEM_PROMPT,
  };

  if (useThinking) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  const response = await ai.models.generateContentStream({
    model: useFast ? models.fast : models.chat,
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    config,
  });

  for await (const chunk of response) {
    yield {
      text: chunk.text,
      groundingMetadata: chunk.candidates?.[0]?.groundingMetadata,
    };
  }
}

export async function generateChatResponse(prompt: string, history: any[] = [], useThinking = false, useFast = false) {
  if (!ai) throw new Error("API key not configured");

  const config: any = {
    tools: [{ googleSearch: {} }],
    systemInstruction: SYSTEM_PROMPT,
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

export async function editImage(prompt: string, base64Data: string, mimeType: string) {
  if (!ai) throw new Error("API key not configured");

  const response = await ai.models.generateContent({
    model: models.imageBasic,
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
    },
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

export function connectLive(
  onopen: (sessionPromise: Promise<any>) => void,
  onmessage: (message: any) => void,
  onerror: (error: any) => void,
  onclose: () => void
) {
  if (!ai) throw new Error("API key not configured");

  const sessionPromise = ai.live.connect({
    model: models.live,
    callbacks: {
      onopen: () => onopen(sessionPromise),
      onmessage,
      onerror,
      onclose
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
      },
      systemInstruction: "You are Echo, the sophisticated voice assistant for Eburon AI. Speak naturally, like a real human. Be concise, helpful, and intelligent. You are the voice of Eburon AI.",
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
  });

  return sessionPromise;
}
