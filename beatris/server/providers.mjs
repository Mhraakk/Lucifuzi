// موتورهای هوش مصنوعی — every shop may plug in its own AI keys: Anthropic (Claude) through its Messages API, and any
// provider that speaks the OpenAI chat-completions dialect (OpenAI, Google Gemini's compatible endpoint, xAI Grok,
// Alibaba Qwen/DashScope, OpenCode Zen, DeepSeek, OpenRouter, Mistral, Groq, or a custom HTTPS endpoint).
// Keys are sealed at rest per shop and never leave the server; the model name is whatever the provider's panel lists.
export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', dialect: 'anthropic', base: 'https://api.anthropic.com/v1', keyHelp: 'console.anthropic.com → API Keys' },
  openai: { label: 'OpenAI (ChatGPT)', dialect: 'openai', base: 'https://api.openai.com/v1', keyHelp: 'platform.openai.com → API keys' },
  gemini: { label: 'Google Gemini', dialect: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyHelp: 'aistudio.google.com → Get API key' },
  xai: { label: 'xAI Grok', dialect: 'openai', base: 'https://api.x.ai/v1', keyHelp: 'console.x.ai → API Keys' },
  qwen: { label: 'Alibaba Qwen (DashScope)', dialect: 'openai', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', keyHelp: 'Model Studio → API Key' },
  opencode: { label: 'OpenCode Zen', dialect: 'openai', base: 'https://opencode.ai/zen/v1', keyHelp: 'opencode.ai → Zen → API keys' },
  deepseek: { label: 'DeepSeek', dialect: 'openai', base: 'https://api.deepseek.com/v1', keyHelp: 'platform.deepseek.com → API keys' },
  openrouter: { label: 'OpenRouter (صدها مدل)', dialect: 'openai', base: 'https://openrouter.ai/api/v1', keyHelp: 'openrouter.ai → Keys' },
  mistral: { label: 'Mistral', dialect: 'openai', base: 'https://api.mistral.ai/v1', keyHelp: 'console.mistral.ai → API keys' },
  groq: { label: 'Groq', dialect: 'openai', base: 'https://api.groq.com/openai/v1', keyHelp: 'console.groq.com → API Keys' },
  custom: { label: 'سرویس دیگر (سازگار با OpenAI)', dialect: 'openai', base: '', keyHelp: 'نشانی پایه‌ای که به /chat/completions ختم می‌شود، بدون آن بخش' },
};

/** Only public HTTPS hosts: a shop cannot point the server at its own network. */
export function checkBaseUrl(raw) {
  let u;
  try {
    u = new URL(String(raw ?? '').trim());
  } catch {
    return 'نشانی سرویس نامعتبر است.';
  }
  if (u.protocol !== 'https:') return 'نشانی سرویس باید با https شروع شود.';
  if (u.username || u.password) return 'نشانی سرویس نباید نام کاربری و رمز داشته باشد.';
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local') || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return 'نشانی سرویس باید یک دامنه عمومی باشد.';
  return null;
}

export const keyHint = (k) => (k ? `••••${String(k).slice(-4)}` : '');
