import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const WEB_RELEASE_MANIFEST_FILE = '.shani-release.json';
const CHANNELS = new Set(['development', 'pilot', 'production']);

/** The manifest uses the same captured channel as the JavaScript define. */
export const webReleaseManifestPlugin = channel => {
  if (!CHANNELS.has(channel)) {
    throw new Error('A valid immutable web build channel is required.');
  }
  const source = `${JSON.stringify({version: 1, channel}, null, 2)}\n`;
  return {
    name: 'shani-web-release-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({type: 'asset', fileName: WEB_RELEASE_MANIFEST_FILE, source});
    },
  };
};

/** Validate the built artifact, never the environment of the publishing process. */
export const assertPublishableWebReleaseManifest = raw => {
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('Web release manifest is missing or invalid. Rebuild a pilot or production web artifact.');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.version !== 1 || !['pilot', 'production'].includes(manifest.channel)) {
    throw new Error('Only a verified pilot or production web build may be published. Rebuild the web artifact.');
  }
  return Object.freeze({version: 1, channel: manifest.channel});
};

export const verifyPublishableWebBuild = async outputDirectory => {
  let raw;
  try {
    raw = await readFile(path.join(outputDirectory, WEB_RELEASE_MANIFEST_FILE), 'utf8');
  } catch {
    throw new Error('Web release manifest is missing or unreadable. Rebuild a pilot or production web artifact.');
  }
  return assertPublishableWebReleaseManifest(raw);
};
