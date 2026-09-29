import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: config.ai.apiKey,
      maxRetries: 2,
      fetch: (...args) => globalThis.fetch(...args),
    });
  }
  return client;
}

export function claudeEnabled() {
  return Boolean(config.ai.apiKey);
}

const isHaiku = (model) => /haiku/.test(model);
const supportsFallbacks = (model) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

export async function callClaudeRaw({ model, system, user, maxTokens = 4000, effort = 'high', timeoutMs = 60000 }) {
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (!isHaiku(model)) {
    params.thinking = { type: 'adaptive' };
    params.output_config = { effort };
  }
  const options = { timeout: timeoutMs };
  let message;
  if (supportsFallbacks(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
    message = await getClient().beta.messages.stream(params, options).finalMessage();
  } else {
    message = await getClient().messages.stream(params, options).finalMessage();
  }
  if (message.stop_reason === 'refusal') throw new Error('Claude declined this request');
  const text = message.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) throw new Error(`Claude returned no text (${message.stop_reason})`);
  if (message.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens');
  return { text, model: message.model, usage: message.usage };
}

export async function callClaude(options) {
  return (await callClaudeRaw(options)).text;
}
