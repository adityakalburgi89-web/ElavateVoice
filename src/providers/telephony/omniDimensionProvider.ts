import { env } from '../../config/env.js';
import { ITelephonyProvider, InitiateCallParams, InitiateCallResult } from '../../interfaces/telephony.js';
import { CallStatus } from '../../types/callState.js';

export class OmniDimensionProvider implements ITelephonyProvider {
  public providerName = 'omnidimension';

  public async initiateCall(params: InitiateCallParams): Promise<InitiateCallResult> {
    const apiKey = env.OMNIDIMENSION_API_KEY;
    const agentId = env.OMNIDIMENSION_AGENT_ID;

    const initialGreeting =
      'Hello! This is ElevateBox calling regarding your e-commerce website development inquiry. Can you hear me clearly?';

    // If API key is dummy or not provided, fallback to simulated outbound call for local testing
    if (!apiKey || apiKey === 'dummy_key' || !agentId || agentId === 'dummy_agent') {
      const mockCallId = `omn_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      return {
        callId: mockCallId,
        status: 'initiated',
        providerRawResponse: {
          mock: true,
          message: 'Initiated simulated call (OmniDimension API key/agent ID not set in .env)',
          firstSentence: initialGreeting,
        },
      };
    }

    try {
      // OmniDimension Outbound Call API Request
      const endpoint = 'https://omnidim.io/api/v1/calls/dispatch';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: parseInt(agentId, 10) || agentId,
          to_number: params.phoneNumber,
          phone_number: params.phoneNumber,
          webhook_url: params.callbackUrl,
          first_sentence: initialGreeting,
          custom_data: params.customData || {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OmniDimension API HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { call_id?: string; status?: string };

      return {
        callId: data.call_id || `omn_${Date.now()}`,
        status: 'initiated',
        providerRawResponse: data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initiate OmniDimension call: ${errorMessage}`);
    }
  }

  public async hangupCall(callId: string): Promise<boolean> {
    const apiKey = env.OMNIDIMENSION_API_KEY;
    if (!apiKey || apiKey === 'dummy_key') return true;

    try {
      const response = await fetch(`https://api.omnidimension.ai/v1/calls/${callId}/terminate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async getCallStatus(callId: string): Promise<CallStatus> {
    const apiKey = env.OMNIDIMENSION_API_KEY;
    if (!apiKey || apiKey === 'dummy_key') return 'connected';

    try {
      const response = await fetch(`https://api.omnidimension.ai/v1/calls/${callId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) return 'failed';

      const data = (await response.json()) as { status?: string };
      switch (data.status?.toLowerCase()) {
        case 'ringing':
          return 'ringing';
        case 'in_progress':
        case 'connected':
          return 'connected';
        case 'ended':
        case 'completed':
          return 'completed';
        case 'failed':
          return 'failed';
        case 'busy':
          return 'busy';
        case 'no_answer':
          return 'no-answer';
        default:
          return 'initiated';
      }
    } catch {
      return 'failed';
    }
  }
}

export const omniDimensionProvider = new OmniDimensionProvider();
