declare module "twemoji" {
  const twemoji: {
    parse: (text: string, options?: Record<string, unknown>) => string;
    convert: { toCodePoint: (emoji: string) => string };
  };
  export default twemoji;
}
