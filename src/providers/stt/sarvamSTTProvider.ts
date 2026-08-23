import { ISTTProvider, STTResult } from '../../interfaces/stt.js';
import { env } from '../../config/env.js';

export class SarvamSTTProvider implements ISTTProvider {
  public providerName = 'sarvam';
  private apiKey: string;
  private apiEndpoint = 'https://api.sarvam.ai/speech-to-text';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.SARVAM_API_KEY || '';
  }

  async transcribeAudioChunk(audioChunk: Buffer, languageHint?: string): Promise<STTResult> {
    if (!this.apiKey) {
      // Mock fallback if API key is missing
      return {
        text: 'Hello, I am interested in building an e-commerce website.',
        isFinal: true,
        languageDetected: languageHint || 'en-IN',
        confidence: 0.95,
      };
    }

    try {
      const formData = new FormData();
      const blob = new Blob([audioChunk as unknown as BlobPart], { type: 'audio/wav' });
      formData.append('file', blob, 'audio.wav');
      formData.append('model', 'saarika:v2.5');
      if (languageHint) {
        formData.append('language_code', languageHint);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
        },
        body: formData,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Sarvam STT HTTP ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as { transcript?: string; language_code?: string };
      return {
        text: data.transcript || '',
        isFinal: true,
        languageDetected: data.language_code || languageHint || 'en-IN',
        confidence: 0.9,
      };
    } catch (error: any) {
      console.error('[SarvamSTTProvider] Transcription error:', error.message);
      return {
        text: '',
        isFinal: false,
        confidence: 0,
      };
    }
  }
}
