export const forbiddenCredentialFilePatterns = [
  /(^|\/)secrets$/i,
  /(^|\/)client_secret_.*\.apps\.googleusercontent\.com\.json$/i,
  /(^|\/)\.env(?:\..+)?$/i,
  /\.(?:p8|p12|mobileprovision)$/i,
  /\.keystore$/i,
];

export const allowedCredentialFilePatterns = [
  /(^|\/)\.env\.example$/i,
  /(^|\/)debug\.keystore$/i,
];

export const findCredentialFileViolations = paths =>
  [...new Set(paths)]
    .map(filePath => filePath.replaceAll('\\', '/'))
    .filter(
      filePath =>
        forbiddenCredentialFilePatterns.some(pattern => pattern.test(filePath)) &&
        !allowedCredentialFilePatterns.some(pattern => pattern.test(filePath)),
    )
    .sort();
