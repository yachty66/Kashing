/**
 * OpenRouter model options shown in the chat picker.
 *
 * The live list comes from /api/models, which queries OpenRouter's
 * `frontend/models/find?order=top-weekly` endpoint — the same source that
 * powers their public "Most Popular" tab. That endpoint is undocumented,
 * so we ship a static fallback (`STATIC_TOP_MODELS`) snapshotted from it.
 * If the live fetch fails the dropdown still has something reasonable.
 */
export type ModelOption = {
  slug: string;
  label: string;
};

/**
 * Snapshot of OpenRouter's top-20-weekly at the time this file was last
 * updated. Refresh by running the /api/models endpoint once and copying
 * its response, or by editing by hand. Used only as a fallback — at
 * runtime the chat fetches /api/models which returns the live list.
 */
export const STATIC_TOP_MODELS: ModelOption[] = [
  { slug: "tencent/hy3-preview", label: "Hy3 preview" },
  { slug: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { slug: "xiaomi/mimo-v2.5", label: "MiMo-V2.5" },
  { slug: "openrouter/owl-alpha", label: "Owl Alpha" },
  { slug: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { slug: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7" },
  { slug: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { slug: "xiaomi/mimo-v2.5-pro", label: "MiMo-V2.5-Pro" },
  { slug: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2" },
  { slug: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { slug: "minimax/minimax-m3", label: "MiniMax M3" },
  { slug: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8" },
  { slug: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super (free)" },
  { slug: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { slug: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { slug: "poolside/laguna-m.1", label: "Laguna M.1 (free)" },
  { slug: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
  { slug: "openai/gpt-4o-mini", label: "GPT-4o-mini" },
  { slug: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { slug: "minimax/minimax-m2.7", label: "MiniMax M2.7" },
];

/** Default model. Deliberately NOT just "top of the list" — that's whatever
 * preview/agentic thing is trending this week, which makes a bad default for
 * grounded finance Q&A. Sonnet is the all-rounder. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
