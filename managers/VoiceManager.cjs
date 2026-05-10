// managers/VoiceManager.cjs
const { BaseManager } = require('./BaseManager.cjs');
const { ResponseHelper } = require('../Utils/ResponseHelper.cjs');
const { ValidationHelper } = require('../Utils/ValidationHelper.cjs');

class VoiceManager extends BaseManager {
  constructor(database_service) {
    super('VoiceManager');
    this.database_service = database_service;
    
    // 음성 채널 데이터
    this.voice_channels = new Map();
    this.channel_users = new Map();
    this.user_sockets = new Map();
    this.channel_metadata = new Map();
    
    // MediaSoup
    this.mediasoup_worker = null;
    this.routers = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.user_transports = new Map();
    
    // 설정
    this.max_users_per_channel = 99;
    this.default_channel_name = "일반 음성 채널";
    
    // MediaSoup 설정
    this.media_codecs = [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      }
    ];
  }

  async init() {
    return this.safe_execute('VoiceManager 초기화', async () => {
      await this.init_mediasoup();
      this.is_init = true;
      this.log_info('VoiceManager 초기화 완료');
      return true;
    });
  }

  async init_mediasoup() {
    try {
      const mediasoup = require('mediasoup');
      
      this.mediasoup_worker = await mediasoup.createWorker({
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'warn',
      });

      this.mediasoup_worker.on('died', (error) => {
        this.log_error('MediaSoup worker 종료', error);
        setTimeout(() => process.exit(1), 2000);
      });

      this.log_info('MediaSoup worker 초기화 완료');
    } catch (error) {
      this.log_error('MediaSoup 초기화 실패', error);
      throw error;
    }
  }

  async get_or_create_router(server_id) {
    if (!this.routers.has(server_id)) {
      const router = await this.mediasoup_worker.createRouter({
        mediaCodecs: this.media_codecs
      });
      
      this.routers.set(server_id, router);
      this.log_info(`서버 ${server_id}용 MediaSoup Router 생성`);
    }
    
    return this.routers.get(server_id);
  }

  async init_server_voice_channel(server_id) {
    return this.safe_execute(`서버 ${server_id} 음성 채널 초기화`, async () => {
      const validated_server_id = ValidationHelper.validate_server_id(server_id);
      const channel_id = `voice_${validated_server_id}`;
      
      if (!this.voice_channels.has(validated_server_id)) {
        const channel_info = {
          channel_id: channel_id,
          server_id: validated_server_id,
          name: this.default_channel_name,
          created_at: new Date(),
          max_users: this.max_users_per_channel,
          is_active: true
        };

        this.voice_channels.set(validated_server_id, channel_info);
        this.channel_users.set(channel_id, new Map());
        this.channel_metadata.set(channel_id, {
          created_at: new Date(),
          server_id: validated_server_id,
          total_joins: 0,
          peak_users: 0
        });
        
        this.log_info(`서버 ${validated_server_id}의 음성 채널 생성`);
      }

      return this.voice_channels.get(validated_server_id);
    });
  }

  async join_voice_channel(user_data) {
    return this.safe_execute(`사용자 ${user_data.user_id} 음성 채널 참가`, async () => {
      ValidationHelper.validate_user_data(user_data);
      
      const server_id = ValidationHelper.validate_server_id(user_data.server_id);
      const user_id = ValidationHelper.validate_user_id(user_data.user_id);

      const server_exists = await this.database_service.server_exists(server_id);
      if (!server_exists) {
        return ResponseHelper.create_not_found_response('서버');
      }

      const user_exists = await this.database_service.user_exists(user_id);
      if (!user_exists) {
        return ResponseHelper.create_not_found_response('사용자');
      }

      const channel_info = await this.init_server_voice_channel(server_id);
      const channel_id = channel_info.channel_id;
      const current_users = this.channel_users.get(channel_id);

      if (current_users.size >= channel_info.max_users) {
        return ResponseHelper.create_error_response('CHANNEL_FULL', '음성 채널이 가득 참');
      }

      await this.leave_voice_channel(user_data.socket_id);

      const enhanced_user_data = {
        socket_id: user_data.socket_id,
        user_id: user_data.user_id,
        server_id: user_data.server_id,
        nick_name: user_data.nick_name,
        user_name: user_data.user_name,
        profile_image_url: user_data.profile_image_url,
        email: user_data.email,
        status: user_data.status,
        joined_at: new Date(),
        is_muted: false,
        is_deafened: false,
        current_channel: channel_id
      };

      current_users.set(user_data.socket_id, enhanced_user_data);
      this.user_sockets.set(user_data.socket_id, enhanced_user_data);

      const metadata = this.channel_metadata.get(channel_id);
      metadata.total_joins++;
      metadata.peak_users = Math.max(metadata.peak_users, current_users.size);

      this.log_info(`사용자 ${user_id}가 서버 ${server_id} 음성 채널에 참가 (${current_users.size}명)`);
      
      return ResponseHelper.create_success_response({
        channel_info: channel_info,
        user_count: current_users.size,
        user_state: {
          is_muted: enhanced_user_data.is_muted,
          is_deafened: enhanced_user_data.is_deafened
        }
      });
    });
  }

  async leave_voice_channel(socket_id) {
    return this.safe_execute(`소켓 ${socket_id} 음성 채널 퇴장`, async () => {
      ValidationHelper.validate_socket_id(socket_id);
      
      const user_data = this.user_sockets.get(socket_id);
      if (!user_data || !user_data.current_channel) {
        return ResponseHelper.create_success_response(null, '이미 채널에 없음');
      }

      const channel_id = user_data.current_channel;
      const channel_users = this.channel_users.get(channel_id);
      
      if (channel_users) {
        channel_users.delete(socket_id);
        this.log_info(`사용자 ${user_data.user_id}가 음성 채널에서 퇴장 (남은 인원: ${channel_users.size}명)`);
      }

      this.user_sockets.delete(socket_id);

      await this.cleanup_user_resources(socket_id);

      return ResponseHelper.create_success_response({
        channel_id: channel_id,
        remaining_users: channel_users ? channel_users.size : 0,
        left_user_id: user_data.user_id
      });
    });
  }

  async update_voice_state(socket_id, state_updates) {
    return this.safe_execute(`소켓 ${socket_id} 음성 상태 업데이트`, async () => {
      ValidationHelper.validate_socket_id(socket_id);
      const validated_state = ValidationHelper.validate_voice_state(state_updates);
      
      const user_data = this.user_sockets.get(socket_id);
      if (!user_data || !user_data.current_channel) {
        return ResponseHelper.create_error_response('NOT_IN_CHANNEL', '음성 채널에 없음');
      }

      const channel_users = this.channel_users.get(user_data.current_channel);
      const channel_user = channel_users.get(socket_id);
      
      if (channel_user) {
        Object.assign(channel_user, validated_state);
        channel_user.last_state_update = new Date();
        
        channel_users.set(socket_id, channel_user);
        this.user_sockets.set(socket_id, channel_user);
        
        this.log_info(`사용자 ${channel_user.user_id} 음성 상태 업데이트: muted=${channel_user.is_muted}, deafened=${channel_user.is_deafened}`);
        
        return ResponseHelper.create_success_response({
          user_id: channel_user.user_id,
          updated_state: {
            is_muted: channel_user.is_muted,
            is_deafened: channel_user.is_deafened,
            updated_at: channel_user.last_state_update
          }
        });
      }

      return ResponseHelper.create_error_response('USER_NOT_FOUND', '사용자 상태를 찾을 수 없음');
    });
  }

  get_channel_voice_states(channel_id) {
    const users = this.channel_users.get(channel_id);
    if (!users) {
      // 채널이 없으면 빈 배열 반환
      return [];
    }

    const voice_states = [];
    for (const [socket_id, user_data] of users) {
      voice_states.push({
        user_id: user_data.user_id,
        socket_id: socket_id,
        nick_name: user_data.nick_name,
        user_name: user_data.user_name,
        profile_image_url: user_data.profile_image_url,
        email: user_data.email,
        status: user_data.status,
        voice_state: {
          is_muted: user_data.is_muted || false,
          is_deafened: user_data.is_deafened || false,
          joined_at: user_data.joined_at,
          last_state_update: user_data.last_state_update || user_data.joined_at
        }
      });
    }
    
    return voice_states;
  }

  async create_webrtc_transport(server_id, socket_id, direction) {
    try {
      const router = await this.get_or_create_router(server_id);
      
      const transport = await router.createWebRtcTransport({
        listenIps: [
          { 
            ip: '0.0.0.0',
            announcedIp: process.env.ANNOUNCED_IP || '203.234.12.99'
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          transport.close();
        }
      });

      transport.on('close', () => {
        this.log_info(`Transport ${transport.id} 종료`);
      });

      this.transports.set(transport.id, {
        transport,
        router,
        server_id,
        socket_id,
        direction,
        created_at: new Date()
      });
      
      if (!this.user_transports.has(socket_id)) {
        this.user_transports.set(socket_id, {});
      }
      this.user_transports.get(socket_id)[direction] = transport;

      this.log_info(`${direction} Transport 생성: ${transport.id}`);
      
      return {
        transport_id: transport.id,
        ice_parameters: transport.iceParameters,
        ice_candidates: transport.iceCandidates,
        dtls_parameters: transport.dtlsParameters
      };
    } catch (error) {
      this.log_error('WebRTC Transport 생성 실패', error);
      throw error;
    }
  }

  async connect_transport(transport_id, dtls_parameters) {
    try {
      const transport_data = this.transports.get(transport_id);
      if (!transport_data) {
        throw new Error('Transport를 찾을 수 없습니다');
      }

      await transport_data.transport.connect({ dtlsParameters: dtls_parameters });
      this.log_info(`Transport ${transport_id} 연결 완료`);
      
      return { success: true };
    } catch (error) {
      this.log_error('Transport 연결 실패', error);
      throw error;
    }
  }

  async create_producer(transport_id, rtp_parameters, socket_id) {
    try {
      const transport_data = this.transports.get(transport_id);
      if (!transport_data) {
        throw new Error('Transport를 찾을 수 없습니다');
      }

      const producer = await transport_data.transport.produce({
        kind: 'audio',
        rtpParameters: rtp_parameters
      });

      this.producers.set(producer.id, {
        producer,
        socket_id,
        server_id: transport_data.server_id,
        created_at: new Date()
      });

      producer.on('transportclose', () => {
        this.log_info(`Producer ${producer.id} transport 종료`);
        this.producers.delete(producer.id);
      });

      this.log_info(`Producer 생성: ${producer.id}`);

      return { producer_id: producer.id };
    } catch (error) {
      this.log_error('Producer 생성 실패', error);
      throw error;
    }
  }

  async create_consumer(transport_id, producer_id, rtp_capabilities, socket_id) {
    try {
      const transport_data = this.transports.get(transport_id);
      const producer_data = this.producers.get(producer_id);
      
      if (!transport_data) {
        throw new Error('Transport를 찾을 수 없습니다');
      }
      
      if (!producer_data) {
        throw new Error('Producer를 찾을 수 없습니다');
      }

      const { producer } = producer_data;
      const { router } = transport_data;

      if (!router.canConsume({ producerId: producer.id, rtpCapabilities: rtp_capabilities })) {
        throw new Error('RTP Capabilities가 호환되지 않습니다');
      }

      const consumer = await transport_data.transport.consume({
        producerId: producer.id,
        rtpCapabilities: rtp_capabilities,
        paused: true,
      });

      this.consumers.set(consumer.id, {
        consumer,
        socket_id,
        producer_id,
        created_at: new Date()
      });

      consumer.on('transportclose', () => {
        this.log_info(`Consumer ${consumer.id} transport 종료`);
        this.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        this.log_info(`Consumer ${consumer.id} producer 종료`);
        this.consumers.delete(consumer.id);
      });

      this.log_info(`Consumer 생성: ${consumer.id}`);

      return {
        consumer_id: consumer.id,
        producer_id: producer.id,
        kind: consumer.kind,
        rtp_parameters: consumer.rtpParameters
      };
    } catch (error) {
      this.log_error('Consumer 생성 실패', error);
      throw error;
    }
  }

  async resume_consumer(consumer_id) {
    try {
      const consumer_data = this.consumers.get(consumer_id);
      if (!consumer_data) {
        throw new Error('Consumer를 찾을 수 없습니다');
      }

      await consumer_data.consumer.resume();
      this.log_info(`Consumer ${consumer_id} 재생 시작`);
      
      return { success: true };
    } catch (error) {
      this.log_error('Consumer Resume 실패', error);
      throw error;
    }
  }

  async cleanup_user_resources(socket_id) {
    try {
      for (const [producer_id, producer_data] of this.producers) {
        if (producer_data.socket_id === socket_id) {
          producer_data.producer.close();
          this.producers.delete(producer_id);
          this.log_info(`Producer ${producer_id} 정리 완료`);
        }
      }

      for (const [consumer_id, consumer_data] of this.consumers) {
        if (consumer_data.socket_id === socket_id) {
          consumer_data.consumer.close();
          this.consumers.delete(consumer_id);
          this.log_info(`Consumer ${consumer_id} 정리 완료`);
        }
      }

      const user_transports = this.user_transports.get(socket_id);
      if (user_transports) {
        for (const [direction, transport] of Object.entries(user_transports)) {
          if (transport && !transport.closed) {
            transport.close();
            for (const [transport_id, transport_data] of this.transports) {
              if (transport_data.transport === transport) {
                this.transports.delete(transport_id);
                this.log_info(`${direction} Transport ${transport_id} 정리 완료`);
                break;
              }
            }
          }
        }
        this.user_transports.delete(socket_id);
      }
    } catch (error) {
      this.log_error('사용자 리소스 정리 실패', error);
    }
  }

  get_channel_users(channel_id) {
    const users = this.channel_users.get(channel_id);
    if (!users) {
      // 채널이 없으면 빈 배열 반환 (오류가 아님)
      return [];
    }
    return Array.from(users.values());
  }

  get_user_voice_state(socket_id) {
    return this.user_sockets.get(socket_id) || null;
  }

  get_server_voice_channel(server_id) {
    return this.voice_channels.get(server_id) || null;
  }

  get_voice_statistics() {
    return {
      total_channels: this.voice_channels.size,
      total_users: this.user_sockets.size,
      total_producers: this.producers.size,
      total_consumers: this.consumers.size,
      total_transports: this.transports.size
    };
  }

  async shutdown() {
    return this.safe_execute('VoiceManager 종료', async () => {
      for (const [consumer_id, consumer_data] of this.consumers) {
        consumer_data.consumer.close();
      }
      this.consumers.clear();

      for (const [producer_id, producer_data] of this.producers) {
        producer_data.producer.close();
      }
      this.producers.clear();

      for (const [transport_id, transport_data] of this.transports) {
        if (!transport_data.transport.closed) {
          transport_data.transport.close();
        }
      }
      this.transports.clear();

      for (const [server_id, router] of this.routers) {
        router.close();
      }
      this.routers.clear();

      if (this.mediasoup_worker) {
        this.mediasoup_worker.close();
      }

      for (const [socket_id] of this.user_sockets) {
        await this.leave_voice_channel(socket_id);
      }

      this.voice_channels.clear();
      this.channel_users.clear();
      this.user_sockets.clear();
      this.channel_metadata.clear();
      this.user_transports.clear();
      
      this.is_init = false;
      this.log_info('VoiceManager 종료 완료');
      return true;
    });
  }
}

module.exports = { VoiceManager };