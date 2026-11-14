import { config } from './config.js';

const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function claudeCost(model, usage = {}) {
  const p = PRICES[model] || PRICES[config.ai.designModel] || PRICES['claude-opus-5-5'];
  return (
    ((usage.input_tokens || 0) * p.input +
      (usage.output_tokens || 0) * p.output +
      (usage.cache_read_input_tokens || 0) * p.cacheRead +
      (usage.cache_creation_input_tokens || 0) * p.cacheWrite) /
    1e6
  );
}

export function outputCost(model, tokens) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  return (tokens * p.output) / 1e6;
}

export function createMeter() {
  const meter = {
    claude: 0,
    images: 0,
    calls: [],
    claudeLimit: config.budget.claudeUsd,
    imageLimit: config.budget.imageUsd,
    addClaude(step, model, usage) {
      const cost = claudeCost(model, usage);
      meter.claude += cost;
      meter.calls.push({ step, model, cost: Number(cost.toFixed(4)), in: usage?.input_tokens || 0, out: usage?.output_tokens || 0 });
      return cost;
    },
    reserveImage() {
      if (meter.imageLeft() < config.budget.imageCostUsd - 1e-9) return false;
      meter.images += config.budget.imageCostUsd;
      return true;
    },
    releaseImage() {
      meter.images -= config.budget.imageCostUsd;
    },
    addImage(step) {
      meter.calls.push({ step, cost: config.budget.imageCostUsd });
    },
    claudeLeft: () => meter.claudeLimit - meter.claude,
    imageLeft: () => meter.imageLimit - meter.images,
    summary: () => ({ claudeUsd: Number(meter.claude.toFixed(3)), imageUsd: Number(meter.images.toFixed(3)), calls: meter.calls }),
  };
  return meter;
}
