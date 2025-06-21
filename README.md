# CircleSfera Backend

Servidor de señalización WebSocket para la aplicación CircleSfera, que permite a usuarios conectarse a través de WebRTC para chatear en tiempo real.

## Funcionalidades

- Emparejamiento de usuarios basado en intereses
- Señalización WebRTC
- Filtrado por rango de edad
- Sistema de reporte de usuarios
- Monitoreo y métricas del sistema
- Manejo avanzado de errores y recuperación
- Seguridad y validación de orígenes

## Configuración

### Variables de Entorno

Crea un archivo `.env` con las siguientes variables:

```bash
# Configuración del Servidor
PORT=3001
NODE_ENV=development

# Orígenes Permitidos (separados por comas)
ALLOWED_ORIGINS=http://localhost:3000,https://circlesfera.com

# Límites y Seguridad
MAX_CONNECTIONS_PER_IP=100
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# WebRTC (opcional)
TURN_URLS=turn:your-turn-server.com:3478
TURN_USERNAME=username
TURN_CREDENTIAL=password

# Logs
LOG_LEVEL=info

# Metrics and Monitoring
METRICS_API_KEY=your-api-key-here
```

### Instalación

```bash
# Instalación de dependencias
npm install

# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Monitoring & Metrics

### Available Endpoints

#### Health Check
```http
GET /health
```
Returns basic health status of the server.

#### System Metrics
```http
GET /api/metrics
```
Requires authentication via `x-api-key` header.
Query parameters:
- `timeRange`: '1h', '6h', '24h', '7d' (default: '24h')

#### Recent Errors
```http
GET /api/metrics/errors
```
Requires authentication via `x-api-key` header.
Query parameters:
- `minutes`: Number of minutes to look back (default: 15)

### Sample Response

```json
{
  "timestamp": "2024-02-21T12:00:00Z",
  "timeRange": "24h",
  "system": {
    "uptime": 86400,
    "memory": {
      "total": 8589934592,
      "free": 4294967296,
      "used": 4294967296,
      "percentage": 50
    },
    "cpu": {
      "load": [2.1, 1.8, 1.5],
      "cores": 8
    }
  },
  "websocket": {
    "connections": {
      "current": 50,
      "total": 1000,
      "peak": 100
    },
    "stats": {
      "activeConnections": 50,
      "totalMessages": 5000,
      "errors": 10
    }
  },
  "logs": {
    "total": 10000,
    "byLevel": {
      "error": 50,
      "warn": 200,
      "info": 8750,
      "http": 900,
      "debug": 100
    }
  }
}
```

## WebSocket Events

### Client to Server

- `find_partner`: Busca un compañero de chat basado en intereses
- `ice_candidate`: Envía un candidato ICE al par
- `session_description`: Envía una descripción de sesión SDP
- `next_partner`: Finaliza el chat actual y busca un nuevo compañero
- `report_user`: Reporta un usuario por comportamiento inapropiado

### Server to Client

- `partner`: Notifica que se ha encontrado un compañero
- `ice_candidate`: Recibe un candidato ICE del par
- `session_description`: Recibe una descripción de sesión SDP
- `partner_disconnected`: El compañero se ha desconectado
- `error`: Notificación de error

## Contribución

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para más detalles.

## Licencia

MIT License - Vea [LICENSE](LICENSE) para más detalles.

# CircleSfera Backend - Servidor de Señalización

Servidor de señalización para CircleSfera, implementando WebSocket y manejo de conexiones WebRTC.

## 🚀 Características

- 🔄 Señalización WebRTC
- 👥 Emparejamiento de usuarios
- 🎯 Filtrado por intereses
- 🔒 Sistema de seguridad
- 📊 Métricas y monitoreo

## 🛠️ Tecnologías

- Node.js con TypeScript
- Socket.IO para WebSockets
- Sistema de colas en memoria
- Rate limiting
- Gestión de conexiones

## 📋 Requisitos

- Node.js ≥ 18.0.0
- npm o pnpm

## 🚀 Instalación

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/ShadyFeliu/CircleSfera-Backend.git
   cd CircleSfera-Backend
   ```

2. Instalar dependencias:
   ```bash
   npm install
   # o
   pnpm install
   ```

3. Crear archivo .env:
   ```
   PORT=3001
   ALLOWED_ORIGINS=http://localhost:3000
   MAX_CONNECTIONS_PER_IP=100
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. Iniciar el servidor:
   ```bash
   npm run dev
   # o
   pnpm dev
   ```

## ⚙️ Configuración

### Variables de Entorno

- `PORT`: Puerto del servidor (default: 3001)
- `ALLOWED_ORIGINS`: Orígenes permitidos para CORS
- `MAX_CONNECTIONS_PER_IP`: Límite de conexiones por IP
- `RATE_LIMIT_WINDOW_MS`: Ventana de tiempo para rate limiting
- `RATE_LIMIT_MAX_REQUESTS`: Máximo de peticiones en la ventana

## 🔒 Seguridad

- Rate limiting por IP
- Validación de origen (CORS)
- Sistema de baneos temporales
- Monitoreo de conexiones
- Validación de payloads

## 📈 Monitoreo

- Métricas de conexiones
- Logs de eventos
- Estadísticas de emparejamiento
- Registro de errores

## 🤝 Contribuir

Ver instrucciones en el README principal del proyecto.

## 📝 Licencia

Este proyecto está bajo la Licencia MIT.

## 👥 Autores

- **ShadyFeliu** - *Trabajo inicial*
