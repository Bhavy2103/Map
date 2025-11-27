import { GoogleGenAI } from "@google/genai";
import { LatLng, GroundingSource, Place } from "../types";

// Helper to extract coordinates that we prompt the model to generate
const parseCoordinatesFromText = (text: string): Place[] => {
  const places: Place[] = [];
  // Regex to look for patterns like "**Place Name** ... (lat: 12.34, lng: 56.78)"
  const regex = /(?:^|\n|[\.\!\?]\s+)(?:\*\*)?(.*?)(?:\*\*)?.*?\((?:lat:|latitude:)\s*(-?\d+(\.\d+)?),\s*(?:lng:|longitude:)\s*(-?\d+(\.\d+)?)\)/gi;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawName = match[1].trim();
    const cleanName = rawName.replace(/^[*-]\s*/, '').replace(/\*+/g, '').split(/[.!?]/).pop()?.trim() || "Unknown Location";
    
    if (match[2] && match[4]) {
      const lat = parseFloat(match[2]);
      const lng = parseFloat(match[4]);

      // Strict validation to prevent NaN errors in Leaflet
      if (!isNaN(lat) && !isNaN(lng)) {
        places.push({
          id: Math.random().toString(36).substr(2, 9),
          name: cleanName,
          coordinate: {
            lat: lat,
            lng: lng
          }
        });
      }
    }
  }
  return places;
};

export const sendMessageToGemini = async (
  prompt: string,
  userLocation?: LatLng
): Promise<{ text: string; places: Place[]; sources: GroundingSource[] }> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
    You are a geospatial search engine.
    User Query: ${prompt}
    
    Goal: Identify real-world locations that match the user's query using Google Maps Grounding.
    
    Response Rules:
    1. Provide a concise summary of the locations found.
    2. FOR EVERY LOCATION, you MUST include its coordinates inline.
    3. Format: "**Location Name** (lat: 0.0000, lng: 0.0000) - Short description."
    4. Do not offer chatty pleasantries. Be direct and informational.
    
    If the query is generic (e.g., "hello"), verify if it implies a location need or just guide them to search for a place.
  `;

  const model = "gemini-2.5-flash"; 

  const config: any = {
    systemInstruction,
    tools: [{ googleMaps: {} }],
  };

  if (userLocation && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
    config.toolConfig = {
      retrievalConfig: { 
         latLng: {
           latitude: userLocation.lat,
           longitude: userLocation.lng
         }
      }
    };
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config,
    });

    const text = response.text || "No specific locations found.";
    
    const sources: GroundingSource[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
            sources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      });
    }

    const places = parseCoordinatesFromText(text);

    return { text, places, sources };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};