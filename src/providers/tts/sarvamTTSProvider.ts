import { ITTSProvider, TTSResult } from '../../interfaces/tts.js';
import { env } from '../../config/env.js';

export class SarvamTTSProvider implements ITTSProvider {
  public providerName = 'sarvam';
  private apiKey: string;
  private apiEndpoint = 'https://api.sarvam.ai/text-to-speech';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.SARVAM_API_KEY || '';
  }

  async synthesizeSpeech(text: string, language: string = 'te-IN'): Promise<TTSResult> {
    if (!this.apiKey) {
      // Mock audio buffer fallback if key missing
      return {
        audioBuffer: Buffer.from('mock_audio_data'),
        mimeType: 'audio/wav',
      };
    }

    // Map common language codes to Sarvam target_language_code
    let langCode = 'te-IN';
    if (language.startsWith('hi')) langCode = 'hi-IN';
    else if (language.startsWith('en')) langCode = 'en-IN';
    else if (language.startsWith('te')) langCode = 'te-IN';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [text],
          target_language_code: langCode,
          speaker: 'anushka',
          model: 'bulbul:v2',
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam TTS HTTP ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as { audios?: string[] };
      const base64Audio = data.audios && data.audios[0] ? data.audios[0] : '';
      const audioBuffer = Buffer.from(base64Audio, 'base64');

      return {
        audioBuffer,
        mimeType: 'audio/wav',
      };
    } catch (error: any) {
      console.error('[SarvamTTSProvider] Synthesis error:', error.message);
      return {
        audioBuffer: Buffer.alloc(0),
        mimeType: 'audio/wav',
      };
    }
  }
}
