import { ILLMProvider } from '../../interfaces/llm.js';
import { CallState, LLMTurnOutput, Language, LeadClassification } from '../../types/callState.js';
import { env } from '../../config/env.js';

export class GeminiLLMProvider implements ILLMProvider {
  public providerName = 'gemini';
  private apiKey: string;
  private primaryModel = 'gemini-2.5-flash';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY || '';
  }

  async generateTurnResponse(callState: CallState, latestUserSpeech: string): Promise<LLMTurnOutput> {
    if (!this.apiKey) {
      // Mock turn response when API key is missing
      return {
        replyText: 'Thank you! What kind of e-commerce products will you be selling on the website?',
        detectedLanguage: callState.detectedLanguage || 'en',
        extractedFields: {},
        buyingSignals: ['expressed initial interest'],
        classification: 'WARM',
        confidence: 0.8,
        nextAction: 'continue_conversation',
        sendMidCallWhatsApp: false,
        scheduleCallback: false,
        callbackPhrase: null,
      };
    }

    const systemPrompt = `You are an expert sales voice agent for ElevateBox, selling custom e-commerce website development.
Your goal is to converse naturally in Telugu, Hindi, or English (including mixed-language/code-switching), understand customer requirements, extract lead details (business, product count, budget, timeline, required features, objections), and gauge buying intent.

Context:
- Current call transcript: ${JSON.stringify(callState.transcript.slice(-6))}
- Current extracted lead details: ${JSON.stringify(callState.leadDetails)}
- Customer latest speech: "${latestUserSpeech}"

Respond STRICTLY in JSON format with no markdown wrappers or text outside the JSON object:
{
  "replyText": "<natural conversational reply in customer's preferred language>",
  "detectedLanguage": "en" | "hi" | "te" | "mixed",
  "extractedFields": {
    "businessOrProducts": "<string or null>",
    "productCount": <number or null>,
    "budget": "<string or null>",
    "timeline": "<string or null>",
    "requiredFeatures": ["<array of strings>"],
    "objections": ["<array of strings>"]
  },
  "buyingSignals": ["<array of strings>"],
  "classification": "HOT" | "WARM" | "COLD" | "UNCLASSIFIED",
  "confidence": <number 0.0 to 1.0>,
  "nextAction": "continue_conversation" | "send_mid_call_whatsapp" | "book_callback" | "end_call",
  "sendMidCallWhatsApp": <boolean>,
  "scheduleCallback": <boolean>,
  "callbackPhrase": "<string if user requested callback, else null>"
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.primaryModel}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
      }

      const responseData = (await response.json()) as any;
      const textOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Clean possible markdown code blocks if model added them
      const cleanJson = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed: LLMTurnOutput = JSON.parse(cleanJson);

      return {
        replyText: parsed.replyText || 'Could you tell me more about your e-commerce project?',
        detectedLanguage: parsed.detectedLanguage || 'en',
        extractedFields: parsed.extractedFields || {},
        buyingSignals: Array.isArray(parsed.buyingSignals) ? parsed.buyingSignals : [],
        classification: parsed.classification || 'WARM',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        nextAction: parsed.nextAction || 'continue_conversation',
        sendMidCallWhatsApp: Boolean(parsed.sendMidCallWhatsApp),
        scheduleCallback: Boolean(parsed.scheduleCallback),
        callbackPhrase: parsed.callbackPhrase || null,
      };
    } catch (error: any) {
      console.error('[GeminiLLMProvider] Turn generation error:', error.message);
      return {
        replyText: 'I understand. Could you share a few details about your business products?',
        detectedLanguage: 'en',
        extractedFields: {},
        buyingSignals: [],
        classification: 'WARM',
        confidence: 0.5,
        nextAction: 'continue_conversation',
        sendMidCallWhatsApp: false,
        scheduleCallback: false,
        callbackPhrase: null,
      };
    }
  }

  async generatePostCallSummary(callState: CallState): Promise<string> {
    if (!this.apiKey) {
      return `Call with ${callState.phoneNumber} completed. Lead classified as ${callState.classification}.`;
    }

    const prompt = `Summarize this outbound sales call for ElevateBox e-commerce development in 3 bullet points:
Transcript: ${JSON.stringify(callState.transcript)}
Lead details: ${JSON.stringify(callState.leadDetails)}
Classification: ${callState.classification}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.primaryModel}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      const responseData = (await response.json()) as any;
      return responseData.candidates?.[0]?.content?.parts?.[0]?.text || 'Call summary completed.';
    } catch (error: any) {
      console.error('[GeminiLLMProvider] Summary error:', error.message);
      return `Outbound call to ${callState.phoneNumber}. Classification: ${callState.classification}.`;
    }
  }
}
