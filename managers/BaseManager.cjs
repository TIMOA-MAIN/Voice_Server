// services/BaseManager.cjs - 핵심 매니저 기능만 남김
const { LogHelper } = require('../Utils/LogHelper.cjs');

class BaseManager {
  constructor(name) {
    this.manager_name = name || 'BaseManager';
    this.is_initialized = false;
    this.created_at = new Date();
    this.last_updated = new Date();
    this.log_helper = new LogHelper(); // 인스턴스 생성
  }

  // 필수 구현 메서드들 (추상 메서드)
  async init() {
    throw new Error(`${this.manager_name}: init() 메서드를 구현해야 합니다`);
  }

  async shutdown() {
    throw new Error(`${this.manager_name}: shutdown() 메서드를 구현해야 합니다`);
  }

  // 상태 관리
  get_status() {
    return {
      manager_name: this.manager_name,
      is_initialized: this.is_initialized,
      created_at: this.created_at,
      last_updated: this.last_updated,
      uptime: Date.now() - this.created_at.getTime()
    };
  }

  update_timestamp() {
    this.last_updated = new Date();
  }

  // 로깅 메서드들
  log_info(message, meta = {}) {
    this.log_helper.info(`[${this.manager_name}] ${message}`, meta);
  }

  log_error(message, error = null) {
    this.log_helper.error(`[${this.manager_name}] ${message}`, error);
  }

  log_warn(message, meta = {}) {
    this.log_helper.warn(`[${this.manager_name}] ${message}`, meta);
  }

  log_debug(message, meta = {}) {
    this.log_helper.debug(`[${this.manager_name}] ${message}`, meta);
  }

  // 비동기 작업 래퍼 (에러 처리 포함)
  async safe_execute(operation_name, async_function) {
    try {
      this.log_debug(`${operation_name} 시작`);
      const result = await async_function();
      this.log_debug(`${operation_name} 완료`);
      this.update_timestamp();
      return result;
    } catch (error) {
      this.log_error(`${operation_name} 실패`, error);
      throw error;
    }
  }
}

module.exports = { BaseManager };