import { CallState } from '../types/callState.js';

export interface IDatabaseProvider {
  providerName: string;
  createCallRecord(initialState: CallState): Promise<void>;
  getCallRecord(callId: string): Promise<CallState | null>;
  updateCallState(callId: string, partialState: Partial<CallState>): Promise<void>;
  logAuditEntry(callId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
}
