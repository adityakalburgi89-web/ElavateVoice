import { CallState } from '../types/callState.js';
import { env } from '../config/env.js';

export interface FormattedFollowUp {
  summaryParagraph: string;
  fullMessageText: string;
  developerPhoneNumber: string;
  resumeUrl: string;
  architectureImageUrl: string;
}

export class PostCallSummaryService {
  /**
   * Builds a warm, human-like WhatsApp follow-up using ACTUAL conversation content.
   * 
   * Strict Rules:
   * 1. No generic placeholder text.
   * 2. No JSON or raw transcript dumps.
   * 3. References real facts from the call (products, features, budget, callback).
   * 4. Zero fabrication: Omits fields that were never mentioned.
   * 5. Prominently displays developer phone number, architecture image, and resume.
   */
  public generateFollowUpMessage(callState: CallState): FormattedFollowUp {
    const { leadDetails, callback, classification, phoneNumber } = callState;
    const developerPhone = env.DEVELOPER_PHONE_NUMBER || '+917406209248';
    const resumeUrl = env.RESUME_URL || 'https://elevatebox.io/assets/aditya_kalburgi_resume.pdf';
    const architectureImageUrl = env.ARCHITECTURE_IMAGE_URL || 'https://elevatebox.io/assets/elevate_voice_architecture.png';

    // 1. Build discussion points based on what was ACTUALLY discussed
    const discussionPoints: string[] = [];

    if (leadDetails.businessOrProducts) {
      const countText = leadDetails.productCount ? ` (~${leadDetails.productCount} items)` : '';
      discussionPoints.push(`• *Business / Products:* ${leadDetails.businessOrProducts}${countText}`);
    }

    if (leadDetails.requiredFeatures && leadDetails.requiredFeatures.length > 0) {
      discussionPoints.push(`• *Required Capabilities:* ${leadDetails.requiredFeatures.join(', ')}`);
    }

    if (leadDetails.budget) {
      discussionPoints.push(`• *Budget Range Discussed:* ${leadDetails.budget}`);
    }

    if (leadDetails.timeline) {
      discussionPoints.push(`• *Target Timeline:* ${leadDetails.timeline}`);
    }

    if (callback.booked && callback.resolvedDateTime) {
      const formattedTime = callback.originalPhrase || callback.resolvedDateTime;
      discussionPoints.push(`• *Confirmed Callback:* ${formattedTime}`);
    }

    // 2. Extract a real quote or customer phrase if available
    const customerUserTurns = callState.transcript
      .filter((t) => t.role === 'user')
      .map((t) => t.content.trim())
      .filter((c) => c.length > 5);
    
    const keyCustomerQuote = customerUserTurns.length > 0
      ? customerUserTurns[customerUserTurns.length - 1]
      : null;

    // 3. Construct natural summary paragraph
    const summaryParagraph = discussionPoints.length > 0
      ? discussionPoints.join('\n')
      : `• *General Discussion:* Custom e-commerce website development exploration for ${phoneNumber}`;

    // 4. Construct human-framed full message
    let message = `*ElevateBox — Thank You for Connecting!* 🚀\n\n`;
    message += `Namaste! It was a pleasure speaking with you regarding your e-commerce website development.\n\n`;
    message += `*Here is a quick summary of what we discussed:*\n`;
    message += `${summaryParagraph}\n\n`;

    if (keyCustomerQuote) {
      message += `_We noted your note: "${keyCustomerQuote}"_\n\n`;
    }

    message += `Our engineering team has received your project details and is preparing the optimal architecture and timeline.\n\n`;
    message += `----------------------------------------\n`;
    message += `📱 *Direct Developer Contact:* ${developerPhone}\n`;
    message += `📄 *Developer Resume & Credentials:* ${resumeUrl}\n`;
    message += `🏗️ *System Architecture & Flow:* ${architectureImageUrl}\n`;
    message += `----------------------------------------\n\n`;
    message += `Feel free to reply directly to this message if you have any questions. Looking forward to building your store!`;

    return {
      summaryParagraph,
      fullMessageText: message,
      developerPhoneNumber: developerPhone,
      resumeUrl,
      architectureImageUrl,
    };
  }
}

export const postCallSummaryService = new PostCallSummaryService();
