// services/DatabaseService.cjs - 실제 DB 구조에 맞게 수정
const sql = require('mssql');
const { LogHelper } = require('../Utils/LogHelper.cjs');
const { Config } = require('../Config/Config.cjs');

class DatabaseService {
  constructor() {
    this.config = Config.DB_CONFIG;
    this.connection_pool = null;
    this.is_connected = false;
    this.log_helper = new LogHelper();
  }

  async connect() {
    try {
      this.connection_pool = await sql.connect(this.config);
      this.is_connected = true;
      this.log_helper.info('데이터베이스 연결 성공');
    } catch (error) {
      this.is_connected = false;
      this.log_helper.error('데이터베이스 연결 실패:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.connection_pool) {
        await this.connection_pool.close();
        this.is_connected = false;
        this.log_helper.info('데이터베이스 연결 종료');
      }
    } catch (error) {
      this.log_helper.error('데이터베이스 연결 종료 실패:', error);
    }
  }

  get_connection_status() {
    return this.is_connected;
  }

  get_status() {
    return {
      name: 'DatabaseService',
      is_connected: this.is_connected,
      created_at: new Date()
    };
  }

  // 음성 채팅 권한 확인 - 서버 멤버면 모두 접근 가능
  async check_voice_permission(server_id, user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT COUNT(*) as count
          FROM [Users] u
          INNER JOIN [ServerMembers] sm ON u.user_id = sm.user_id
          WHERE u.user_id = @user_id 
            AND sm.server_id = @server_id
            AND sm.is_active = 1
        `);
      
      return result.recordset[0].count > 0;
    } catch (error) {
      this.log_helper.error('음성 권한 확인 오류:', error);
      return false;
    }
  }

  // 사용자 정보 조회
  async get_user_info(user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT user_id, nick_name, user_name, profile_image_url, email, status
          FROM [Users] 
          WHERE user_id = @user_id
        `);
      
      return result.recordset[0] || null;
    } catch (error) {
      this.log_helper.error('사용자 정보 조회 오류:', error);
      return null;
    }
  }

  // 서버 내 음성 채팅 참가자 목록 조회 - 모든 서버 멤버
  async get_voice_users(server_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .query(`
          SELECT u.user_id, u.nick_name, u.user_name, u.profile_image_url, u.email
          FROM [Users] u
          INNER JOIN [ServerMembers] sm ON u.user_id = sm.user_id
          WHERE sm.server_id = @server_id 
            AND sm.is_active = 1
            AND u.status = 'active'
        `);
      
      return result.recordset;
    } catch (error) {
      this.log_helper.error('음성 사용자 목록 조회 오류:', error);
      return [];
    }
  }

  // 서버 정보 조회
  async get_server_info(server_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .query(`
          SELECT server_id, server_name, description, created_at, owner_id, max_members
          FROM [Servers] 
          WHERE server_id = @server_id
        `);
      
      return result.recordset[0] || null;
    } catch (error) {
      this.log_helper.error('서버 정보 조회 오류:', error);
      return null;
    }
  }

  // 사용자 역할 확인
  async get_user_role_in_server(server_id, user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT role, joined_at, is_active
          FROM [ServerMembers]
          WHERE server_id = @server_id AND user_id = @user_id
        `);
      
      return result.recordset[0] || null;
    } catch (error) {
      this.log_helper.error('사용자 역할 조회 오류:', error);
      return null;
    }
  }

  // 사용자 존재 여부 확인
  async user_exists(user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT COUNT(*) as count
          FROM [Users]
          WHERE user_id = @user_id
        `);
      
      return result.recordset[0].count > 0;
    } catch (error) {
      this.log_helper.error('사용자 존재 확인 오류:', error);
      return false;
    }
  }

  // 서버 존재 여부 확인
  async server_exists(server_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .query(`
          SELECT COUNT(*) as count
          FROM [Servers]
          WHERE server_id = @server_id
        `);
      
      return result.recordset[0].count > 0;
    } catch (error) {
      this.log_helper.error('서버 존재 확인 오류:', error);
      return false;
    }
  }

  // 서버 멤버 여부 확인
  async is_server_member(server_id, user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT COUNT(*) as count
          FROM [ServerMembers]
          WHERE server_id = @server_id 
            AND user_id = @user_id 
            AND is_active = 1
        `);
      
      return result.recordset[0].count > 0;
    } catch (error) {
      this.log_helper.error('서버 멤버 확인 오류:', error);
      return false;
    }
  }

  // 서버의 모든 활성 멤버 조회
  async get_server_members(server_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('server_id', sql.BigInt, server_id)
        .query(`
          SELECT u.user_id, u.nick_name, u.user_name, u.profile_image_url, 
                 sm.role, sm.joined_at
          FROM [Users] u
          INNER JOIN [ServerMembers] sm ON u.user_id = sm.user_id
          WHERE sm.server_id = @server_id 
            AND sm.is_active = 1
            AND u.status = 'active'
          ORDER BY sm.joined_at ASC
        `);
      
      return result.recordset;
    } catch (error) {
      this.log_helper.error('서버 멤버 조회 오류:', error);
      return [];
    }
  }

  // 사용자가 속한 서버 목록 조회
  async get_user_servers(user_id) {
    try {
      if (!this.is_connected) {
        throw new Error('데이터베이스가 연결되지 않았습니다');
      }

      const request = this.connection_pool.request();
      const result = await request
        .input('user_id', sql.VarChar(50), user_id)
        .query(`
          SELECT s.server_id, s.server_name, s.description, 
                 sm.role, sm.joined_at
          FROM [Servers] s
          INNER JOIN [ServerMembers] sm ON s.server_id = sm.server_id
          WHERE sm.user_id = @user_id 
            AND sm.is_active = 1
          ORDER BY sm.joined_at DESC
        `);
      
      return result.recordset;
    } catch (error) {
      this.log_helper.error('사용자 서버 목록 조회 오류:', error);
      return [];
    }
  }
}

module.exports = { DatabaseService };