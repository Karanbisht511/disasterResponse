function logAction(action, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    ...details
  };
  console.log(JSON.stringify(logEntry));
}

module.exports = { logAction }; 