declare module '@strudel/web' {
  export function repl(options?: Record<string, unknown>): Promise<{
    evaluate(code: string): Promise<void>;
    stop(): void;
    setTempo(value: number): void;
  }>;
}
