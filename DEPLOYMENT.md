# Guía de Despliegue - CircleSfera Backend

## Requisitos Previos

- Node.js ≥ 18.0.0
- npm o pnpm
- SSL/TLS certificado para producción
- Servidor con al menos 1GB RAM
- Dominio configurado (para producción)

## Configuración de Entorno

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/ShadyFeliu/CircleSfera-Backend.git
   cd CircleSfera-Backend
   ```

2. Instalar dependencias:
   ```bash
   npm ci --production
   ```

3. Configurar variables de entorno:
   ```bash
   cp .env.example .env
   ```

   Editar `.env` con los valores correctos:
   ```env
   # Configuración del Servidor
   PORT=3001
   NODE_ENV=production
   
   # Orígenes Permitidos
   ALLOWED_ORIGINS=https://circlesfera.com,https://www.circlesfera.com
   
   # Límites y Seguridad
   MAX_CONNECTIONS_PER_IP=100
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=100
   
   # WebRTC (opcional)
   TURN_URLS=turn:your-turn-server.com:3478
   TURN_USERNAME=your-username
   TURN_CREDENTIAL=your-credential
   ```

## Despliegue en Producción

### Usando Docker

1. Construir imagen:
   ```bash
   docker build -t circlesfera-backend:prod --target production .
   ```

2. Ejecutar contenedor:
   ```bash
   docker run -d \
     --name circlesfera-backend \
     -p 3001:3001 \
     --env-file .env \
     circlesfera-backend:prod
   ```

### Despliegue Manual

1. Construir proyecto:
   ```bash
   npm run build
   ```

2. Iniciar servidor:
   ```bash
   npm start
   ```

### Usando PM2

1. Instalar PM2:
   ```bash
   npm install -g pm2
   ```

2. Iniciar aplicación:
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

## Configuración de Nginx (Reverse Proxy)

```nginx
server {
    listen 443 ssl http2;
    server_name api.circlesfera.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket configuration
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

## Monitoreo y Logs

### Configuración de Logs

1. Crear directorio de logs:
   ```bash
   mkdir -p /var/log/circlesfera
   ```

2. Configurar rotación de logs:
   ```bash
   sudo nano /etc/logrotate.d/circlesfera
   ```
   
   ```
   /var/log/circlesfera/*.log {
       daily
       rotate 14
       compress
       delaycompress
       notifempty
       create 0640 www-data adm
       sharedscripts
       postrotate
           systemctl reload circlesfera
       endscript
   }
   ```

### Monitoreo

- Configurar alertas en PM2
- Implementar healthchecks
- Monitorear métricas de WebSocket
- Revisar logs de seguridad

## Mantenimiento

### Actualizaciones

1. Detener servicio:
   ```bash
   pm2 stop circlesfera-backend
   ```

2. Actualizar código:
   ```bash
   git pull
   npm ci --production
   npm run build
   ```

3. Reiniciar servicio:
   ```bash
   pm2 restart circlesfera-backend
   ```

### Backup

Programar backups diarios de:
- Configuración
- Logs
- Datos de métricas

## Solución de Problemas

### Problemas Comunes

1. **Error de conexión WebSocket**
   - Verificar configuración de Nginx
   - Comprobar firewall
   - Validar certificados SSL

2. **Alto uso de memoria**
   - Revisar límites de conexiones
   - Verificar memory leaks
   - Ajustar garbage collection

3. **Latencia alta**
   - Verificar configuración de TURN
   - Comprobar red
   - Revisar logs de WebRTC

## Contacto y Soporte

Para soporte técnico:
- Email: support@circlesfera.com
- GitHub Issues: Para bugs y features
- Documentación: [docs.circlesfera.com](https://docs.circlesfera.com)
