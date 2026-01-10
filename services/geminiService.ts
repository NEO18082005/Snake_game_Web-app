
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getTacticalAdvice(score: number, difficulty: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Current Score: ${score}. Difficulty: ${difficulty}. 
      Act as the AG~3 OS tactical interface. Provide a one-sentence, gritty, cyberpunk-style status update or tactical advice. Keep it under 15 words.`,
      config: {
        temperature: 0.9,
      }
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini failed:", error);
    return "AG~3 SYSTEM ALERT: DATA STREAM INTERRUPTED.";
  }
}
