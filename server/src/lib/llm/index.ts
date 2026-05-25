import { env } from "../env";
import { AnthropicAdapter } from "./adapters/anthropic";
import { BaseLLMAdapter } from "./base";

export type { BaseLLMAdapter };

let _adapter: BaseLLMAdapter | null = null;

export function getLLMClient(): BaseLLMAdapter {
  if (_adapter) return _adapter;
  _adapter = new AnthropicAdapter(env.ANTHROPIC_API_KEY, env.LLM_MODEL);
  return _adapter;
}
