// Start.cjs
require('dotenv').config();
const { ControlManager } = require('./Control.cjs');
const { App } = require('./App.cjs');
const { LogHelper } = require('./Utils/LogHelper.cjs');
const { Config } = require('./Config/Config.cjs');

class VoiceServer {
  constructor() {
    this.config = Config.SERVER_CONFIG;

    this.control_manager = null;
    this.app = null;
    this.is_running = false;
    this.log_helper = new LogHelper();
  }

  async init() {
    try {
      this.log_helper.info('[VoiceServer] 음성 통신 서버 초기화 시작...');

      // 컨트롤 매니저 초기화
      this.control_manager = new ControlManager();
      await this.control_manager.init();

      // App 초기화 (VoiceApp이 아닌 App)
      this.app = new App(this.control_manager);
      await this.app.init();

      this.log_helper.info('[VoiceServer] 모든 서비스 초기화 완료');
      return true;
    } catch (error) {
      this.log_helper.error('[VoiceServer] 초기화 실패:', error);
      return false;
    }
  }

  async start() {
    try {
      await this.init();

      // 서버 시작
      this.app.start_server(); 
      this.is_running = true;

      this.log_helper.info('[VoiceServer] 음성 통신 서버 시작 완료');
      this.setup_graceful_shutdown();

    } catch (error) {
      this.log_helper.error('[VoiceServer] 서버 시작 실패:', error);
      process.exit(1);
    }
  }

  setup_graceful_shutdown() {
    // 우아한 종료 처리
    const shutdown_handler = async (signal) => {
      this.log_helper.info(`[VoiceServer] ${signal} 신호 수신 - 서버 종료 중...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown_handler);
    process.on('SIGTERM', shutdown_handler);
    
    // 예외 처리
    process.on('uncaughtException', (error) => {
      this.log_helper.error('[VoiceServer] 처리되지 않은 예외:', error);
      this.shutdown().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.log_helper.error('[VoiceServer] 처리되지 않은 Promise 거부:', reason);
      this.shutdown().then(() => process.exit(1));
    });
  }

  async shutdown() {
    try {
      if (!this.is_running) {
        return;
      }

      this.log_helper.info('[VoiceServer] 서버 종료 프로세스 시작...');

      // App 종료
      if (this.app) {
        await this.app.shutdown();
      }

      // Control Manager 종료
      if (this.control_manager) {
        await this.control_manager.shutdown();
      }

      this.is_running = false;
      this.log_helper.info('[VoiceServer] 서버 종료 완료');
    } catch (error) {
      this.log_helper.error('[VoiceServer] 서버 종료 중 오류:', error);
    }
  }

  get_status() {
    return {
      is_running: this.is_running,
      control_manager: this.control_manager ? true : false,
      app: this.app ? true : false
    };
  }
}

// 메인 실행
if (require.main === module) {
  const server = new VoiceServer();
  server.start();
}

module.exports = { VoiceServer };