// App.cjs
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const cors = require('cors');
const { Config } = require('./Config/Config.cjs');
const { LogHelper } = require('./Utils/LogHelper.cjs');
const { SocketManager } = require('./managers/SocketManager.cjs');

class App {
  constructor(control_manager) {
    this.control_manager = control_manager;
    this.express_app = express();
    this.http_server = http.createServer(this.express_app);
    this.socket_io = new Server(this.http_server, {
      cors: Config.CORS_CONFIG,
      path: '/voice'
    });
    this.socket_handler = null;
    this.is_init = false;
    this.log_helper = new LogHelper();
    
    this.setup_middleware();
    this.setup_routes();
  }

  async init() {
    try {
      this.log_helper.info('[App] 초기화 시작');
      
      this.socket_handler = new SocketManager(
        this.socket_io,
        this.control_manager.get_database_service(),
        this.control_manager.get_voice_manager()
      );
      
      await this.socket_handler.init();
      this.setup_socket_handlers();
      this.is_init = true;
      
      this.log_helper.info('[App] 초기화 완료');
    } catch (error) {
      this.log_helper.error('[App] 초기화 실패:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      this.log_helper.info('[App] 종료 시작');
      
      if (this.socket_handler) {
        await this.socket_handler.shutdown();
      }
      if (this.http_server) {
        this.http_server.close();
      }
      this.is_init = false;
      
      this.log_helper.info('[App] 종료 완료');
    } catch (error) {
      this.log_helper.error('[App] 종료 중 오류:', error);
      throw error;
    }
  }

  setup_middleware() {
    this.express_app.use(cors(Config.CORS_CONFIG));
    this.express_app.use(express.json());
    this.express_app.use(express.urlencoded({ extended: true }));
  }

  setup_routes() {
    // 기본 라우트
    this.express_app.get('/', (req, res) => {
      res.json({
        message: 'Voice Communication Server',
        status: 'running',
        version: '2.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Health Check
    this.express_app.get('/health', (req, res) => {
      const health_status = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
      res.json(health_status);
    });

    // 404 처리
    this.express_app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'ENDPOINT_NOT_FOUND',
          message: '요청하신 엔드포인트를 찾을 수 없습니다'
        }
      });
    });

    // 에러 처리 미들웨어
    this.express_app.use((error, req, res, next) => {
      this.log_helper.error('[App] Express 에러:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '서버 내부 오류가 발생했습니다'
        }
      });
    });
  }

  setup_socket_handlers() {
    // URL 파라미터를 통한 연결: /voice/:server_id/:user_id
    this.socket_io.on('connection', async (socket) => {
      await this.socket_handler.handle_connection(socket);
    });

    this.log_helper.info('[App] Socket.IO 핸들러 설정 완료');
  }

  start_server() {
    const port = Config.SERVER_CONFIG.port;
    
    this.http_server.listen(port, () => {
      this.log_helper.info(`[App] 음성 통신 서버가 포트 ${port}에서 실행 중입니다`);
    });

    return this.http_server;
  }

  get_express_app() {
    return this.express_app;
  }

  get_socket_io() {
    return this.socket_io;
  }

  get_status() {
    return {
      name: 'App',
      is_initialized: this.is_init,
      has_socket_handler: this.socket_handler !== null,
      created_at: new Date()
    };
  }
}

module.exports = { App };