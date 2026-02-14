
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Feedback, Topic } from "../types";

export const getAnalysis = async (transcript: string, topic: string): Promise<Feedback> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this speech transcript for a talk about "${topic}". Provide feedback on clarity, filler words, and engagement.
    
    Transcript: ${transcript}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER, description: "A score from 1 to 100" },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          transcript: { type: Type.STRING, description: "The cleaned up transcript" }
        },
        required: ["score", "strengths", "improvements", "transcript"]
      }
    }
  });

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse analysis JSON", e);
    return {
      score: 0,
      strengths: ["Couldn't analyze"],
      improvements: ["Analysis failed"],
      transcript: transcript
    };
  }
};

export const generateReplacementQuestion = async (day: number): Promise<Topic> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Generate a new speaking prompt for Day ${day} of a challenge. 
    
    STRICT RULES:
    1. The 'title' MUST be a complete question ending with a question mark (?).
    2. DO NOT use titles like "A Memorable Journey" or "My Favorite Food".
    3. INSTEAD use questions like "What was the most memorable journey you ever took?" or "Why is that specific dish your favorite food?".
    4. The question should be exactly one sentence.
    5. Do NOT include "Day X" in the text.
    
    CRITICAL: Provide exactly 5 structure hints following the 5W Framework (Who, What, Where, When, Why).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "A full question ending with a '?'" },
          description: { type: Type.STRING, description: "Brief context or empty string" },
          hints: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Exactly 5 strings for Who, What, Where, When, Why."
          }
        },
        required: ["title", "description", "hints"]
      }
    }
  });

  const data = JSON.parse(response.text.trim());
  
  // Safety check: Ensure it ends with a question mark
  if (!data.title.trim().endsWith('?')) {
    data.title = data.title.trim() + '?';
  }

  return {
    id: day,
    ...data
  };
};

export const getTTSAudio = async (text: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
