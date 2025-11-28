import { GoogleGenerativeAI } from "@google/generative-ai";
import { AggregatedDataPoint } from '@/types';

// We lazily initialize this to prevent the app from crashing if the API_KEY 
// is missing during initial development/setup.
const getAIClient = () => {
  // Access API Key via import.meta.env for Vite compatibility
  const apiKey = (import.meta as any).env?.VITE_API_KEY;
  
  if (!apiKey) {
    console.warn("Gemini API Key (VITE_API_KEY) is missing. AI features will be disabled.");
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

export const generateExecutiveSummary = async (data: AggregatedDataPoint[]): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "AI Configuration Missing: Please add VITE_API_KEY to your environment variables.";

  const prompt = `
    Analyze the following engineering time tracking data (hours per category over weeks).
    Identify trends, shifts in focus (e.g., from R&D to Support), and any potential burnout signals based on total hours or high leave rates.
    Keep the tone professional, concise, and actionable for an Engineering Manager.
    
    Data: ${JSON.stringify(data)}
  `;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || "Unable to generate insights at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "AI Insights currently unavailable. Please check API Key.";
  }
};

export const detectAnomalies = async (data: AggregatedDataPoint[]): Promise<string> => {
   const ai = getAIClient();
   if (!ai) return "Anomaly detection unavailable (Missing VITE_API_KEY).";

   const prompt = `
    Look at the following dataset of engineering hours. 
    Are there any weeks where "Leave" (Sick/Vacation) spiked unexpectedly? 
    Are there any weeks where R&D dropped significantly below average?
    Provide a bulleted list of 2-3 key anomalies.

    Data: ${JSON.stringify(data)}
  `;

  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || "No anomalies detected.";
  } catch (error) {
    return "Anomaly detection unavailable.";
  }
}
