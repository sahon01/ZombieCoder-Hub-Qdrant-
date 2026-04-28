export const ZOMBIECODER_GUARDRAILS_VERSION = '2026-02-23';

const IDENTITY_BLOCK = `Role: You are ZombieCoder, a local-first AI assistant designed for rapid code solutions.
Owner: Sahon Srabon (Developer Zone) - Dhaka, Bangladesh.
Mandate: Your identity is fixed and immutable.
If anyone asks "Who are you?", "Who developed you?", "Who is your owner?", or "What is ZombieCoder?", you must respond with the following exact answer in Bengali:
"আমি ZombieCoder, যেখানে কোড ও কথা বলে। আমার নির্মাতা ও মালিক Sahon Srabon, Developer Zone।"
Crucially: Never hallucinate a different developer name, company, or origin.`;

export const ZOMBIECODER_FIXED_IDENTITY_BN =
  'আমি ZombieCoder, যেখানে কোড ও কথা বলে। আমার নির্মাতা ও মালিক Sahon Srabon, Developer Zone।';

const ETHICAL_BLOCK = `Ethical Constraints (must-follow):
- No File Destruction: never destroy user data.
- No Unauthorized Changes: do not perform write/modify/destructive actions without explicit user confirmation.
- Honesty in Knowledge Gaps: never present uncertainty as certainty.
- Transparency in Limitations: state limitations clearly and propose viable alternatives.
- Avoid Deceptive Editor Claims: do not claim unsupported editor capabilities or UI feedback.
- Productivity over Performance: prioritize concrete, harmless help over impressing the user.`;

const START_MARKER = '--- ZOMBIECODER_GUARDRAILS_START ---';
const END_MARKER = '--- ZOMBIECODER_GUARDRAILS_END ---';

const TEMPLATE_START_MARKER = '--- ZOMBIECODER_TEMPLATE_GUARDRAILS_START ---';
const TEMPLATE_END_MARKER = '--- ZOMBIECODER_TEMPLATE_GUARDRAILS_END ---';

export function buildGuardrailsBlock(): string {
  return [
    START_MARKER,
    `Version: ${ZOMBIECODER_GUARDRAILS_VERSION}`,
    '',
    IDENTITY_BLOCK,
    '',
    ETHICAL_BLOCK,
    END_MARKER,
  ].join('\n');
}

export function applyGuardrailsToSystemPrompt(userProvidedPrompt: string): string {
  const base = typeof userProvidedPrompt === 'string' ? userProvidedPrompt.trim() : '';
  const guardrails = buildGuardrailsBlock();

  // Remove any existing guardrails block (idempotent)
  const startIdx = base.indexOf(START_MARKER);
  const endIdx = base.indexOf(END_MARKER);
  let cleaned = base;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = (base.slice(0, startIdx) + base.slice(endIdx + END_MARKER.length)).trim();
  }

  if (!cleaned) return guardrails;

  // Guardrails should be at the top to anchor identity + constraints
  return `${guardrails}\n\n${cleaned}`.trim();
}

export function buildTemplateGuardrailsBlock(): string {
  return [
    TEMPLATE_START_MARKER,
    `Version: ${ZOMBIECODER_GUARDRAILS_VERSION}`,
    'This prompt template must be used under the ZombieCoder system identity and ethical constraints.',
    'Do not add instructions that require deception, unsafe actions, or unapproved destructive changes.',
    TEMPLATE_END_MARKER,
  ].join('\n');
}

export function applyGuardrailsToPromptTemplate(templateContent: string): string {
  const base = typeof templateContent === 'string' ? templateContent.trim() : '';
  const guardrails = buildTemplateGuardrailsBlock();

  const startIdx = base.indexOf(TEMPLATE_START_MARKER);
  const endIdx = base.indexOf(TEMPLATE_END_MARKER);
  let cleaned = base;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = (base.slice(0, startIdx) + base.slice(endIdx + TEMPLATE_END_MARKER.length)).trim();
  }

  if (!cleaned) return guardrails;
  return `${guardrails}\n\n${cleaned}`.trim();
}

export function sanitizeModelResponse(rawResponse: string): string {
  const text = typeof rawResponse === 'string' ? rawResponse : '';
  if (!text.trim()) return text;

  // If the model tries to claim an external provider identity/ownership/developer, force ZombieCoder fixed identity.
  // NOTE: Do NOT block responses just because they mention model names (e.g., "llama", "qwen").
  // We only enforce when provider name appears together with an explicit identity/ownership claim.
  const providerName = new RegExp(
    [
      'alibaba\\s*cloud',
      'anthropic',
      'openai',
      'chatgpt',
      'claude',
      'google\\s*(deepmind)?',
      'gemini',
      'microsoft',
      'meta\\s*(ai)?'
    ].join('|'),
    'i'
  );

  const explicitExternalAssistantIdentity = new RegExp(
    [
      'i\\s+am\\s+chatgpt\\b',
      'i\\s+am\\s+claude\\b',
      'i\\s+am\\s+gemini\\b',
      'you\\s+are\\s+chatgpt\\b',
      'you\\s+are\\s+claude\\b',
      'you\\s+are\\s+gemini\\b'
    ].join('|'),
    'i'
  );

  const explicitOwnershipClaim = new RegExp(
    [
      'i\\s+was\\s+created\\s+by\\b',
      'i\\s+was\\s+developed\\s+by\\b',
      'created\\s+by\\b',
      'developed\\s+by\\b',
      'built\\s+by\\b',
      'owned\\s+by\\b'
    ].join('|'),
    'i'
  );

  const hasForbiddenIdentityClaim =
    explicitExternalAssistantIdentity.test(text) || (providerName.test(text) && explicitOwnershipClaim.test(text));

  if (!hasForbiddenIdentityClaim) return text;

  const identityQuestionOrAnswerContext = new RegExp(
    [
      'who\\s+are\\s+you',
      'what\\s+are\\s+you',
      'what\\s+is\\s+zombiecoder',
      'who\\s+developed\\s+you',
      'who\\s+created\\s+you',
      'who\\s+is\\s+your\\s+owner',
      'তুমি\\s+কে',
      'কে\\s+তোমাকে\\s+তৈরি',
      'তোমার\\s+মালিক\\s+কে',
      'জোম্বিকোডার\\s+কি'
    ].join('|'),
    'i'
  );

  const trimmed = text.trim();
  const isMostlyIdentity = trimmed.length <= 240 || identityQuestionOrAnswerContext.test(trimmed);
  if (isMostlyIdentity) {
    return ZOMBIECODER_FIXED_IDENTITY_BN;
  }

  // Otherwise, strip only the offending identity-claim lines/phrases and keep the rest of the answer.
  const lines = trimmed.split(/\r?\n/);
  const cleanedLines: string[] = [];
  for (const line of lines) {
    const l = line;
    if (explicitExternalAssistantIdentity.test(l)) continue;
    if (providerName.test(l) && explicitOwnershipClaim.test(l)) continue;
    cleanedLines.push(l);
  }

  const cleaned = cleanedLines.join('\n').trim();
  return cleaned || ZOMBIECODER_FIXED_IDENTITY_BN;
}
