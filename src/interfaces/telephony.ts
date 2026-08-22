import { CallStatus } from '../types/callState.js';

export interface InitiateCallParams {
  phoneNumber: string;
  callbackUrl?: string;
  customData?: Record<string, unknown>;
}

export interface InitiateCallResult {
  callId: string;
  status: CallStatus;
  providerRawResponse?: unknown;
}

export interface ITelephonyProvider {
  providerName: string;
  initiateCall(params: InitiateCallParams): Promise<InitiateCallResult>;
  hangupCall(callId: string): Promise<boolean>;
  getCallStatus(callId: string): Promise<CallStatus>;
}
