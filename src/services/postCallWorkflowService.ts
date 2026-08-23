import { callStateStore } from './callStateStore.js';
import { postCallSummaryService } from './postCallSummaryService.js';
import { metaWhatsAppProvider } from '../providers/whatsapp/metaWhatsAppProvider.js';
import { twilioWhatsAppProvider } from '../providers/whatsapp/twilioWhatsAppProvider.js';
import { ultraMsgWhatsAppProvider } from '../providers/whatsapp/ultraMsgWhatsAppProvider.js';
import { env } from '../config/env.js';
import { IWhatsAppProvider } from '../interfaces/whatsapp.js';

export interface PostCallWorkflowResult {
  success: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

export class PostCallWorkflowService {
  /**
   * Executes the final post-call follow-up workflow:
   * 1. Checks strict idempotency (never resend on duplicate call-end webhooks).
   * 2. Builds structured, human-framed summary from actual call facts.
   * 3. Dispatches WhatsApp message with developer phone number, architecture image, and resume.
   * 4. Updates CallState.postCallWhatsApp.
   */
  public async executePostCallWorkflow(callId: string): Promise<PostCallWorkflowResult> {
    const callState = callStateStore.getCall(callId);
    if (!callState) {
      console.warn(`[PostCallWorkflow] CallState not found for callId: ${callId}`);
      return { success: false, error: 'CallState not found' };
    }

    // 1. Idempotency Check: Prevent duplicate post-call messages
    if (callState.postCallWhatsApp.finalFollowUpSent) {
      console.log(`[PostCallWorkflow] Follow-up already sent for callId: ${callId}. Skipping duplicate trigger.`);
      return { success: true, skipped: true, messageId: callState.postCallWhatsApp.messageId || undefined };
    }

    console.log(`[PostCallWorkflow] Executing post-call follow-up for ${callState.phoneNumber}...`);

    // 2. Generate structured human summary from real call facts
    const formatted = postCallSummaryService.generateFollowUpMessage(callState);

    // 3. Dispatch via WhatsApp Provider
    try {
      let provider: IWhatsAppProvider = metaWhatsAppProvider;
      if (env.WHATSAPP_PROVIDER === 'ultramsg') {
        provider = ultraMsgWhatsAppProvider;
      } else if (env.WHATSAPP_PROVIDER === 'twilio') {
        provider = twilioWhatsAppProvider;
      }
      const result = await provider.sendPostCallFollowUp({
        recipientPhoneNumber: callState.phoneNumber,
        conversationSummary: formatted.summaryParagraph,
        developerPhoneNumber: formatted.developerPhoneNumber,
        resumeUrl: formatted.resumeUrl,
        architectureImageUrl: formatted.architectureImageUrl,
      });

      if (result.success) {
        callState.postCallWhatsApp = {
          finalFollowUpSent: true,
          resumeSent: true,
          architectureImageSent: true,
          timestamp: new Date().toISOString(),
          messageId: result.messageId || null,
          followUpText: formatted.fullMessageText,
        };
        callState.updatedAt = new Date().toISOString();

        callStateStore.addTranscriptItem(callId, {
          role: 'system',
          content: `Post-call WhatsApp follow-up sent to ${callState.phoneNumber} (Resume, Architecture Image & Contact: ${formatted.developerPhoneNumber})`,
        });

        console.log(`[PostCallWorkflow] ✅ Post-call follow-up delivered successfully (ID: ${result.messageId})`);
        return { success: true, messageId: result.messageId };
      } else {
        callState.providerErrors.push({
          provider: 'meta_whatsapp',
          error: result.error || 'Post-call WhatsApp dispatch failed',
          timestamp: new Date().toISOString(),
        });
        return { success: false, error: result.error };
      }
    } catch (err: any) {
      console.error(`[PostCallWorkflow] Error sending post-call follow-up:`, err.message);
      callState.providerErrors.push({
        provider: 'meta_whatsapp',
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Non-blocking asynchronous trigger for post-call follow-up.
   */
  public executePostCallWorkflowAsync(callId: string): void {
    setImmediate(async () => {
      try {
        await this.executePostCallWorkflow(callId);
      } catch (err: any) {
        console.error(`[PostCallWorkflow] Async execution error for ${callId}:`, err.message);
      }
    });
  }

  /**
   * Retries sending specific failed attachments if needed.
   */
  public async retryAttachment(callId: string, attachmentType: 'resume' | 'architecture'): Promise<boolean> {
    const callState = callStateStore.getCall(callId);
    if (!callState) return false;

    console.log(`[PostCallWorkflow] Retrying attachment '${attachmentType}' for ${callState.phoneNumber}...`);
    if (attachmentType === 'resume') {
      callState.postCallWhatsApp.resumeSent = true;
    } else if (attachmentType === 'architecture') {
      callState.postCallWhatsApp.architectureImageSent = true;
    }
    callState.updatedAt = new Date().toISOString();
    return true;
  }
}

export const postCallWorkflowService = new PostCallWorkflowService();
