// managers/SocketManager.cjs
const { BaseManager } = require('./BaseManager.cjs');
const { ResponseHelper } = require('../Utils/ResponseHelper.cjs');
const { ValidationHelper } = require('../Utils/ValidationHelper.cjs');

class SocketManager extends BaseManager {
  constructor(io, database_service, voice_manager) {
    super('SocketManager');
    this.io = io;
    this.database_service = database_service;
    this.voice_manager = voice_manager;
    
    this.connected_sockets = new Map();
  }

  async init() {
    return this.safe_execute('SocketManager 초기화', async () => {
      this.is_initialized = true;
      this.log_info('SocketManager 초기화 완료');
      return true;
    });
  }

  async shutdown() {
    return this.safe_execute('SocketManager 종료', async () => {
      this.connected_sockets.clear();
      this.is_initialized = false;
      this.log_info('SocketManager 종료 완료');
      return true;
    });
  }

  async handle_connection(socket) {
    const { server_id, user_id } = socket.handshake.query;
    
    if (!server_id || !user_id) {
      this.log_error('연결 실패: server_id 또는 user_id 누락');
      socket.emit('error', ResponseHelper.create_error_response(
        'INVALID_CONNECTION',
        'server_id와 user_id가 필요합니다'
      ));
      socket.disconnect();
      return;
    }

    this.log_info(`클라이언트 연결: ${socket.id} (서버: ${server_id}, 사용자: ${user_id})`);
    
    this.connected_sockets.set(socket.id, {
      socket_id: socket.id,
      server_id,
      user_id,
      connected_at: new Date(),
      ip_address: socket.handshake.address
    });

    await socket.join(server_id);

    this.register_socket_events(socket, server_id, user_id);

    socket.on('disconnect', () => {
      this.handle_disconnect(socket);
    });

    this.handle_get_channel_users(socket);
  }

  register_socket_events(socket, server_id, user_id) {
    // 음성 채널 참가
    socket.on('join_voice_channel', async () => {
      await this.handle_join_voice_channel(socket, server_id, user_id);
    });

    // 음성 채널 퇴장
    socket.on('leave_voice_channel', async () => {
      await this.handle_leave_voice_channel(socket, server_id);
    });

    // 음성 상태 업데이트 (일반적인 상태 변경)
    socket.on('update_voice_state', async (data) => {
      await this.handle_update_voice_state(socket, server_id, data);
    });

    // 마이크 음소거/해제 토글
    socket.on('toggle_mute', async () => {
      await this.handle_toggle_mute(socket, server_id);
    });

    // 스피커 음소거/해제 토글 (듣기 차단)
    socket.on('toggle_deafen', async () => {
      await this.handle_toggle_deafen(socket, server_id);
    });

    // 채널 내 사용자 목록 조회
    socket.on('get_channel_users', async () => {
      await this.handle_get_channel_users(socket);
    });

    // 채널 내 모든 사용자의 음성 상태 조회
    socket.on('get_channel_voice_states', async () => {
      await this.handle_get_channel_voice_states(socket);
    });

    // MediaSoup RTP Capabilities 조회
    socket.on('get_rtp_capabilities', async () => {
      await this.handle_get_rtp_capabilities(socket);
    });

    // WebRTC Transport 생성 (send/recv)
    socket.on('create_transport', async (data) => {
      await this.handle_create_transport(socket, data);
    });

    // WebRTC Transport 연결
    socket.on('connect_transport', async (data) => {
      await this.handle_connect_transport(socket, data);
    });

    // 오디오 Producer 생성 (마이크 스트림)
    socket.on('create_producer', async (data) => {
      await this.handle_create_producer(socket, data);
    });

    // 오디오 Consumer 생성 (다른 사용자 스트림 수신)
    socket.on('create_consumer', async (data) => {
      await this.handle_create_consumer(socket, data);
    });

    // Consumer 재생 시작
    socket.on('resume_consumer', async (data) => {
      await this.handle_resume_consumer(socket, data);
    });

    // Consumer 일시정지
    socket.on('pause_consumer', async (data) => {
      await this.handle_pause_consumer(socket, data);
    });

    // Producer 종료
    socket.on('close_producer', async (data) => {
      await this.handle_close_producer(socket, data);
    });
  }

  // 음성 채널 참가
  async handle_join_voice_channel(socket, server_id, user_id) {
    try {
      const user_info = await this.database_service.get_user_info(user_id);
      if (!user_info) {
        socket.emit('error', ResponseHelper.create_not_found_response('사용자'));
        socket.disconnect();
        return;
      }

      const join_result = await this.voice_manager.join_voice_channel({
        socket_id: socket.id,
        user_id: user_id,
        server_id: server_id,
        nick_name: user_info.nick_name,
        user_name: user_info.user_name,
        profile_image_url: user_info.profile_image_url,
        email: user_info.email,
        status: user_info.status
      });

      if (!join_result.success) {
        socket.emit('error', join_result);
        socket.disconnect();
        return;
      }

      const channel_id = join_result.data.channel_info.channel_id;
      await socket.join(channel_id);

      const router = await this.voice_manager.get_or_create_router(server_id);
      
      const channel_users = this.voice_manager.get_channel_users(channel_id);
      
      const existing_producers = [];
      for (const [producer_id, producer_data] of this.voice_manager.producers) {
        const producer_user = this.voice_manager.get_user_voice_state(producer_data.socket_id);
        if (producer_user && producer_user.current_channel === channel_id && producer_data.socket_id !== socket.id) {
          existing_producers.push({
            producer_id,
            user_id: producer_user.user_id,
            socket_id: producer_data.socket_id,
            nick_name: producer_user.nick_name,
            user_name: producer_user.user_name,
            profile_image_url: producer_user.profile_image_url,
            email: producer_user.email,
            status: producer_user.status
          });
        }
      }

      socket.emit('voice_channel_joined', ResponseHelper.create_success_response({
        channel_info: join_result.data.channel_info,
        your_state: join_result.data.user_state,
        rtp_capabilities: router.rtpCapabilities,
        channel_users: channel_users.map(user => ({
          user_id: user.user_id,
          nick_name: user.nick_name,
          user_name: user.user_name,
          profile_image_url: user.profile_image_url,
          email: user.email,
          status: user.status,
          voice_state: {
            is_muted: user.is_muted || false,
            is_deafened: user.is_deafened || false,
            joined_at: user.joined_at
          }
        })),
        existing_producers
      }));

      socket.to(server_id).emit('user_joined', {
        user_id: user_id,
        nick_name: user_info.nick_name,
        user_name: user_info.user_name,
        profile_image_url: user_info.profile_image_url,
        email: user_info.email,
        status: user_info.status,
        voice_state: join_result.data.user_state
      });

      this.log_info(`사용자 ${user_id}가 서버 ${server_id} 음성 채널에 입장 (현재 ${channel_users.length}명)`);
    } catch (error) {
      this.log_error('음성 채널 참가 실패', error);
      socket.emit('error', ResponseHelper.create_internal_error_response('음성 채널 참가'));
      socket.disconnect();
    }
  }

  // 채널 사용자 목록 조회
  async handle_get_channel_users(socket) {
    try {
      const socket_info = this.connected_sockets.get(socket.id);
      if (!socket_info) {
        socket.emit('channel_users', ResponseHelper.create_error_response(
          'INVALID_SOCKET',
          '유효하지 않은 소켓입니다'
        ));
        return;
      }

      // 서버 ID 정규화
      const server_id = ValidationHelper.validate_server_id(socket_info.server_id);
      const channel_id = `voice_${server_id}`;
      
      // 채널 사용자 직접 조회 (voice_channels 체크 없이)
      const channel_users = this.voice_manager.get_channel_users(channel_id);
      
      socket.emit('channel_users', ResponseHelper.create_success_response({
        channel_id: channel_id,
        server_id: server_id,
        users: channel_users.map(user => ({
          user_id: user.user_id,
          nick_name: user.nick_name,
          user_name: user.user_name,
          profile_image_url: user.profile_image_url,
          email: user.email,
          status: user.status,
          voice_state: {
            is_muted: user.is_muted || false,
            is_deafened: user.is_deafened || false,
            joined_at: user.joined_at
          }
        })),
        total_count: channel_users.length
      }));
    } catch (error) {
      this.log_error('채널 사용자 목록 조회 오류', error);
      socket.emit('channel_users', ResponseHelper.create_internal_error_response('채널 사용자 조회'));
    }
  }

  // RTP Capabilities 조회
  async handle_get_rtp_capabilities(socket) {
    try {
      const socket_info = this.connected_sockets.get(socket.id);
      if (!socket_info) {
        socket.emit('rtp_capabilities', ResponseHelper.create_error_response(
          'INVALID_SOCKET',
          '유효하지 않은 소켓입니다'
        ));
        return;
      }

      const router = await this.voice_manager.get_or_create_router(socket_info.server_id);
      
      socket.emit('rtp_capabilities', ResponseHelper.create_success_response({
        rtp_capabilities: router.rtpCapabilities
      }));
    } catch (error) {
      this.log_error('RTP Capabilities 조회 실패', error);
      socket.emit('rtp_capabilities', ResponseHelper.create_internal_error_response('RTP Capabilities 조회'));
    }
  }

  // Transport 생성
  async handle_create_transport(socket, data) {
    try {
      const { direction } = data;
      const socket_info = this.connected_sockets.get(socket.id);
      
      if (!socket_info) {
        socket.emit('transport_error', ResponseHelper.create_error_response(
          'INVALID_SOCKET',
          '유효하지 않은 소켓입니다'
        ));
        return;
      }

      if (!['send', 'recv'].includes(direction)) {
        socket.emit('transport_error', ResponseHelper.create_error_response(
          'INVALID_DIRECTION',
          '유효하지 않은 direction입니다'
        ));
        return;
      }

      const transport_params = await this.voice_manager.create_webrtc_transport(
        socket_info.server_id,
        socket.id,
        direction
      );

      socket.emit('transport_created', ResponseHelper.create_success_response({
        direction,
        ...transport_params
      }));
    } catch (error) {
      this.log_error('Transport 생성 실패', error);
      socket.emit('transport_error', ResponseHelper.create_internal_error_response('Transport 생성'));
    }
  }

  // Transport 연결
  async handle_connect_transport(socket, data) {
    try {
      const { transport_id, dtls_parameters } = data;
      
      if (!transport_id || !dtls_parameters) {
        socket.emit('transport_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'transport_id와 dtls_parameters가 필요합니다'
        ));
        return;
      }

      await this.voice_manager.connect_transport(transport_id, dtls_parameters);

      socket.emit('transport_connected', ResponseHelper.create_success_response({
        transport_id
      }));
    } catch (error) {
      this.log_error('Transport 연결 실패', error);
      socket.emit('transport_error', ResponseHelper.create_internal_error_response('Transport 연결'));
    }
  }

  // Producer 생성
  async handle_create_producer(socket, data) {
    try {
      const { transport_id, rtp_parameters } = data;
      
      if (!transport_id || !rtp_parameters) {
        socket.emit('producer_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'transport_id와 rtp_parameters가 필요합니다'
        ));
        return;
      }

      const result = await this.voice_manager.create_producer(
        transport_id,
        rtp_parameters,
        socket.id
      );

      socket.emit('producer_created', ResponseHelper.create_success_response(result));

      // 같은 채널의 다른 사용자들에게 새 Producer 알림
      const user_state = this.voice_manager.get_user_voice_state(socket.id);
      if (user_state && user_state.current_channel) {
        socket.to(user_state.current_channel).emit('new_producer', {
          producer_id: result.producer_id,
          user_id: user_state.user_id,
          nick_name: user_state.nick_name,
          user_name: user_state.user_name,
          profile_image_url: user_state.profile_image_url,
          email: user_state.email,
          status: user_state.status,
          socket_id: socket.id
        });
      }
    } catch (error) {
      this.log_error('Producer 생성 실패', error);
      socket.emit('producer_error', ResponseHelper.create_internal_error_response('Producer 생성'));
    }
  }

  // Consumer 생성
  async handle_create_consumer(socket, data) {
    try {
      const { transport_id, producer_id, rtp_capabilities } = data;
      
      if (!transport_id || !producer_id || !rtp_capabilities) {
        socket.emit('consumer_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'transport_id, producer_id, rtp_capabilities가 필요합니다'
        ));
        return;
      }

      const result = await this.voice_manager.create_consumer(
        transport_id,
        producer_id,
        rtp_capabilities,
        socket.id
      );

      socket.emit('consumer_created', ResponseHelper.create_success_response(result));
    } catch (error) {
      this.log_error('Consumer 생성 실패', error);
      socket.emit('consumer_error', ResponseHelper.create_internal_error_response('Consumer 생성'));
    }
  }

  // Consumer Resume
  async handle_resume_consumer(socket, data) {
    try {
      const { consumer_id } = data;
      
      if (!consumer_id) {
        socket.emit('consumer_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'consumer_id가 필요합니다'
        ));
        return;
      }

      await this.voice_manager.resume_consumer(consumer_id);

      socket.emit('consumer_resumed', ResponseHelper.create_success_response({
        consumer_id
      }));
    } catch (error) {
      this.log_error('Consumer Resume 실패', error);
      socket.emit('consumer_error', ResponseHelper.create_internal_error_response('Consumer Resume'));
    }
  }

  // Consumer Pause
  async handle_pause_consumer(socket, data) {
    try {
      const { consumer_id } = data;
      
      if (!consumer_id) {
        socket.emit('consumer_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'consumer_id가 필요합니다'
        ));
        return;
      }

      const consumer_data = this.voice_manager.consumers.get(consumer_id);
      if (!consumer_data) {
        socket.emit('consumer_error', ResponseHelper.create_not_found_response('Consumer'));
        return;
      }

      await consumer_data.consumer.pause();

      socket.emit('consumer_paused', ResponseHelper.create_success_response({
        consumer_id
      }));
    } catch (error) {
      this.log_error('Consumer Pause 실패', error);
      socket.emit('consumer_error', ResponseHelper.create_internal_error_response('Consumer Pause'));
    }
  }

  // Producer 종료
  async handle_close_producer(socket, data) {
    try {
      const { producer_id } = data;
      
      if (!producer_id) {
        socket.emit('producer_error', ResponseHelper.create_error_response(
          'MISSING_PARAMETERS',
          'producer_id가 필요합니다'
        ));
        return;
      }

      const producer_data = this.voice_manager.producers.get(producer_id);
      if (!producer_data) {
        socket.emit('producer_error', ResponseHelper.create_not_found_response('Producer'));
        return;
      }

      producer_data.producer.close();
      this.voice_manager.producers.delete(producer_id);

      socket.emit('producer_closed', ResponseHelper.create_success_response({
        producer_id
      }));

      // 같은 채널의 다른 사용자들에게 Producer 종료 알림
      const user_state = this.voice_manager.get_user_voice_state(socket.id);
      if (user_state && user_state.current_channel) {
        socket.to(user_state.current_channel).emit('producer_closed', {
          producer_id,
          user_id: user_state.user_id
        });
      }
    } catch (error) {
      this.log_error('Producer 종료 실패', error);
      socket.emit('producer_error', ResponseHelper.create_internal_error_response('Producer 종료'));
    }
  }

  // 음성 채널 퇴장
  async handle_leave_voice_channel(socket, server_id) {
    try {
      const user_state = this.voice_manager.get_user_voice_state(socket.id);
      if (!user_state) {
        socket.emit('voice_channel_left', ResponseHelper.create_success_response(null, '이미 채널에 없음'));
        return;
      }

      const channel_id = user_state.current_channel;
      const user_id = user_state.user_id;

      const leave_result = await this.voice_manager.leave_voice_channel(socket.id);

      if (leave_result.success && channel_id) {
        socket.to(server_id).emit('user_left', {
          user_id: user_id,
          remaining_users: leave_result.data.remaining_users
        });

        socket.leave(channel_id);
        socket.leave(server_id);
      }

      socket.emit('voice_channel_left', leave_result);
    } catch (error) {
      this.log_error('음성 채널 퇴장 처리 오류', error);
      socket.emit('error', ResponseHelper.create_internal_error_response('음성 채널 퇴장'));
    }
  }

  // 음성 상태 업데이트
  async handle_update_voice_state(socket, server_id, data) {
    try {
      const update_result = await this.voice_manager.update_voice_state(socket.id, data);

      if (update_result.success) {
        const user_state = this.voice_manager.get_user_voice_state(socket.id);
        
        if (user_state && user_state.current_channel) {
          // 브로드캐스팅: 같은 채널 사용자들에게 상태 변경 알림
          socket.to(server_id).emit('user_voice_state_updated', {
            user_id: update_result.data.user_id,
            nick_name: user_state.nick_name,
            user_name: user_state.user_name,
            profile_image_url: user_state.profile_image_url,
            voice_state: update_result.data.updated_state
          });
        }
      }

      socket.emit('voice_state_updated', update_result);
    } catch (error) {
      this.log_error('음성 상태 업데이트 오류', error);
      socket.emit('error', ResponseHelper.create_internal_error_response('음성 상태 업데이트'));
    }
  }

  // 마이크 토글
  async handle_toggle_mute(socket, server_id) {
    try {
      const current_state = this.voice_manager.get_user_voice_state(socket.id);
      if (!current_state || !current_state.current_channel) {
        socket.emit('error', ResponseHelper.create_error_response(
          'NOT_IN_CHANNEL',
          '음성 채널에 참가하지 않았습니다'
        ));
        return;
      }

      const new_mute_state = !current_state.is_muted;
      const update_result = await this.voice_manager.update_voice_state(socket.id, {
        is_muted: new_mute_state
      });

      if (update_result.success) {
        socket.emit('voice_state_updated', {
          type: 'mute_toggle',
          is_muted: new_mute_state,
          ...update_result
        });

        // 브로드캐스팅: 같은 채널의 다른 사용자들에게 마이크 상태 변경 알림
        socket.to(server_id).emit('user_voice_state_updated', {
          user_id: update_result.data.user_id,
          nick_name: current_state.nick_name,
          user_name: current_state.user_name,
          profile_image_url: current_state.profile_image_url,
          voice_state: update_result.data.updated_state,
          update_type: 'mute_toggle'
        });
      }
    } catch (error) {
      this.log_error('마이크 토글 처리 오류', error);
      socket.emit('error', ResponseHelper.create_internal_error_response('마이크 상태 변경'));
    }
  }

  // 듣기 토글 (스피커)
  async handle_toggle_deafen(socket, server_id) {
    try {
      const current_state = this.voice_manager.get_user_voice_state(socket.id);
      if (!current_state || !current_state.current_channel) {
        socket.emit('error', ResponseHelper.create_error_response(
          'NOT_IN_CHANNEL',
          '음성 채널에 참가하지 않았습니다'
        ));
        return;
      }

      const new_deafen_state = !current_state.is_deafened;
      const update_data = {
        is_deafened: new_deafen_state
      };
      
      if (new_deafen_state) {
        update_data.is_muted = true;
      }

      const update_result = await this.voice_manager.update_voice_state(socket.id, update_data);

      if (update_result.success) {
        socket.emit('voice_state_updated', {
          type: 'deafen_toggle',
          is_deafened: new_deafen_state,
          is_muted: update_data.is_muted || current_state.is_muted,
          ...update_result
        });

        // 브로드캐스팅: 같은 채널의 다른 사용자들에게 스피커 상태 변경 알림
        socket.to(server_id).emit('user_voice_state_updated', {
          user_id: update_result.data.user_id,
          nick_name: current_state.nick_name,
          user_name: current_state.user_name,
          profile_image_url: current_state.profile_image_url,
          voice_state: update_result.data.updated_state,
          update_type: 'deafen_toggle'
        });
      }
    } catch (error) {
      this.log_error('듣기 토글 처리 오류', error);
      socket.emit('error', ResponseHelper.create_internal_error_response('듣기 상태 변경'));
    }
  }

  // 채널 음성 상태 조회
  async handle_get_channel_voice_states(socket) {
    try {
      const socket_info = this.connected_sockets.get(socket.id);
      if (!socket_info) {
        socket.emit('channel_voice_states', ResponseHelper.create_error_response(
          'INVALID_SOCKET',
          '유효하지 않은 소켓입니다'
        ));
        return;
      }

      // 서버 ID 정규화
      const server_id = ValidationHelper.validate_server_id(socket_info.server_id);
      const channel_id = `voice_${server_id}`;
      
      // 채널 음성 상태 직접 조회
      const channel_voice_states = this.voice_manager.get_channel_voice_states(channel_id);
      
      socket.emit('channel_voice_states', ResponseHelper.create_success_response({
        channel_id: channel_id,
        server_id: server_id,
        voice_states: channel_voice_states,
        total_users: channel_voice_states.length
      }));
    } catch (error) {
      this.log_error('채널 음성 상태 조회 오류', error);
      socket.emit('channel_voice_states', ResponseHelper.create_internal_error_response('채널 음성 상태 조회'));
    }
  }

  // 연결 해제 처리
  handle_disconnect(socket) {
    try {
      const socket_info = this.connected_sockets.get(socket.id);
      const user_state = this.voice_manager.get_user_voice_state(socket.id);
      
      const channel_id = user_state?.current_channel;
      const user_id = user_state?.user_id;
      
      this.voice_manager.cleanup_user_resources(socket.id);
      this.voice_manager.leave_voice_channel(socket.id);
      
      if (channel_id && user_id) {
        this.io.to(channel_id).emit('user_left', {
          user_id: user_id,
          disconnect_reason: 'connection_closed'
        });
      }
      
      this.connected_sockets.delete(socket.id);
      
      this.log_info(`클라이언트 연결 해제: ${socket.id} (사용자: ${user_id || 'unknown'})`);
    } catch (error) {
      this.log_error('연결 해제 처리 오류', error);
    }
  }

  // 연결된 소켓 통계
  get_socket_statistics() {
    return {
      total_connections: this.connected_sockets.size,
      connections: Array.from(this.connected_sockets.values())
    };
  }
}

module.exports = { SocketManager };