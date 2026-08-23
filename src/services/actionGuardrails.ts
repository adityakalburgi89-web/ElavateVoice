import { CallState, QualificationDecision } from '../types/callState.js';

export interface GuardrailDecision {
  authorized: boolean;
  action: 'send_mid_call_whatsapp' | 'schedule_callback' | 'continue_conversation' | 'graceful_exit';
  rejectionReason?: string;
}

export class ActionGuardrails {
  /**
   * Deterministic guardrail for authorizing Mid-Call WhatsApp dispatch.
   * 
   * Strict Safety Rules:
   * 1. Must be classified as 'HOT'.
   * 2. Intent score must be >= 70 AND confidence >= 0.70.
   * 3. Must NEVER send duplicate mid-call messages (sent must be false).
   * 4. Must not already have a pending dispatch in flight.
   */
  public evaluateMidCallWhatsApp(callState: CallState, decision: QualificationDecision): GuardrailDecision {
    if (callState.midCallWhatsApp.sent) {
      return {
        authorized: false,
        action: 'send_mid_call_whatsapp',
        rejectionReason: 'Mid-call WhatsApp already sent for this call session',
      };
    }

    if (callState.midCallWhatsApp.status === 'pending') {
      return {
        authorized: false,
        action: 'send_mid_call_whatsapp',
        rejectionReason: 'Mid-call WhatsApp dispatch currently in flight',
      };
    }

    if (decision.classification !== 'HOT') {
      return {
        authorized: false,
        action: 'send_mid_call_whatsapp',
        rejectionReason: `Classification is ${decision.classification}, required HOT`,
      };
    }

    if (decision.confidence < 0.70 || decision.intentScore < 70) {
      return {
        authorized: false,
        action: 'send_mid_call_whatsapp',
        rejectionReason: `Intent score (${decision.intentScore}) or confidence (${decision.confidence}) below 0.70 threshold`,
      };
    }

    return {
      authorized: true,
      action: 'send_mid_call_whatsapp',
    };
  }

  /**
   * Deterministic guardrail for authorizing Callback Scheduling.
   * 
   * Strict Safety Rules:
   * 1. Callback must not already be booked.
   * 2. Must have recognized intent for callback or decision maker/timing barrier.
   */
  public evaluateCallbackScheduling(callState: CallState, decision: QualificationDecision): GuardrailDecision {
    if (callState.callback.booked) {
      return {
        authorized: false,
        action: 'schedule_callback',
        rejectionReason: 'Callback already booked for this lead',
      };
    }

    if (
      decision.recommendedAction !== 'schedule_callback' &&
      !callState.callback.requested &&
      !decision.barriers.includes('decision_maker_barrier') &&
      !decision.barriers.includes('timing_barrier')
    ) {
      return {
        authorized: false,
        action: 'schedule_callback',
        rejectionReason: 'No callback intent or barrier detected',
      };
    }

    return {
      authorized: true,
      action: 'schedule_callback',
    };
  }
}

export const actionGuardrails = new ActionGuardrails();
