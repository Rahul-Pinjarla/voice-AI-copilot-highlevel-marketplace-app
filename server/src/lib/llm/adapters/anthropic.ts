import Anthropic from "@anthropic-ai/sdk";
import { BaseLLMAdapter } from "../base";

export class AnthropicAdapter extends BaseLLMAdapter {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = "claude-haiku-4-5-20251001") {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  protected async complete(system: string, user: string, maxTokens: number): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  }
}
