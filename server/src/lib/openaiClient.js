// File: server/src/lib/openaiClient.js

if (
  status === 429 ||
  lower.includes("quota") ||
  lower.includes("insufficient") ||
  lower.includes("billing") ||
  lower.includes("rate limit")
) {
  return "This call center OpenAI key no longer has enough credit or has reached its usage limit, so Matrix AI cannot answer questions right now. To fix this, please sign in to your OpenAI account, go to Billing to add funds or update payment, then go to API Keys to create a new secret key if needed. After that, return to Matrix AI, open Settings, paste the new key, and save it. OpenAI Dashboard: https://platform.openai.com/";
}