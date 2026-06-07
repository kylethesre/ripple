import { arrayBufferToBase64Chunks } from './audioAssetCache';

export type AudioUploadMetadata = {
  mimeType: string;
  byteSize: bigint;
  durationMicros: bigint;
  sampleRate: number;
  channels: number;
  waveformJson: string;
  buffer: ArrayBuffer;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export async function analyzeAudioFile(file: File): Promise<AudioUploadMetadata> {
  const buffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    const samples = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(samples.length / 96));
    const waveform = [] as number[];

    for (let index = 0; index < samples.length; index += bucketSize) {
      let peak = 0;
      const end = Math.min(samples.length, index + bucketSize);
      for (let i = index; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
      waveform.push(Number(clamp01(peak).toFixed(4)));
    }

    return {
      mimeType: file.type || 'audio/wav',
      byteSize: BigInt(buffer.byteLength),
      durationMicros: BigInt(Math.round(audioBuffer.duration * 1_000_000)),
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      waveformJson: JSON.stringify({ peaks: waveform }),
      buffer,
    };
  } finally {
    await audioContext.close();
  }
}

export function chunkAudioBuffer(buffer: ArrayBuffer) {
  return arrayBufferToBase64Chunks(buffer, 96 * 1024).map((dataBase64, chunkIndex) => ({
    chunkIndex,
    dataBase64,
    byteSize: Math.min(96 * 1024, buffer.byteLength - chunkIndex * 96 * 1024),
  }));
}

export function makeClientUploadKey(roomId: bigint) {
  return `room-${roomId.toString()}-${crypto.randomUUID()}`;
}
