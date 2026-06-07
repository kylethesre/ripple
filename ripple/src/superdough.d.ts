declare module 'superdough' {
  export function superdough(value: Record<string, unknown>, t: number, hapDuration: number, cps?: number, cycle?: number): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext): void;
  export function initAudio(options?: Record<string, unknown>): Promise<void>;
  export function registerSound(key: string, onTrigger: (...args: unknown[]) => void, data?: Record<string, unknown>): void;
  export function getSound(s: string): unknown;
  export function setDefault(control: string, value: unknown): void;
  export function resetDefaults(): void;
  export function registerSynthSounds(): void;
  export function samples(sampleMap: string | Record<string, unknown>, baseUrl?: string, options?: Record<string, unknown>): Promise<void>;
  export function tables(sampleMap: string | Record<string, unknown>, baseUrl?: string, options?: Record<string, unknown>): Promise<void>;
  export function resetGlobalEffects(): void;
  export function setSuperdoughAudioController(controller: unknown): void;
}
