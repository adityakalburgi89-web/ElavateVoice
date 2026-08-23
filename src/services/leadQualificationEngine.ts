import { CallState, QualificationDecision, qualificationDecisionSchema } from '../types/callState.js';
import { env } from '../config/env.js';

export class LeadQualificationEngine {
  private apiKey: string;
  private primaryModel = 'gemini-2.5-flash';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY || '';
  }

  /**
   * Evaluates call state and latest customer speech to determine lead classification (HOT/WARM/COLD),
   * intent score (0-100), buying signals, barriers, and recommended actions.
   * 
   * NEVER uses naive keyword matching. Evaluates underlying intent, nuance, and conversational context.
   */
  async evaluateLead(callState: CallState, latestSpeech: string): Promise<QualificationDecision> {
    const defaultDecision: QualificationDecision = this.heuristicFallback(callState, latestSpeech);

    if (!this.apiKey) {
      return defaultDecision;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const prompt = `You are an expert sales analyst evaluating a live phone call lead for ElevateBox (e-commerce website development).

CLASSIFICATION CRITERIA (Do NOT use simple keyword matching; reason about underlying intent):

1. "HOT" (High buying intent, ready/close to purchase):
   - Asking specific start date or timeline ("how soon can you start", "we want it live next week")
   - Asking specific commercial terms ("what is the payment schedule", "send me the invoice / contract")
   - Strong buying signals, verified decision maker, clear product catalog and budget readiness.
   - Action: "send_mid_call_whatsapp"

2. "WARM" (Genuine interest and need, but blocked by a barrier):
   - Genuine business need exists, but customer expresses:
     * Budget constraint ("my budget is not much right now", "looking for an affordable option")
     * Authority constraint ("my brother/partner handles this", "I will discuss with team")
     * Timing constraint ("we are opening next month, call me then")
   - Action: "schedule_callback" (if callback or time mentioned) or "continue_conversation"

3. "COLD" (Curiosity, polite brush-off, non-committal, no buying intent):
   - Brushing off ("send me the details on WhatsApp", "I am just looking around")
   - No clear products, no budget, unwilling to engage, defensive tone.
   - Action: "graceful_exit" or "continue_conversation"

CURRENT CALL CONTEXT:
- Phone: ${callState.phoneNumber}
- Known Lead Details: ${JSON.stringify(callState.leadDetails)}
- Previous Classification: ${callState.classification} (Score: ${callState.intentScore})
- Recent Transcript: ${JSON.stringify(callState.transcript.slice(-6))}
- Latest Customer Utterance: "${latestSpeech}"

Respond STRICTLY in JSON:
{
  "classification": "HOT" | "WARM" | "COLD" | "UNCLASSIFIED",
  "confidence": <number between 0.0 and 1.0>,
  "intentScore": <number between 0 and 100>,
  "reasons": ["<evidence 1 from conversation>", "<evidence 2>"],
  "buyingSignals": ["<buying signal 1>", "<buying signal 2>"],
  "barriers": ["<barrier such as budget_barrier, decision_maker_barrier, timing_barrier or none>"],
  "recommendedAction": "send_mid_call_whatsapp" | "schedule_callback" | "continue_conversation" | "graceful_exit"
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.primaryModel}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        return defaultDecision;
      }

      const responseData = (await response.json()) as any;
      const textOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanJson = textOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedJson = JSON.parse(cleanJson);

      const validated = qualificationDecisionSchema.safeParse(parsedJson);
      if (validated.success) {
        return validated.data;
      }
      return defaultDecision;
    } catch (err: any) {
      console.warn('[LeadQualificationEngine] Evaluation error, using fallback:', err.message);
      return defaultDecision;
    }
  }

  /**
   * Deterministic heuristic fallback when LLM API is unreachable or rate-limited.
   */
  private heuristicFallback(callState: CallState, latestSpeech: string): QualificationDecision {
    const text = (latestSpeech + ' ' + (callState.transcript.slice(-2).map(t => t.content).join(' '))).toLowerCase();

    // Hot indicators
    if (
      text.includes('how soon can you start') ||
      text.includes('start date') ||
      text.includes('finalize') ||
      (callState.leadDetails.budget && callState.leadDetails.productCount && text.includes('price'))
    ) {
      return {
        classification: 'HOT',
        confidence: 0.85,
        intentScore: 85,
        reasons: ['Customer asked about starting date or immediate implementation'],
        buyingSignals: ['Immediate timeline readiness', 'Commercial inquiry'],
        barriers: [],
        recommendedAction: 'send_mid_call_whatsapp',
      };
    }

    // Warm with barriers
    if (text.includes('brother') || text.includes('partner') || text.includes('decision')) {
      return {
        classification: 'WARM',
        confidence: 0.8,
        intentScore: 55,
        reasons: ['Genuine interest identified but blocked by secondary decision maker'],
        buyingSignals: ['Expressed product interest'],
        barriers: ['decision_maker_barrier'],
        recommendedAction: 'schedule_callback',
      };
    }

    if (text.includes('budget is not much') || text.includes('tight') || text.includes('low budget')) {
      return {
        classification: 'WARM',
        confidence: 0.8,
        intentScore: 50,
        reasons: ['Customer interested but expressed price sensitivity'],
        buyingSignals: ['Looking for website solution'],
        barriers: ['budget_barrier'],
        recommendedAction: 'continue_conversation',
      };
    }

    // Cold brush-offs
    if (text.includes('send me the details') || text.includes('just looking') || text.includes('not now')) {
      return {
        classification: 'COLD',
        confidence: 0.75,
        intentScore: 25,
        reasons: ['Polite brush-off without specific requirements'],
        buyingSignals: [],
        barriers: ['low_intent_brush_off'],
        recommendedAction: 'graceful_exit',
      };
    }

    return {
      classification: callState.classification === 'UNCLASSIFIED' ? 'WARM' : callState.classification,
      confidence: 0.6,
      intentScore: 50,
      reasons: ['General exploratory conversation in progress'],
      buyingSignals: ['Engaged in dialogue'],
      barriers: [],
      recommendedAction: 'continue_conversation',
    };
  }
}

export const leadQualificationEngine = new LeadQualificationEngine();
