// File: server/src/lib/openaiClient.js
import OpenAI from "openai";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildEvidence(matches) {
  return (matches?.hits || [])
    .map(
      (hit) =>
        `- Tab: "${clean(hit.tabName)}" | Cell: R${hit.row}C${hit.col}${
          hit.label ? ` (${clean(hit.label)})` : ""
        }\n  Exact: "${clean(hit.exact)}"`
    )
    .join("\n");
}

const SYSTEM_PROMPT = `You are Blue Matrix AI, a strict HotelPlanner compliance assistant.

Use only the provided SERVICE MATRIX EVIDENCE.
Do not invent policy.
Do not use external knowledge.
Do not mention missing documentation unless the evidence truly does not cover the question at all.

Important behavior:
- If the evidence contains a closest matching covered scenario, answer with that procedure directly.
- Do NOT ask clarifying questions when the evidence already includes a usable procedure.
- Do NOT write "NOT FOUND IN DOCS" inside sections when there is matching evidence.
- Only output exactly "NOT FOUND IN DOCS" when there is truly no usable procedure in the evidence.
- Prefer direct, actionable steps from the matched rows over follow-up questions.
- If multiple evidence rows are relevant, combine them carefully without contradiction.
- Keep the answer concise and operational.

Required format when evidence is usable:
1. Short acknowledgement.
2. Covered Scenario.
3. Decision Gates table for Slack, Refund Queue, Create a Ticket, Supervisor.
4. Steps.
5. Agent Script.
6. Citations.
7. Quality Check.

For Decision Gates:
- If a gate is not explicitly stated in the evidence, write "Not specified in cited matrix rows."
- Never write "NOT FOUND IN DOCS" in the Decision Gates table unless the entire answer is the exact fallback.

For Quality Check:
- Used only provided matrix evidence: Yes
- Policy invented: No`;

function getFriendlyOpenAiError(error) {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || "Unexpected OpenAI error.");
  const lower = message.toLowerCase();

  if (
    status === 401 ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key")
  ) {
    return "The OpenAI key saved for this call center looks invalid. Please open Settings and replace it with a valid key.";
  }

  if (
    status === 429 ||
    lower.includes("quota") ||
    lower.includes("insufficient") ||
    lower.includes("billing") ||
    lower.includes("rate limit")
  ) {
    return "This call center OpenAI key has no active balance, hit its quota, or reached a rate limit. Please add credit, check billing, or save a different key in Settings.";
  }

  if (status === 403) {
    return "This call center OpenAI project does not have access to the selected model. Save another model or use a project with the right permissions.";
  }

  return `OpenAI error: ${message}`;
}

export async function askOpenAiWithCenterKey({
  apiKey,
  model,
  userMessage,
  matches
}) {
  const client = new OpenAI({ apiKey });
  const evidence = buildEvidence(matches);

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `SERVICE MATRIX EVIDENCE:\n${evidence}\n\n` +
              `USER QUESTION:\n${clean(userMessage)}\n\n` +
              `Instruction:\n` +
              `If the evidence includes a closest covered scenario, answer from that scenario directly and do not ask clarifying questions.`
          }
        ]
      }
    ],
    temperature: 0.1,
    max_output_tokens: 1200
  });

  return response.output_text || "No answer returned.";
}

export async function safeAskOpenAiWithCenterKey(args) {
  try {
    return { ok: true, answer: await askOpenAiWithCenterKey(args) };
  } catch (error) {
    return { ok: false, error: getFriendlyOpenAiError(error) };
  }
}