/* eslint-disable no-bitwise */
import {sha256Hex} from '../domain/canonical';
import type {RuntimePluginSignatureVerifier} from '../domain/types';

declare const BigInt: (value: string | number) => bigint;

const CURVE_P = BigInt(
  '0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff',
);
const CURVE_A = CURVE_P - 3n;
const CURVE_B = BigInt(
  '0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b',
);
const CURVE_N = BigInt(
  '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
);
const GENERATOR = {
  x: BigInt(
    '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
  ),
  y: BigInt(
    '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5',
  ),
} as const;

type Point = Readonly<{x: bigint; y: bigint}> | undefined;

const mod = (value: bigint, modulus: bigint): bigint => {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
};

const inverse = (value: bigint, modulus: bigint): bigint => {
  let oldR = mod(value, modulus);
  let r = modulus;
  let oldS = 1n;
  let s = 0n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) {
    throw new Error('Value has no modular inverse.');
  }
  return mod(oldS, modulus);
};

const pointDouble = (point: Point): Point => {
  if (!point || point.y === 0n) {
    return undefined;
  }
  const slope = mod(
    (3n * point.x * point.x + CURVE_A) * inverse(2n * point.y, CURVE_P),
    CURVE_P,
  );
  const x = mod(slope * slope - 2n * point.x, CURVE_P);
  const y = mod(slope * (point.x - x) - point.y, CURVE_P);
  return {x, y};
};

const pointAdd = (left: Point, right: Point): Point => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left.x === right.x) {
    return left.y === right.y ? pointDouble(left) : undefined;
  }
  const slope = mod(
    (right.y - left.y) * inverse(right.x - left.x, CURVE_P),
    CURVE_P,
  );
  const x = mod(slope * slope - left.x - right.x, CURVE_P);
  const y = mod(slope * (left.x - x) - left.y, CURVE_P);
  return {x, y};
};

const scalarMultiply = (scalar: bigint, point: Point): Point => {
  let remaining = scalar;
  let current = point;
  let result: Point;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) {
      result = pointAdd(result, current);
    }
    current = pointDouble(current);
    remaining >>= 1n;
  }
  return result;
};

const base64UrlBytes = (value: string): readonly number[] | undefined => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (value.length === 0 || value.length % 4 === 1) {
    return undefined;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) {
      return undefined;
    }
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0 && buffer !== 0) {
    return undefined;
  }
  return bytes;
};

const bytesToBigInt = (bytes: readonly number[]): bigint => {
  let result = 0n;
  bytes.forEach(byte => {
    result = (result << 8n) | BigInt(byte);
  });
  return result;
};

const isPointOnCurve = (point: Readonly<{x: bigint; y: bigint}>): boolean =>
  point.x >= 0n &&
  point.x < CURVE_P &&
  point.y >= 0n &&
  point.y < CURVE_P &&
  mod(point.y * point.y, CURVE_P) ===
    mod(point.x * point.x * point.x + CURVE_A * point.x + CURVE_B, CURVE_P);

/**
 * Dependency-free ES256 verifier for React Native and web.
 *
 * Signatures use the fixed-width JWS form (R || S), not ASN.1 DER. Requiring
 * low-S keeps one canonical signature for every manifest.
 */
export class Es256RuntimePluginSignatureVerifier
  implements RuntimePluginSignatureVerifier
{
  async verify({message, signature, key}: Parameters<
    RuntimePluginSignatureVerifier['verify']
  >[0]): Promise<boolean> {
    try {
      const signatureBytes = base64UrlBytes(signature);
      const publicKeyBytes = base64UrlBytes(key.publicKey);
      if (
        signatureBytes?.length !== 64 ||
        publicKeyBytes?.length !== 65 ||
        publicKeyBytes[0] !== 4
      ) {
        return false;
      }
      const r = bytesToBigInt(signatureBytes.slice(0, 32));
      const s = bytesToBigInt(signatureBytes.slice(32));
      if (r <= 0n || r >= CURVE_N || s <= 0n || s > CURVE_N / 2n) {
        return false;
      }
      const publicPoint = {
        x: bytesToBigInt(publicKeyBytes.slice(1, 33)),
        y: bytesToBigInt(publicKeyBytes.slice(33, 65)),
      };
      if (!isPointOnCurve(publicPoint)) {
        return false;
      }
      const digest = BigInt(`0x${sha256Hex(message)}`);
      const inverseS = inverse(s, CURVE_N);
      const candidate = pointAdd(
        scalarMultiply(mod(digest * inverseS, CURVE_N), GENERATOR),
        scalarMultiply(mod(r * inverseS, CURVE_N), publicPoint),
      );
      return candidate !== undefined && mod(candidate.x, CURVE_N) === r;
    } catch {
      return false;
    }
  }
}
