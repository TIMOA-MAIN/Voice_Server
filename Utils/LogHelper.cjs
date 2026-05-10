// Utils/LogHelper.cjs
class LogHelper {
  constructor() {
    // 콘솔 로깅만 사용
  }

  info(message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] [${timestamp}] ${message}`, meta);
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] [${timestamp}] ${message}`, error);
  }

  warn(message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN] [${timestamp}] ${message}`, meta);
  }

  debug(message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.debug(`[DEBUG] [${timestamp}] ${message}`, meta);
  }
}

module.exports = { LogHelper };