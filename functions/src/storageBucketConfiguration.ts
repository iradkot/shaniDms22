/** Keep Firebase's configured default unless the deployment supplies a bucket. */
export const configuredStorageBucketName = (
  value: string | undefined,
): string | undefined => {
  const name = value?.trim();
  if (!name) {
    return undefined;
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(name)) {
    throw new Error('STORAGE_BUCKET_NAME must be a bare Cloud Storage bucket name');
  }
  return name;
};
