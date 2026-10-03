import {
  assertPrivacyConsent,
  privacySessionRevision,
  PrivacyConsentRequiredError,
} from './transmissionGate';

export const assertPrivacyPathOwner = (value: unknown): void => {
  if (typeof value === 'string') {
    const owner = /(?:^|\/)users\/([^/]+)(?:\/|$)/.exec(value)?.[1];
    assertPrivacyConsent('cloud', owner);
  } else if (value && typeof value === 'object') {
    const input = value as {
      documentPath?: string;
      collectionPath?: string;
      objectPath?: string;
    };
    assertPrivacyPathOwner(
      input.documentPath ?? input.collectionPath ?? input.objectPath,
    );
  } else {
    assertPrivacyConsent('cloud');
  }
};

/** Check immediately before any native cloud operation, including retry calls. */
export const guardPrivacyCloudGateway = <T extends object>(gateway: T): T =>
  new Proxy(gateway, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver);
      if (typeof member !== 'function') {
        return member;
      }
      return (...args: unknown[]) => {
        assertPrivacyPathOwner(args[0]);
        const revision = privacySessionRevision();
        const check = () => {
          if (privacySessionRevision() !== revision) {
            throw new PrivacyConsentRequiredError();
          }
        };
        if (key === 'runTransaction' && typeof args[0] === 'function') {
          const operation = args[0];
          args[0] = (transaction: object) => {
            check();
            return Reflect.apply(operation, undefined, [
              guardPrivacyCloudGateway(transaction),
            ]);
          };
        }
        const result: unknown = Reflect.apply(member, target, args);
        if (result instanceof Promise) {
          return result.then(value => {
            check();
            return value;
          });
        }
        check();
        return result;
      };
    },
  });
