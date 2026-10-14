export function sanitizeLocalReason(message: string): string {
  return message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 1000);
}

function diagnosticRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function localFailure(cause: unknown): {
  stage: string;
  reason: string;
} {
  const seen = new Set<unknown>();
  let error = diagnosticRecord(cause);
  while (error['_tag'] === 'DecisionError' && !seen.has(error)) {
    seen.add(error);
    error = diagnosticRecord(error['cause']);
  }

  const description = diagnosticRecord(error['reason'])['description'];
  if (error['_tag'] !== 'AiError' || typeof description !== 'string') {
    return { stage: 'validation', reason: 'Local model test failed.' };
  }

  return {
    stage: error['method'] === 'load' ? 'load' : 'decide',
    reason: sanitizeLocalReason(description),
  };
}
