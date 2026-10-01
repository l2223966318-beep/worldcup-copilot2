exports.createPayload = (sourceStatus, data, message) => ({
  sourceStatus, data, lastUpdated: new Date().toISOString(),
  ...(message ? { message } : {}),
});
