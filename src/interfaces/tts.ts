export interface TTSResult {
  audioBuffer: Buffer;
  mimeType: string;
}

export interface ITTSProvider {
  providerName: string;
  synthesizeSpeech(text: string, language?: string): Promise<TTSResult>;
}
