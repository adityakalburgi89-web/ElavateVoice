import { IWhatsAppProvider, SendMidCallWhatsAppParams, SendPostCallFollowUpParams, WhatsAppResult } from '../../interfaces/whatsapp.js';
import { env } from '../../config/env.js';

export class UltraMsgWhatsAppProvider implements IWhatsAppProvider {
  public providerName = 'ultramsg';
  private instanceId: string;
  private token: string;

  constructor() {
    this.instanceId = env.ULTRAMSG_INSTANCE_ID || 'instance189337';
    this.token = env.ULTRAMSG_TOKEN || 'sd62425yieoj0nch';
  }

  /**
   * Dispatches mid-call WhatsApp message to customer during active call.
   */
  async sendMidCallMessage(params: SendMidCallWhatsAppParams): Promise<WhatsAppResult> {
    const { recipientPhoneNumber, leadDetails, customNote } = params;
    const businessName = leadDetails.businessOrProducts || 'your business';
    const features = leadDetails.requiredFeatures && leadDetails.requiredFeatures.length > 0
      ? ` including ${leadDetails.requiredFeatures.join(', ')}`
      : ' with full online payment & delivery support';

    const portfolioUrl = env.PORTFOLIO_URL || 'https://portfolio-aditya-nine-9.vercel.app/';

    const messageText = customNote ||
      `*ElevateBox E-Commerce Development* 🚀\n\n` +
      `Namaste! We're glad to connect on the call right now.\n` +
      `We've noted your requirements for *${businessName}*${features}.\n\n` +
      `Explore our past work and live client stores here:\n` +
      `🔗 ${portfolioUrl}\n\n` +
      `Our technical team is reviewing your project requirements right now to provide the fastest launch plan.\n` +
      `Let's continue on the phone! 🚀`;

    return this.sendMessage(recipientPhoneNumber, messageText);
  }

  /**
   * Dispatches post-call comprehensive follow-up message with developer number, resume, and architecture.
   */
  async sendPostCallFollowUp(params: SendPostCallFollowUpParams): Promise<WhatsAppResult> {
    const { recipientPhoneNumber, conversationSummary, developerPhoneNumber, resumeUrl } = params;
    const portfolioUrl = resumeUrl || env.PORTFOLIO_URL || 'https://portfolio-aditya-nine-9.vercel.app/';

    let messageText =
      `*ElevateBox — Call Summary & Next Steps* 🚀\n\n` +
      `Thank you for speaking with us today.\n\n` +
      `*Summary of Discussion:*\n${conversationSummary}\n\n` +
      `----------------------------------------\n` +
      `📱 *Direct Developer Contact:* ${developerPhoneNumber}\n` +
      `🌐 *Developer Portfolio & Projects:* ${portfolioUrl}\n` +
      `----------------------------------------\n\n` +
      `Our team will follow up shortly to help bring your online store to life!`;

    return this.sendMessage(recipientPhoneNumber, messageText);
  }

  private async sendMessage(toPhoneNumber: string, messageBody: string): Promise<WhatsAppResult> {
    const cleanTo = toPhoneNumber.startsWith('+') ? toPhoneNumber : `+${toPhoneNumber}`;

    console.log(`[UltraMsgWhatsAppProvider] Sending WhatsApp to ${cleanTo}...`);

    const url = `https://api.ultramsg.com/${this.instanceId}/messages/chat`;

    const params = new URLSearchParams();
    params.append('token', this.token);
    params.append('to', cleanTo);
    params.append('body', messageBody);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const resData = (await response.json()) as any;

      if (resData.sent === 'true' || resData.sent === true) {
        console.log(`[UltraMsgWhatsAppProvider] ✅ WhatsApp dispatched successfully! Message ID: ${resData.id}`);
        return {
          success: true,
          messageId: String(resData.id || `um_${Date.now()}`),
        };
      } else {
        console.error('[UltraMsgWhatsAppProvider] Error response:', resData);
        return {
          success: false,
          error: resData.message || 'UltraMsg failed to send message',
        };
      }
    } catch (err: any) {
      console.error('[UltraMsgWhatsAppProvider] Dispatch exception:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}

export const ultraMsgWhatsAppProvider = new UltraMsgWhatsAppProvider();
