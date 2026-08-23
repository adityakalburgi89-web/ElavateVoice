import { callStateStore } from './callStateStore.js';
import { actionGuardrails } from './actionGuardrails.js';
import { metaWhatsAppProvider } from '../providers/whatsapp/metaWhatsAppProvider.js';
import { twilioWhatsAppProvider } from '../providers/whatsapp/twilioWhatsAppProvider.js';
import { ultraMsgWhatsAppProvider } from '../providers/whatsapp/ultraMsgWhatsAppProvider.js';
import { env } from '../config/env.js';
import { IWhatsAppProvider } from '../interfaces/whatsapp.js';
import { QualificationDecision } from '../types/callState.js';

export class MidCallWhatsAppService {
  /**
   * Asynchronously triggers mid-call WhatsApp message for a HOT lead.
   * 
   * CRITICAL REQUIREMENTS:
   * 1. Non-blocking: Must be invoked asynchronously (never block the voice turn loop).
   * 2. Idempotent: Atomic lock prevents duplicate dispatch for the same call.
   * 3. Trigger evidence logged in canonical CallState.
   * 4. Transient failures logged without killing the active phone call.
   */
  public triggerMidCallWhatsAppAsync(callId: string, decision: QualificationDecision): void {
    // Run completely decoupled from the HTTP response loop
    setImmediate(async () => {
      await this.executeDispatch(callId, decision);
    });
  }

  /**
   * Internal execution with atomic state locking and evidence logging.
   */
  public async executeDispatch(callId: string, decision: QualificationDecision): Promise<boolean> {
    const callState = callStateStore.getCall(callId);
    if (!callState) return false;

    // 1. Guardrail evaluation
    const guard = actionGuardrails.evaluateMidCallWhatsApp(callState, decision);
    if (!guard.authorized) {
      console.log(`[MidCallWhatsAppService] Dispatch skipped: ${guard.rejectionReason}`);
      return false;
    }

    // 2. Atomic lock: Set status to pending immediately
    callState.midCallWhatsApp.status = 'pending';
    callState.updatedAt = new Date().toISOString();

    const triggerEvidence = decision.reasons.join('; ') || 'High buying intent detected';

    try {
      console.log(`[MidCallWhatsAppService] Dispatching mid-call WhatsApp to ${callState.phoneNumber}...`);
      let provider: IWhatsAppProvider = metaWhatsAppProvider;
      if (env.WHATSAPP_PROVIDER === 'ultramsg') {
        provider = ultraMsgWhatsAppProvider;
      } else if (env.WHATSAPP_PROVIDER === 'twilio') {
        provider = twilioWhatsAppProvider;
      }
      const result = await provider.sendMidCallMessage({
        recipientPhoneNumber: callState.phoneNumber,
        leadDetails: callState.leadDetails,
      });

      if (result.success) {
        const timestamp = new Date().toISOString();
        callState.midCallWhatsApp = {
          sent: true,
          timestamp,
          status: 'sent',
          messageId: result.messageId || null,
        };
        callState.updatedAt = timestamp;

        // Log system transcript item with trigger evidence
        callStateStore.addTranscriptItem(callId, {
          role: 'system',
          content: `Mid-call WhatsApp sent to ${callState.phoneNumber} (Evidence: ${triggerEvidence})`,
        });

        console.log(`[MidCallWhatsAppService] Mid-call WhatsApp delivered successfully (ID: ${result.messageId})`);
        return true;
      } else {
        callState.midCallWhatsApp.status = 'failed';
        callState.providerErrors.push({
          provider: 'meta_whatsapp',
          error: result.error || 'Failed to send mid-call WhatsApp',
          timestamp: new Date().toISOString(),
        });
        console.warn(`[MidCallWhatsAppService] WhatsApp dispatch returned failure:`, result.error);
        return false;
      }
    } catch (err: any) {
      callState.midCallWhatsApp.status = 'failed';
      callState.providerErrors.push({
        provider: 'meta_whatsapp',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      console.error(`[MidCallWhatsAppService] Dispatch exception:`, err.message);
      return false;
    }
  }
}

export const midCallWhatsAppService = new MidCallWhatsAppService();
