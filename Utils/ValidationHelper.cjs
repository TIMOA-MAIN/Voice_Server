// Utils/ValidationHelper.cjs - 유효성 검사 헬퍼
class ValidationHelper {
  static validate_required_params(params, required_fields) {
    const missing_fields = [];
    
    for (const field of required_fields) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        missing_fields.push(field);
      }
    }

    if (missing_fields.length > 0) {
      throw new Error(`필수 파라미터가 누락되었습니다: ${missing_fields.join(', ')}`);
    }

    return true;
  }

  static validate_server_id(server_id) {
    if (!server_id) {
      throw new Error('server_id는 필수입니다');
    }
    
    const parsed_id = parseInt(server_id);
    if (isNaN(parsed_id) || parsed_id <= 0) {
      throw new Error('유효하지 않은 server_id입니다');
    }
    
    return parsed_id;
  }

  // user_id 검증 수정 - 문자열로 처리
  static validate_user_id(user_id) {
    if (!user_id) {
      throw new Error('user_id는 필수입니다');
    }
    
    // 문자열로 처리하되 길이 제한
    const user_id_str = String(user_id).trim();
    if (user_id_str.length === 0 || user_id_str.length > 50) {
      throw new Error('유효하지 않은 user_id입니다 (1-50자 사이)');
    }
    
    return user_id_str;
  }

  static validate_user_data(user_data) {
    const required_fields = ['socket_id', 'user_id', 'server_id'];
    return this.validate_required_params(user_data, required_fields);
  }

  static validate_email(email) {
    if (!email || typeof email !== 'string') {
      throw new Error('이메일은 필수입니다');
    }

    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email_regex.test(email)) {
      throw new Error('유효하지 않은 이메일 형식입니다');
    }

    return email.toLowerCase().trim();
  }

  static validate_string_length(value, field_name, min_length = 1, max_length = 255) {
    if (!value || typeof value !== 'string') {
      throw new Error(`${field_name}은(는) 문자열이어야 합니다`);
    }

    const trimmed = value.trim();
    if (trimmed.length < min_length) {
      throw new Error(`${field_name}은(는) 최소 ${min_length}자 이상이어야 합니다`);
    }

    if (trimmed.length > max_length) {
      throw new Error(`${field_name}은(는) 최대 ${max_length}자까지 가능합니다`);
    }

    return trimmed;
  }

  static validate_numeric_range(value, field_name, min_value = null, max_value = null) {
    const parsed_value = parseInt(value);
    if (isNaN(parsed_value)) {
      throw new Error(`${field_name}은(는) 숫자여야 합니다`);
    }

    if (min_value !== null && parsed_value < min_value) {
      throw new Error(`${field_name}은(는) 최소 ${min_value} 이상이어야 합니다`);
    }

    if (max_value !== null && parsed_value > max_value) {
      throw new Error(`${field_name}은(는) 최대 ${max_value} 이하여야 합니다`);
    }

    return parsed_value;
  }

  static validate_boolean(value, field_name) {
    if (typeof value !== 'boolean') {
      throw new Error(`${field_name}은(는) boolean 값이어야 합니다`);
    }
    return value;
  }

  static validate_array(value, field_name, min_length = 0, max_length = null) {
    if (!Array.isArray(value)) {
      throw new Error(`${field_name}은(는) 배열이어야 합니다`);
    }

    if (value.length < min_length) {
      throw new Error(`${field_name}은(는) 최소 ${min_length}개 이상의 항목이 필요합니다`);
    }

    if (max_length !== null && value.length > max_length) {
      throw new Error(`${field_name}은(는) 최대 ${max_length}개까지 가능합니다`);
    }

    return value;
  }

  static validate_voice_state(voice_state) {
    const valid_state = {};
    
    if (voice_state.is_muted !== undefined) {
      valid_state.is_muted = this.validate_boolean(voice_state.is_muted, 'is_muted');
    }
    
    if (voice_state.is_deafened !== undefined) {
      valid_state.is_deafened = this.validate_boolean(voice_state.is_deafened, 'is_deafened');
    }

    return valid_state;
  }

  static validate_channel_settings(settings) {
    const valid_settings = {};

    if (settings.name !== undefined) {
      valid_settings.name = this.validate_string_length(settings.name, '채널명', 1, 50);
    }

    if (settings.max_users !== undefined) {
      valid_settings.max_users = this.validate_numeric_range(settings.max_users, '최대 사용자 수', 1, 99);
    }

    return valid_settings;
  }

  static sanitize_input(input) {
    if (typeof input === 'string') {
      return input.trim().replace(/[<>]/g, '');
    }
    return input;
  }

  static validate_socket_id(socket_id) {
    if (!socket_id || typeof socket_id !== 'string') {
      throw new Error('유효하지 않은 socket_id입니다');
    }
    return socket_id;
  }

  static validate_voice_state(voice_state) {
    const valid_state = {};
    
    if (voice_state.is_muted !== undefined) {
      valid_state.is_muted = this.validate_boolean(voice_state.is_muted, 'is_muted');
    }
    
    if (voice_state.is_deafened !== undefined) {
      valid_state.is_deafened = this.validate_boolean(voice_state.is_deafened, 'is_deafened');
      
      // 듣기 음소거 시 마이크도 자동으로 음소거
      if (valid_state.is_deafened && voice_state.is_muted === undefined) {
        valid_state.is_muted = true;
      }
    }

    return valid_state;
  }

  // 역할 검증 추가
  static validate_role(role) {
    const valid_roles = ['admin', 'moderator', 'member'];
    if (!valid_roles.includes(role)) {
      throw new Error('유효하지 않은 역할입니다');
    }
    return role;
  }
}

module.exports = { ValidationHelper };