// Utils/ResponseHelper.cjs - 응답 관련 헬퍼
class ResponseHelper {
  static create_error_response(code, message, details = null) {
    return {
      success: false,
      error: {
        code: code,
        message: message,
        details: details,
        timestamp: new Date().toISOString()
      }
    };
  }

  static create_success_response(data = null, message = null) {
    const response = {
      success: true,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    if (message !== null) {
      response.message = message;
    }

    return response;
  }

  static create_paginated_response(data, total_count, page = 1, page_size = 10) {
    return this.create_success_response({
      items: data,
      pagination: {
        total_count: total_count,
        page: page,
        page_size: page_size,
        total_pages: Math.ceil(total_count / page_size),
        has_next: page * page_size < total_count,
        has_prev: page > 1
      }
    });
  }

  static create_validation_error_response(validation_errors) {
    return this.create_error_response(
      'VALIDATION_ERROR',
      '입력 데이터 검증에 실패했습니다',
      validation_errors
    );
  }

  static create_not_found_response(resource_name) {
    return this.create_error_response(
      'NOT_FOUND',
      `${resource_name}을(를) 찾을 수 없습니다`
    );
  }

  static create_permission_denied_response(action = null) {
    const message = action 
      ? `${action}에 대한 권한이 없습니다`
      : '권한이 없습니다';
    
    return this.create_error_response('PERMISSION_DENIED', message);
  }

  static create_internal_error_response(operation_name = null) {
    const message = operation_name 
      ? `${operation_name} 중 서버 오류가 발생했습니다`
      : '서버 내부 오류가 발생했습니다';
    
    return this.create_error_response('INTERNAL_ERROR', message);
  }
}

module.exports = { ResponseHelper };