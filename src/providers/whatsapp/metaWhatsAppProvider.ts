import { IWhatsAppProvider, SendMidCallWhatsAppParams, SendPostCallFollowUpParams, WhatsAppResult } from '../../interfaces/whatsapp.js';
import { env } from '../../config/env.js';

export class MetaWhatsAppProvider implements IWhatsAppProvider {
  public providerName = 'meta_whatsapp';
  private phoneNumberId: string;
  private accessToken: string;

  constructor(phoneNumberId?: string, accessToken?: string) {
    this.phoneNumberId = phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = accessToken || env.WHATSAPP_ACCESS_TOKEN || '';
  }

  /**
   * Sends a short, highly contextual WhatsApp message during an active phone call to a HOT lead.
   * References specific details already discussed (business, products, features).
   */
  async sendMidCallMessage(params: SendMidCallWhatsAppParams): Promise<WhatsAppResult> {
    const { recipientPhoneNumber, leadDetails, customNote } = params;

    // Clean phone number (e.g. "+917406209248" -> "917406209248")
    const to = recipientPhoneNumber.replace(/\+/g, '').trim();

    // Construct tailored, contextual message
    const business = leadDetails.businessOrProducts || 'your business';
    const features = leadDetails.requiredFeatures && leadDetails.requiredFeatures.length > 0
      ? `including ${leadDetails.requiredFeatures.join(', ')}`
      : 'with full online payment & delivery support';

    const portfolioUrl = env.PORTFOLIO_URL || 'https://portfolio-aditya-nine-9.vercel.app/';

    const messageText = customNote || 
      `*ElevateBox E-Commerce Development*\n\n` +
      `Namaste! We're glad to connect on the call right now.\n` +
      `We've noted your requirements for *${business}* ${features}.\n\n` +
      `Explore our past work and live client stores here:\n` +
      `🔗 ${portfolioUrl}\n\n` +
      `Our technical team is reviewing your project requirements right now to provide the fastest launch plan.\n` +
      `Let's continue on the phone! 🚀`;

    const isDummyOrMissing =
      !this.phoneNumberId ||
      !this.accessToken ||
      this.phoneNumberId === 'dummy_id' ||
      this.accessToken === 'dummy_token';

    if (isDummyOrMissing) {
      console.log(`[MetaWhatsAppProvider] [SANDBOX MOCK] WhatsApp to ${to}:`);
      console.log(`--------------------------------------------------`);
      console.log(messageText);
      console.log(`--------------------------------------------------`);
      return {
        success: true,
        messageId: `wamid.mock_midcall_${Date.now()}`,
      };
    }

    return this.sendTextMessageWithRetry(to, messageText);
  }

  /**
   * Sends post-call comprehensive follow-up (Phase 8).
   * Includes contextual facts, developer number, resume URL, and architecture image.
   */
  async sendPostCallFollowUp(params: SendPostCallFollowUpParams): Promise<WhatsAppResult> {
    const { recipientPhoneNumber, conversationSummary, developerPhoneNumber, resumeUrl, architectureImageUrl } = params;
    const to = recipientPhoneNumber.replace(/\+/g, '').trim();
    const portfolioUrl = resumeUrl || env.PORTFOLIO_URL || 'https://portfolio-aditya-nine-9.vercel.app/';

    let messageText = 
      `*ElevateBox — Call Summary & Next Steps* 🚀\n\n` +
      `Thank you for speaking with us today.\n\n` +
      `*Summary of Discussion:*\n${conversationSummary}\n\n` +
      `----------------------------------------\n` +
      `📱 *Direct Developer Contact:* ${developerPhoneNumber}\n` +
      `🌐 *Developer Portfolio & Projects:* ${portfolioUrl}\n`;

    if (architectureImageUrl && architectureImageUrl !== portfolioUrl) {
      messageText += `🏗️ *System Architecture:* ${architectureImageUrl}\n`;
    }
    
    messageText += `----------------------------------------\n\n` +
      `Our team will follow up shortly to help bring your online store to life!`;

    const isDummyOrMissing =
      !this.phoneNumberId ||
      !this.accessToken ||
      this.phoneNumberId === 'dummy_id' ||
      this.accessToken === 'dummy_token';

    if (isDummyOrMissing) {
      console.log(`[MetaWhatsAppProvider] [SANDBOX MOCK] Post-call follow-up to ${to}:`);
      console.log(`--------------------------------------------------\n${messageText}\n--------------------------------------------------`);
      return {
        success: true,
        messageId: `wamid.mock_postcall_${Date.now()}`,
      };
    }

    return this.sendTextMessageWithRetry(to, messageText);
  }

  /**
   * Dispatches text message to Meta WhatsApp Cloud API with timeout and exponential retry.
   */
  private async sendTextMessageWithRetry(to: string, bodyText: string, retryCount = 1): Promise<WhatsAppResult> {
    const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: true, body: bodyText },
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Meta WhatsApp HTTP ${response.status}: ${errBody}`);
        }

        const data = (await response.json()) as any;
        const messageId = data.messages?.[0]?.id || `wamid.${Date.now()}`;

        return {
          success: true,
          messageId,
        };
      } catch (err: any) {
        console.warn(`[MetaWhatsAppProvider] Attempt ${attempt + 1} failed:`, err.message);
        if (attempt < retryCount) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          return {
            success: false,
            error: err.message,
          };
        }
      }
    }

    return { success: false, error: 'Maximum retries exhausted' };
  }
}

export const metaWhatsAppProvider = new MetaWhatsAppProvider();
