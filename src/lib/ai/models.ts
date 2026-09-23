/**
 * Groq model configuration.
 *
 * Model IDs verified against https://console.groq.com/docs/models on 2026-09-23:
 * - openai/gpt-oss-120b: flagship open-weight production model, 131,072-token
 *   context window, 65,536 max completion tokens, ~500 t/s.
 * - openai/gpt-oss-20b: faster/cheaper sibling, same 131k context, ~1000 t/s.
 * (Llama 3.x models are now enterprise/contact-sales gated on Groq.)
 */
export const GROQ_MODELS = {
  /** Conversational interviewer + structured summary extraction. */
  primary: "openai/gpt-oss-120b",
  /** High-volume, lower-stakes calls (prospect relevance scoring). */
  fast: "openai/gpt-oss-20b",
} as const;

export type GroqModel = (typeof GROQ_MODELS)[keyof typeof GROQ_MODELS];
