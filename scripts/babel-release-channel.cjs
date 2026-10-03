module.exports = function releaseChannelPlugin({types}) {
  return {
    name: 'shani-release-channel',
    visitor: {
      ReferencedIdentifier(path, state) {
        if (
          state.opts.enabled !== false &&
          path.node.name === '__SHANI_RELEASE_CHANNEL__' &&
          !path.scope.hasBinding('__SHANI_RELEASE_CHANNEL__')
        ) {
          path.replaceWith(types.stringLiteral(state.opts.channel));
        }
      },
    },
  };
};
