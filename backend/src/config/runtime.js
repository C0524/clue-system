function resolveRuntimeConfig(env){
  const source = env || process.env;
  return {
    ENABLE_DEBUG_ROUTES: source.ENABLE_DEBUG_ROUTES === '1',
    PORT: source.PORT ? parseInt(source.PORT, 10) : 3000,
  };
}

module.exports = {
  resolveRuntimeConfig,
};
