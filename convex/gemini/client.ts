import { processEnv } from "../fantasyPros/client";

/**
 * Google AI Studio / Gemini API (https://ai.google.dev/gemini-api/docs).
 * Free tier, no billing account required - see GEMINI.md at the project
 * root for how to get a key. Used only by convex/gemini/reportSummary.ts to
 * write the Draft Report Card's AI recap.
 *
 * gemini-3.6-flash is Google's current default/recommended model and is
 * free-tier eligible as of this writing - Google's free-tier lineup shifts
 * over time (see GEMINI.md's "things to verify"), so if this model ever
 * stops being served, swap it here.
 */
export const MODEL = "gemini-3.6-flash";
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function requireGeminiApiKey(): string {
  const apiKey = processEnv?.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. See GEMINI.md at the project root for how " +
        "to get a free key, then run `npx convex env set GEMINI_API_KEY <key>`.",
    );
  }
  return apiKey;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

// generateContent is the classic, still-fully-supported Gemini REST
// endpoint (there's also a newer "Interactions API", but generateContent's
// wire format is simpler to hand-roll and matches every other integration
// in this codebase's plain-fetch convention - see fetchFantasyPros/
// fetchSleeper/fetchYahooApi). maxOutputTokens bounds cost/length; this
// isn't a chat, just a single free-form recap.
export async function generateGeminiText(prompt: string): Promise<string> {
  const apiKey = requireGeminiApiKey();
  const url = `${API_BASE_URL}/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Gemini API request failed: ${response.status} ${response.statusText}` +
        (body ? ` - ${body}` : ""),
    );
  }

  const json: GenerateContentResponse = await response.json();
  if (json.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini API response blocked: ${json.promptFeedback.blockReason}`,
    );
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API returned no text in its response");
  }
  return text;
}
