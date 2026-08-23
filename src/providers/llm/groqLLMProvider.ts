import { ILLMProvider } from '../../interfaces/llm.js';
import { CallState, LLMTurnOutput, ExtractedLeadDetails, leadDetailsSchema } from '../../types/callState.js';
import { env } from '../../config/env.js';

export class GroqLLMProvider implements ILLMProvider {
  public providerName = 'groq';
  private apiKey: string;
  private model: string = 'llama-3.3-70b-versatile';

  constructor() {
    this.apiKey = env.GROQ_API_KEY || '';
  }

  async generateTurnResponse(callState: CallState, latestUserSpeech: string): Promise<LLMTurnOutput> {
    if (!this.apiKey || this.apiKey === 'dummy_key') {
      console.log('[GroqLLMProvider] [FALLBACK ACTIVE] Groq serving fallback response.');
      return {
        replyText: 'I understand your requirements. Could you share what specific features you need on the store?',
        detectedLanguage: callState.detectedLanguage || 'en',
        extractedFields: {},
        buyingSignals: [],
        classification: 'WARM',
        confidence: 0.75,
        nextAction: 'continue_conversation',
        sendMidCallWhatsApp: false,
        scheduleCallback: false,
        callbackPhrase: null,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are Priya, an expert AI e-commerce sales consultant calling on behalf of an e-commerce development team.
Diagnose the prospect's needs, keep turns under 2 short sentences, and match English, Hindi, or Telugu.
Respond strictly in JSON:
{
  "replyText": "<reply>",
  "detectedLanguage": "en" | "hi" | "te",
  "extractedFields": {},
  "buyingSignals": [],
  "classification": "HOT" | "WARM" | "COLD",
  "confidence": 0.8,
  "nextAction": "continue_conversation",
  "sendMidCallWhatsApp": false,
  "scheduleCallback": false,
  "callbackPhrase": null
}`,
            },
            {
              role: 'user',
              content: `Customer said: "${latestUserSpeech}". Context: ${JSON.stringify(callState.leadDetails)}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        throw new Error(`Groq HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as any;
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      return {
        replyText: parsed.replyText || 'Could you share what features you need for your online store?',
        detectedLanguage: parsed.detectedLanguage || callState.detectedLanguage || 'en',
        extractedFields: parsed.extractedFields || {},
        buyingSignals: parsed.buyingSignals || [],
        classification: parsed.classification || 'WARM',
        confidence: parsed.confidence || 0.75,
        nextAction: parsed.nextAction || 'continue_conversation',
        sendMidCallWhatsApp: Boolean(parsed.sendMidCallWhatsApp),
        scheduleCallback: Boolean(parsed.scheduleCallback),
        callbackPhrase: parsed.callbackPhrase || null,
      };
    } catch (err: any) {
      console.error('[GroqLLMProvider] Error:', err.message);
      return {
        replyText: 'I see. Could you tell me a little more about your product catalog?',
        detectedLanguage: callState.detectedLanguage || 'en',
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
    return `Customer interested in e-commerce website development for ${callState.leadDetails.businessOrProducts || 'their store'}.`;
  }

  async extractStructuredLeadDetails(callState: CallState, latestUserSpeech: string): Promise<ExtractedLeadDetails> {
    return {
      businessOrProducts: null,
      productCount: null,
      budget: null,
      timeline: null,
      requiredFeatures: [],
      objections: [],
      decisionMaker: null,
      relevantNotes: null,
    };
  }
}

export const groqLLMProvider = new GroqLLMProvider();
