//Control.cjs - 통합 컨트롤
const { BaseManager } = require('./managers/BaseManager.cjs');
const { Config } = require('./Config/Config.cjs');
const { DatabaseService } = require('./services/DatabaseService.cjs');
const { VoiceManager } = require('./managers/VoiceManager.cjs');

class ControlManager extends BaseManager {
  constructor() {
    super('ControlManager');
    this.database_service = new DatabaseService();
    this.voice_manager = new VoiceManager(this.database_service);
    this.mediasoup_worker = null;
  }

  async init() {
    return this.safe_execute('ControlManager 초기화', async () => {
      await this.database_service.connect();
      await this.voice_manager.init();
      this.is_initialized = true;
      this.log_info('ControlManager 초기화 완료');
    });
  }

  get_database_service() {
    return this.database_service;
  }

  get_voice_manager() {
    return this.voice_manager;
  }

  get_system_status() {
    return {
      control_manager: this.get_status(),
      database_service: this.database_service.get_status ? this.database_service.get_status() : { status: 'connected' },
      voice_manager: this.voice_manager.get_status(),
      voice_statistics: this.voice_manager.get_voice_statistics(),
      mediasoup_worker_alive: this.mediasoup_worker && !this.mediasoup_worker.closed,
      memory_usage: process.memoryUsage(),
      node_version: process.version
    };
  }

  async shutdown() {
    return this.safe_execute('ControlManager 종료', async () => {
      if (this.voice_manager) {
        await this.voice_manager.shutdown();
      }
      if (this.mediasoup_worker) {
        this.mediasoup_worker.close();
      }
      if (this.database_service) {
        await this.database_service.disconnect();
      }
      this.is_initialized = false;
      this.log_info('ControlManager 종료 완료');
    });
  }
}

module.exports = { ControlManager };