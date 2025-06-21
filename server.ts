import { createServer } from "http";
import { Server } from "socket.io";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      "https://circlesfera.com",
      "https://www.circlesfera.com",
      "https://circlesfera.vercel.app",
      "http://localhost:3000",
      "http://192.168.1.37:3000"
    ],
    methods: ["GET", "POST"]
  }
});

// Rate limiting maps
const connectionCounts = new Map<string, number>();
const connectionTimestamps = new Map<string, number[]>();

// Constants from environment
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS_PER_IP || '100', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

// Rate limiting function
const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const timestamps = connectionTimestamps.get(ip) || [];
  
  // Clean old timestamps
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  connectionTimestamps.set(ip, validTimestamps);
  
  return validTimestamps.length >= RATE_LIMIT_MAX;
};

const interestQueues = new Map<string, string[]>();
const genericQueue: string[] = [];
const userPairs = new Map<string, string>();
const userInterests = new Map<string, string[]>();
const userSettings = new Map<string, { muted: boolean; videoOff: boolean; language?: string; ageFilter?: string }>();
const userReports = new Map<string, { count: number; reasons: string[] }>();
const bannedUsers = new Set<string>();

// Función para obtener el número total de usuarios online
const getOnlineUsersCount = () => {
  return io.engine.clientsCount;
};

// Función para emitir el conteo de usuarios a todos
const emitUserCount = () => {
  io.emit('user_count', getOnlineUsersCount());
};

// Función para verificar si un usuario está baneado
const isUserBanned = (socketId: string) => {
  return bannedUsers.has(socketId);
};

// Función para banear temporalmente a un usuario
const banUser = (socketId: string, duration: number = 300000) => { // 5 minutos por defecto
  bannedUsers.add(socketId);
  setTimeout(() => {
    bannedUsers.delete(socketId);
  }, duration);
};

const findPartnerFor = (socketId: string) => {
  const interests = userInterests.get(socketId) || [];
  const currentUserSettings = userSettings.get(socketId);
  let partnerId: string | undefined;

  // 1. Buscar en colas de intereses
  for (const interest of interests) {
    const queue = interestQueues.get(interest);
    if (queue && queue.length > 0) {
      // Verificar filtros de edad si están configurados
      const potentialPartner = queue[0];
      const partnerSettings = userSettings.get(potentialPartner);
      
      if (currentUserSettings?.ageFilter && partnerSettings?.ageFilter) {
        // Lógica simple de filtro de edad
        if (currentUserSettings.ageFilter === partnerSettings.ageFilter || 
            currentUserSettings.ageFilter === 'all' || 
            partnerSettings.ageFilter === 'all') {
          partnerId = queue.shift()!;
          break;
        }
      } else {
        partnerId = queue.shift()!;
        break;
      }
    }
  }

  // 2. Si no hay match en intereses, buscar en la cola genérica
  if (!partnerId && genericQueue.length > 0) {
    partnerId = genericQueue.shift()!;
  }

  // 3. Si encontramos pareja, los emparejamos
  if (partnerId) {
    console.log(`Emparejando ${socketId} y ${partnerId}`);
    userPairs.set(socketId, partnerId);
    userPairs.set(partnerId, socketId);
    
    // Limpiamos al partner de cualquier otra cola en la que estuviera
    cleanUpUserFromQueues(partnerId);

    io.to(socketId).emit("partner", { id: partnerId, initiator: true });
    io.to(partnerId).emit("partner", { id: partnerId, initiator: false });
  } 
  // 4. Si no, a la cola
  else {
    console.log(`Usuario ${socketId} se pone a la espera con intereses:`, interests);
    if (interests.length > 0) {
      interests.forEach(interest => {
        if (!interestQueues.has(interest)) interestQueues.set(interest, []);
        interestQueues.get(interest)!.push(socketId);
      });
    } else {
      genericQueue.push(socketId);
    }
  }
};

const cleanUpUserFromQueues = (socketId: string) => {
    // Eliminar de cola genérica
    const genericIndex = genericQueue.indexOf(socketId);
    if (genericIndex > -1) genericQueue.splice(genericIndex, 1);
    // Eliminar de todas las colas de intereses
    interestQueues.forEach(queue => {
        const index = queue.indexOf(socketId);
        if (index > -1) queue.splice(index, 1);
    });
}

const endChat = (socketId: string) => {
    const partnerId = userPairs.get(socketId);
    if (partnerId) {
      console.log(`Finalizando chat entre ${socketId} y ${partnerId}`);
      io.to(partnerId).emit("partner_disconnected");
      userPairs.delete(partnerId);
    }
    userPairs.delete(socketId);
}

io.on("connection", (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`Usuario conectado: ${socket.id} desde IP: ${clientIp}`);
  
  // Check rate limiting
  if (isRateLimited(clientIp)) {
    console.log(`Rate limit exceeded for IP: ${clientIp}`);
    socket.emit('error', { message: 'Rate limit exceeded. Please try again later.' });
    socket.disconnect();
    return;
  }
  
  // Update connection counts
  const currentConnections = connectionCounts.get(clientIp) || 0;
  if (currentConnections >= MAX_CONNECTIONS) {
    console.log(`Maximum connections exceeded for IP: ${clientIp}`);
    socket.emit('error', { message: 'Maximum connections exceeded.' });
    socket.disconnect();
    return;
  }
  connectionCounts.set(clientIp, currentConnections + 1);
  
  // Update rate limiting
  const timestamps = connectionTimestamps.get(clientIp) || [];
  timestamps.push(Date.now());
  connectionTimestamps.set(clientIp, timestamps);
  
  // Verificar si el usuario está baneado
  if (isUserBanned(socket.id)) {
    socket.emit('banned', { message: 'Tu cuenta ha sido suspendida temporalmente por violar las reglas de la comunidad.' });
    socket.disconnect();
    return;
  }
  
  // Inicializar configuración del usuario
  userSettings.set(socket.id, { muted: false, videoOff: false });
  
  // Emitir conteo actualizado
  emitUserCount();

  socket.on('find_partner', ({ interests, ageFilter }: { interests: string[]; ageFilter?: string }) => {
    userInterests.set(socket.id, interests);
    if (ageFilter) {
      const currentSettings = userSettings.get(socket.id);
      userSettings.set(socket.id, { ...currentSettings!, ageFilter });
    }
    findPartnerFor(socket.id);
  });
  
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
  });

  socket.on('toggle_mute', (muted: boolean) => {
    userSettings.set(socket.id, { ...userSettings.get(socket.id)!, muted });
    const partnerId = userPairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_muted', muted);
    }
  });

  socket.on('toggle_video', (videoOff: boolean) => {
    userSettings.set(socket.id, { ...userSettings.get(socket.id)!, videoOff });
    const partnerId = userPairs.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_video_off', videoOff);
    }
  });

  socket.on('report_user', (data) => {
    const partnerId = userPairs.get(socket.id);
    if (partnerId) {
      console.log(`Usuario ${socket.id} reportó a ${partnerId}: ${data.reason}`);
      
      // Actualizar contador de reportes del usuario reportado
      const currentReports = userReports.get(partnerId) || { count: 0, reasons: [] };
      currentReports.count += 1;
      currentReports.reasons.push(data.reason);
      userReports.set(partnerId, currentReports);
      
      // Si un usuario tiene más de 3 reportes, banearlo temporalmente
      if (currentReports.count >= 3) {
        console.log(`Usuario ${partnerId} baneado temporalmente por múltiples reportes`);
        banUser(partnerId, 600000); // 10 minutos
        io.to(partnerId).emit('banned', { message: 'Tu cuenta ha sido suspendida temporalmente por múltiples reportes.' });
      }
    }
  });

  socket.on('get_user_count', () => {
    socket.emit('user_count', getOnlineUsersCount());
  });

  socket.on("disconnect", () => {
    const clientIp = socket.handshake.address;
    console.log(`Usuario desconectado: ${socket.id}`);
    
    // Update connection counts
    const connections = connectionCounts.get(clientIp) || 1;
    connectionCounts.set(clientIp, Math.max(0, connections - 1));
    
    endChat(socket.id);
    cleanUpUserFromQueues(socket.id);
    userInterests.delete(socket.id);
    userSettings.delete(socket.id);
    emitUserCount();
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor de señalización escuchando en el puerto ${PORT}`);
  console.log(`🌍 CORS configurado para: ${process.env.ALLOWED_ORIGINS || 'dominios por defecto'}`);
  console.log(`🔒 Seguridad: Máx. ${MAX_CONNECTIONS} conexiones por IP, límite de ${RATE_LIMIT_MAX} peticiones cada ${RATE_LIMIT_WINDOW/1000}s`);
});
