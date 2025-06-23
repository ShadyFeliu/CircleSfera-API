# Política de Seguridad

## Versiones Soportadas

Actualmente estamos dando soporte de seguridad a las siguientes versiones:

| Versión | Soportada          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reportar una Vulnerabilidad

Agradecemos los reportes de vulnerabilidades de seguridad. Por favor:

1. **NO** abras un issue público para reportar vulnerabilidades de seguridad.
2. Envía un reporte detallado a [circlesfera@codeqlick.com](mailto:circlesfera@codeqlick.com).

En tu reporte, incluye:
- Descripción detallada de la vulnerabilidad
- Pasos para reproducir el problema
- Posible impacto
- Sugerencias para la mitigación (si las tienes)

### Qué Esperar

Después de enviar un reporte:

1. Confirmaremos recepción dentro de 24 horas
2. Evaluaremos la vulnerabilidad y responderemos en 72 horas
3. Mantendremos comunicación sobre el progreso
4. Daremos crédito en el registro de cambios (si lo deseas)

## Prácticas de Seguridad

- Validación estricta de entrada de datos
- Rate limiting por IP
- Sanitización de datos en WebSocket
- Manejo seguro de conexiones WebRTC
- Monitoreo de actividad sospechosa
- Baneo automático por comportamiento malicioso

## Requisitos de Seguridad

- Node.js ≥ 18.0.0 (con las últimas actualizaciones de seguridad)
- HTTPS en producción
- Configuración segura de CORS
- Validación de origen de WebSocket
- Límites de conexiones por IP

## Directrices de Desarrollo Seguro

1. Mantener dependencias actualizadas
2. Usar únicamente paquetes verificados
3. Implementar rate limiting
4. Validar toda entrada de usuario
5. Mantener logs de seguridad
6. Seguir el principio de mínimo privilegio

## Agradecimientos

Agradecemos a todos los investigadores de seguridad que han contribuido a hacer CircleSfera más seguro.
