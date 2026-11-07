import { createNorthtrail, createDecision, verifyDecision } from '@northtrail/sdk';

const northtrail = createNorthtrail({
  baseUrl:
    process.env.NORTHTRAIL_API_URL ??
    (process.env.NODE_ENV === 'production'
      ? 'https://northtrailpp-production.up.railway.app'
      : 'https://northtrailpp-production.up.railway.app'),
});

const status = await northtrail.status();
console.log(
  JSON.stringify({ version: status.version, financialExecution: status.financialExecution }),
);

const record = await createDecision({
  schemaVersion: '1',
  decisionId: crypto.randomUUID(),
  revision: 1,
  previousDigest: null,
  displaySchemaVersion: 'review-v1',
  candidates: [{ id: 'wait', kind: 'NO_TRADE' }],
  selectedCandidateId: 'wait',
  sources: [],
  limitations: ['SDK foundation example; no quote and no financial authorization.'],
  createdAt: new Date().toISOString(),
});

console.log(
  JSON.stringify(
    {
      digest: record.digest,
      locallyValid: await verifyDecision(record),
      apiVerification: await northtrail.verifyDecision(record),
    },
    null,
    2,
  ),
);