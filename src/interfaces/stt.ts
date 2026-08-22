export interface STTResult {
  text: string;
  isFinal: boolean;
  languageDetected?: string;
  confidence?: number;
}

export interface ISTTProvider {
  providerName: string;
  transcribeAudioChunk(audioChunk: Buffer, languageHint?: string): Promise<STTResult>;
}
