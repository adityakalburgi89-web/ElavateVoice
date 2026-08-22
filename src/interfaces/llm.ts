import { CallState, LLMTurnOutput } from '../types/callState.js';

export interface ILLMProvider {
  providerName: string;
  generateTurnResponse(callState: CallState, latestUserSpeech: string): Promise<LLMTurnOutput>;
  generatePostCallSummary(callState: CallState): Promise<string>;
}
