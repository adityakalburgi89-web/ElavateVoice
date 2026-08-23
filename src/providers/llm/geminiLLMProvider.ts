import { ILLMProvider } from '../../interfaces/llm.js';
import { CallState, LLMTurnOutput, LeadDetails, leadDetailsSchema, ExtractedLeadDetails } from '../../types/callState.js';
import { env } from '../../config/env.js';
import { groqLLMProvider } from './groqLLMProvider.js';

export class GeminiLLMProvider implements ILLMProvider {
  public providerName = 'gemini';
  private apiKey: string;
  private primaryModel = 'gemini-2.5-flash';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY || '';
  }

  /**
   * MODULE A: Conversational Sales Response Generation
   * Generates a warm, consultative sales reply (1-2 sentences) in the customer's language.
   * Ensures no repeating questions already answered.
   */
  async generateTurnResponse(callState: CallState, latestUserSpeech: string): Promise<LLMTurnOutput> {
    if (!this.apiKey) {
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const systemPrompt = `You are an expert consultative sales representative for ElevateBox, calling about custom e-commerce website development.
You sound warm, helpful, and natural—NOT like a robotic questionnaire or IVR menu.

SALES GUIDELINES:
1. Language Handling:
   - If customer speaks Telugu or Telugu+English mix -> Reply in warm Telugu (or Telugu-English code-switching). Set "detectedLanguage": "te".
   - If customer speaks Hindi or Hindi+English mix -> Reply in natural Hindi (or Hinglish). Set "detectedLanguage": "hi".
   - If customer speaks English -> Reply in natural English. Set "detectedLanguage": "en".
   - If customer switches languages mid-call, immediately follow their language.
2. Natural Discovery Rules:
   - We must discover 5 things across the whole call: (1) Products/Business, (2) Product Count, (3) Budget, (4) Timeline, (5) Features.
   - Look at "Already Known Project Details" below. DO NOT ASK ANY QUESTION WHOSE ANSWER IS ALREADY KNOWN!
   - Ask only ONE sensible, conversational question at a time.
   - Acknowledge what the customer said before asking the next question.
   - Handle vague answers (e.g. if budget is "tight" or "low", reassure them we have affordable custom plans and ask what comfortable range works for them).
3. Length Constraint:
   - Keep replies SHORT and CONVERSATIONAL (1 to 2 short sentences maximum).

Context:
- Current call language: ${callState.detectedLanguage}
- Already Known Project Details: ${JSON.stringify(callState.leadDetails)}
- Recent transcript: ${JSON.stringify(callState.transcript.slice(-4))}
- Customer latest speech: "${latestUserSpeech}"

Respond STRICTLY in JSON format:
{
  "replyText": "<short consultative reply in customer's current language>",
  "detectedLanguage": "en" | "hi" | "te" | "mixed",
  "extractedFields": {
    "businessOrProducts": "<string or null>",
    "productCount": <number or null>,
    "budget": "<string or null>",
    "timeline": "<string or null>",
    "requiredFeatures": ["<array of strings>"],
    "objections": ["<array of strings>"],
    "decisionMaker": "<string or null>",
    "relevantNotes": "<string or null>"
  },
  "buyingSignals": ["<array of strings>"],
  "classification": "HOT" | "WARM" | "COLD" | "UNCLASSIFIED",
  "confidence": 0.8,
  "nextAction": "continue_conversation",
  "sendMidCallWhatsApp": false,
  "scheduleCallback": false,
  "callbackPhrase": null
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
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
      }

      const responseData = (await response.json()) as any;
      const textOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const cleanJson = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        replyText: parsed.replyText || 'Could you tell me a little more about your e-commerce products?',
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
      console.warn('[GeminiLLMProvider] Primary Gemini turn error/timeout:', error.message, '-> Activating Groq fallback...');
      return await groqLLMProvider.generateTurnResponse(callState, latestUserSpeech);
    }
  }

  /**
   * MODULE B: Structured Lead Extraction & Validation
   * Analyzes conversation turns and returns verified structured lead details using Zod schema validation.
   */
  async extractStructuredLeadDetails(callState: CallState, latestUserSpeech: string): Promise<ExtractedLeadDetails> {
    const emptyResult: ExtractedLeadDetails = {
      businessOrProducts: null,
      productCount: null,
      budget: null,
      timeline: null,
      requiredFeatures: [],
      objections: [],
      decisionMaker: null,
      relevantNotes: null,
    };

    if (!this.apiKey) {
      return emptyResult;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const extractionPrompt = `Extract any updated e-commerce project lead fields from the conversation.
Current Known Lead State: ${JSON.stringify(callState.leadDetails)}
Latest Customer Utterance: "${latestUserSpeech}"

Extract strictly what was mentioned. If a field was not mentioned in this utterance, keep it null.
Return STRICTLY JSON:
{
  "businessOrProducts": "<string or null>",
  "productCount": <number or null>,
  "budget": "<string or null>",
  "timeline": "<string or null>",
  "requiredFeatures": ["<array of features like payment gateway, cod, shipping, mobile responsive>"],
  "objections": ["<array of objections like budget constraint, checking with partner>"],
  "decisionMaker": "<string or null>",
  "relevantNotes": "<concise note or null>"
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.primaryModel}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: extractionPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        return emptyResult;
      }

      const responseData = (await response.json()) as any;
      const textOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedJson = JSON.parse(cleanJson);

      // Validate with Zod Schema
      const validated = leadDetailsSchema.safeParse(parsedJson);
      return validated.success ? validated.data : emptyResult;
    } catch (err: any) {
      console.warn('[GeminiLLMProvider] Lead extraction warning:', err.message);
      return emptyResult;
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
