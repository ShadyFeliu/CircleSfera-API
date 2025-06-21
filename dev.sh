#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Function to print colored output
print() {
    echo -e "${2}${1}${NC}"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print "🚫 Docker no está corriendo. Por favor, inicia Docker primero." "$RED"
        exit 1
    fi
}

# Function to show help
show_help() {
    print "\n🚀 CircleSfera Backend - Script de Desarrollo" "$BLUE"
    print "\nComandos disponibles:" "$GREEN"
    print "  start      - Inicia el servidor de desarrollo"
    print "  stop       - Detiene el servidor"
    print "  logs       - Muestra los logs del servidor"
    print "  restart    - Reinicia el servidor"
    print "  clean      - Limpia contenedores y builds"
    print "  build      - Construye la imagen de producción"
    print "  help       - Muestra esta ayuda\n"
}

# Start development server
start_dev() {
    print "🚀 Iniciando servidor de desarrollo..." "$BLUE"
    docker build -t circlesfera-backend:dev --target development .
    docker run -d --name circlesfera-backend \
        -p 3001:3001 \
        -v $(pwd):/app \
        -e PORT=3001 \
        -e ALLOWED_ORIGINS=http://localhost:3000 \
        circlesfera-backend:dev
    print "✅ Servidor iniciado en http://localhost:3001" "$GREEN"
}

# Stop server
stop_dev() {
    print "🛑 Deteniendo servidor..." "$BLUE"
    docker stop circlesfera-backend
    docker rm circlesfera-backend
}

# Show logs
show_logs() {
    print "📋 Mostrando logs..." "$BLUE"
    docker logs -f circlesfera-backend
}

# Clean environment
clean_env() {
    print "🧹 Limpiando entorno..." "$BLUE"
    docker stop circlesfera-backend 2>/dev/null || true
    docker rm circlesfera-backend 2>/dev/null || true
    docker rmi circlesfera-backend:dev 2>/dev/null || true
    rm -rf build
    rm -rf node_modules
    print "✅ Entorno limpiado!" "$GREEN"
}

# Build production image
build_prod() {
    print "🏗️ Construyendo imagen de producción..." "$BLUE"
    docker build -t circlesfera-backend:prod --target production .
    print "✅ Build completado!" "$GREEN"
}

# Main script logic
check_docker

case "$1" in
    "start")
        start_dev
        ;;
    "stop")
        stop_dev
        ;;
    "logs")
        show_logs
        ;;
    "restart")
        stop_dev
        start_dev
        ;;
    "clean")
        clean_env
        ;;
    "build")
        build_prod
        ;;
    "help"|*)
        show_help
        ;;
esac
