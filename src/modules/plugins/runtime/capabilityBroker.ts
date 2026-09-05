import type {
  RuntimePluginGlucoseSummary,
  RuntimePluginHostPort,
  RuntimePluginHostRequest,
  RuntimePluginHostResponse,
  RuntimePluginSession,
} from '../domain/types';
import {RuntimePluginManager} from './runtimePluginManager';

const MAX_SUMMARY_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const DESTINATION_ID_PATTERN =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export type RuntimePluginCapabilityFailureCode =
  | 'invalid-request'
  | 'permission-denied'
  | 'invalid-host-response';

export class RuntimePluginCapabilityError extends Error {
  constructor(
    readonly code: RuntimePluginCapabilityFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuntimePluginCapabilityError';
  }
}

const invalid = (message: string): never => {
  throw new RuntimePluginCapabilityError('invalid-request', message);
};

const validateRequest = (request: RuntimePluginHostRequest): void => {
  if (
    typeof request !== 'object' ||
    request === null ||
    Array.isArray(request)
  ) {
    invalid('The capability request must be an object.');
  }
  if (request.capability === 'destination.open') {
    if (
      Object.keys(request).some(
        key => !['capability', 'destinationId'].includes(key),
      ) ||
      typeof request.destinationId !== 'string' ||
      request.destinationId.length > 120 ||
      !DESTINATION_ID_PATTERN.test(request.destinationId)
    ) {
      invalid('The destination ID is invalid.');
    }
    return;
  }
  if (
    Object.keys(request).some(
      key => !['capability', 'startMs', 'endMs'].includes(key),
    ) ||
    !Number.isSafeInteger(request.startMs) ||
    !Number.isSafeInteger(request.endMs) ||
    request.startMs < 0 ||
    request.endMs <= request.startMs ||
    request.endMs - request.startMs > MAX_SUMMARY_RANGE_MS
  ) {
    invalid('Glucose summaries are limited to a valid 31-day range.');
  }
};

const validOptionalMetric = (
  value: number | undefined,
  minimum: number,
  maximum: number,
): boolean =>
  value === undefined ||
  (Number.isFinite(value) && value >= minimum && value <= maximum);

const sanitizeSummary = (
  untrustedResponse: unknown,
  request: Extract<
    RuntimePluginHostRequest,
    {capability: 'glucose.summary.read'}
  >,
): RuntimePluginGlucoseSummary => {
  if (
    typeof untrustedResponse !== 'object' ||
    untrustedResponse === null ||
    Array.isArray(untrustedResponse)
  ) {
    throw new RuntimePluginCapabilityError(
      'invalid-host-response',
      'The host returned an invalid glucose summary.',
    );
  }
  const response = untrustedResponse as Record<string, unknown>;
  const allowedKeys = [
    'unit',
    'startMs',
    'endMs',
    'sampleCount',
    'meanMgDl',
    'timeInRangePercent',
  ];
  if (
    Object.keys(response).some(key => !allowedKeys.includes(key)) ||
    response.unit !== 'mg/dL' ||
    response.startMs !== request.startMs ||
    response.endMs !== request.endMs ||
    typeof response.sampleCount !== 'number' ||
    !Number.isSafeInteger(response.sampleCount) ||
    response.sampleCount < 0 ||
    response.sampleCount > 100_000 ||
    !validOptionalMetric(response.meanMgDl as number | undefined, 20, 600) ||
    !validOptionalMetric(
      response.timeInRangePercent as number | undefined,
      0,
      100,
    )
  ) {
    throw new RuntimePluginCapabilityError(
      'invalid-host-response',
      'The host returned an invalid glucose summary.',
    );
  }
  return {
    unit: 'mg/dL',
    startMs: request.startMs,
    endMs: request.endMs,
    sampleCount: response.sampleCount as number,
    ...(response.meanMgDl === undefined
      ? {}
      : {meanMgDl: response.meanMgDl as number}),
    ...(response.timeInRangePercent === undefined
      ? {}
      : {timeInRangePercent: response.timeInRangePercent as number}),
  };
};

const sanitizeDestinationResult = (
  untrustedResponse: unknown,
): Readonly<{opened: boolean}> => {
  if (
    typeof untrustedResponse !== 'object' ||
    untrustedResponse === null ||
    Array.isArray(untrustedResponse) ||
    Object.keys(untrustedResponse).some(key => key !== 'opened') ||
    typeof (untrustedResponse as Readonly<{opened?: unknown}>).opened !==
      'boolean'
  ) {
    throw new RuntimePluginCapabilityError(
      'invalid-host-response',
      'The host returned an invalid destination result.',
    );
  }
  return {opened: (untrustedResponse as Readonly<{opened: boolean}>).opened};
};

/** Permission-checking seam between reviewed plugin code and host-owned data. */
export class RuntimePluginCapabilityBroker {
  constructor(
    private readonly manager: RuntimePluginManager,
    private readonly host: RuntimePluginHostPort,
  ) {}

  async request<Request extends RuntimePluginHostRequest>(
    session: RuntimePluginSession,
    request: Request,
  ): Promise<RuntimePluginHostResponse<Request>> {
    validateRequest(request);
    const allowed = await this.manager.authorizeCapability(
      session.scope,
      session.manifest,
      request.capability,
    );
    if (!allowed) {
      throw new RuntimePluginCapabilityError(
        'permission-denied',
        'This plugin capability is not currently granted.',
      );
    }
    try {
      const untrustedResponse: unknown = await this.host.execute(request);
      let auditDetail: string;
      let response: RuntimePluginHostResponse<Request>;
      if (request.capability === 'glucose.summary.read') {
        const summary = sanitizeSummary(
          untrustedResponse,
          request as Extract<
            RuntimePluginHostRequest,
            {capability: 'glucose.summary.read'}
          >,
        );
        response = summary as RuntimePluginHostResponse<Request>;
        auditDetail = `rangeMs=${request.endMs - request.startMs};sampleCount=${summary.sampleCount}`;
      } else {
        const result = sanitizeDestinationResult(untrustedResponse);
        response = result as RuntimePluginHostResponse<Request>;
        auditDetail = `opened=${String(result.opened)}`;
      }
      await this.manager
        .recordCapabilityResult(
          session.scope,
          session.manifest,
          request.capability,
          true,
          auditDetail,
        )
        .catch(() => undefined);
      return response;
    } catch (caught) {
      await this.manager
        .recordCapabilityResult(
          session.scope,
          session.manifest,
          request.capability,
          false,
          caught instanceof RuntimePluginCapabilityError
            ? caught.code
            : 'host-error',
        )
        .catch(() => undefined);
      throw caught;
    }
  }
}
