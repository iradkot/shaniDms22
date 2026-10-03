const RELEASE_CHANNELS = new Set(['development', 'pilot', 'production']);

/** An omitted channel always produces the restricted pilot experience. */
function resolveReleaseChannel(env = process.env) {
  const channel = (env.SHANI_RELEASE_CHANNEL || 'pilot').trim();
  if (!RELEASE_CHANNELS.has(channel)) {
    throw new Error('SHANI_RELEASE_CHANNEL must be development, pilot, or production.');
  }
  return channel;
}

function productionReleaseEnvironment(env = process.env) {
  const channel = resolveReleaseChannel(env);
  if (channel === 'development') {
    throw new Error('Production signing cannot enable experimental features.');
  }
  return {...env, SHANI_RELEASE_CHANNEL: 'production'};
}

module.exports = {resolveReleaseChannel, productionReleaseEnvironment};
