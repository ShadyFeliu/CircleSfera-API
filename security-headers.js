// Configuración de headers de seguridad para producción
module.exports = {
  // Headers de seguridad básicos
  securityHeaders: {
    'X-DNS-Prefetch-Control': 'on',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=self, microphone=self, geolocation=none',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  },

  // Configuración de CORS para WebSocket
  corsOptions: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://circlesfera.com',
      'https://www.circlesfera.com',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 86400 // 24 horas
  },

  // Rate limiting
  rateLimiting: {
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // límite por IP
    message: 'Demasiadas peticiones, por favor intente más tarde'
  },

  // Configuración de cookies seguras
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
};
