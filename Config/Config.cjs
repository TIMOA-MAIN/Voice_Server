// Config.cjs
class Config {
  static get SERVER_CONFIG() {
    return {
      port: process.env.PORT || 8007,
      host: process.env.HOST || '0.0.0.0',
      env: process.env.NODE_ENV || 'development'
    }
  }

  static get DB_CONFIG() {
    return {
      server: process.env.DB_SERVER || '203.234.12.219',
      database: process.env.DB_NAME || 'bit41',
      user: process.env.DB_USER || 'bit',
      password: process.env.DB_PASSWORD || 'bit41',
      port: parseInt(process.env.DB_PORT) || 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 30000
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    }
  }

  static get MEDIASOUP_CONFIG() {
    return {
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      worker: {
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
        logLevel: 'warn',
      }
    }
  }

  static get CORS_CONFIG() {
    return {
      origin: '*',
      methods: ["GET", "POST"],
      credentials: true
    }
  }
}

module.exports = { Config };