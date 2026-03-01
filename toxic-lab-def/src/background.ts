/**
 * Background Script for toXic Extension
 */
import { GoogleGenAI, Type } from "@google/genai";

// Store analysis results in memory (or chrome.storage)
let lastAnalysis = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_TWEETS") {
    analyzeTweets(request.tweets).then(result => {
      lastAnalysis = result;
      sendResponse(result);
    });
    return true; // Keep channel open for async
  }

  if (request.action === "GET_LAST_ANALYSIS") {
    sendResponse(lastAnalysis);
  }
});

async function analyzeTweets(tweets: { id: string; text: string }[]) {
  const combinedText = tweets.map(t => t.text).join("\n---\n");
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analiza estos tweets y devuelve un JSON con:
      1. "emotions": Array de 4 {name, value} (Feliz, Curioso, Tenso, Tóxico).
      2. "ph": Número 0-14.
      3. "dna": Array de 4 {name, value} (Categorías).
      4. "toxicIds": Array de IDs de los tweets que tengan un PH individual > 10.
      
      Tweets: ${JSON.stringify(tweets)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emotions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, value: { type: Type.NUMBER } } } },
            ph: { type: Type.NUMBER },
            dna: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, value: { type: Type.NUMBER } } } },
            toxicIds: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Background Analysis Error:", error);
    return null;
  }
}
