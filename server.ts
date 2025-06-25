import { createServer } from "http";
import { Server } from "socket.io";
import express from 'express';
import * as dotenv from 'dotenv';
import { getMetrics } from './src/api/metrics';
import { connectToDatabase } from './src/utils/database';
import { createUser, getUserProfile, updateUserProfile, notifyUserEvent } from './src/api/user';
import User from './src/models/User';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// API Routes
app.get('/api/metrics', getMetrics);
app.post('/api/users', createUser);
app.get('/api/users/:alias', getUserProfile);
app.put('/api/users/:alias', updateUserProfile);
app.post('/api/users/:alias/event', notifyUserEvent);

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'CircleSfera API Server',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://circlesfera.com',
      'https://www.circlesfera.com',
      'https://circlesfera.vercel.app',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  }
});

const log = (message: string, data?: unknown) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

const userPairs = new Map<string, string>();
const userInterests = new Map<string, string[]>();
const interestQueues = new Map<string, string[]>();
const genericQueue: string[] = [];

// Set global para dispositivos únicos conectados
const deviceSet = new Set<string>();
// Map para almacenar deviceId por socket
const socketToDeviceId = new Map<string, string>();

const findPartnerFor = async (socketId: string) => {
  const interests = userInterests.get(socketId) || [];
  let partnerId: string | undefined;

  // Verificar si hay exactamente 2 dispositivos únicos conectados para emparejamiento automático
  const totalDevices = deviceSet.size;
  const totalSockets = io.engine.clientsCount;
  log(`[Emparejamiento] Dispositivos únicos: ${totalDevices}, Sockets activos: ${totalSockets}`);
  if (totalDevices === 2) {
    // Buscar la otra persona que no esté emparejada
    const allSockets = Array.from(io.sockets.sockets.keys());
    partnerId = allSockets.find(id => id !== socketId && !userPairs.has(id));
    
    if (partnerId) {
      log(`Emparejamiento automático: ${socketId} y ${partnerId} (2 dispositivos únicos)`);
      userPairs.set(socketId, partnerId);
      userPairs.set(partnerId, socketId);
      
      cleanUpUserFromQueues(partnerId);
      cleanUpUserFromQueues(socketId);

      const [userProfile, partnerProfile] = await Promise.all([
        User.findOne({ alias: socketId, publicProfile: true }).select('-email -__v'),
        User.findOne({ alias: partnerId, publicProfile: true }).select('-email -__v'),
      ]);
      io.to(socketId).emit("partner", { id: partnerId, initiator: true, profile: partnerProfile });
      io.to(partnerId).emit("partner", { id: socketId, initiator: false, profile: userProfile });
      return;
    }
  }

  // Lógica original de emparejamiento por intereses
  if (interests.length > 0) {
  for (const interest of interests) {
    const queue = interestQueues.get(interest);
    if (queue && queue.length > 0) {
        partnerId = queue.find(id => id !== socketId);
        if (partnerId) {
          const index = queue.indexOf(partnerId);
          queue.splice(index, 1);
          break;
        }
      }
    }
  }

  if (!partnerId && genericQueue.length > 0) {
    partnerId = genericQueue.find(id => id !== socketId);
    if (partnerId) {
      const index = genericQueue.indexOf(partnerId);
      genericQueue.splice(index, 1);
    }
  }

  if (partnerId) {
    log(`Emparejando ${socketId} y ${partnerId}`);
    userPairs.set(socketId, partnerId);
    userPairs.set(partnerId, socketId);
    
    cleanUpUserFromQueues(partnerId);

    const [userProfile, partnerProfile] = await Promise.all([
      User.findOne({ alias: socketId, publicProfile: true }).select('-email -__v'),
      User.findOne({ alias: partnerId, publicProfile: true }).select('-email -__v'),
    ]);
    io.to(socketId).emit("partner", { id: partnerId, initiator: true, profile: partnerProfile });
    io.to(partnerId).emit("partner", { id: socketId, initiator: false, profile: userProfile });
  } 
  else {
    log(`Usuario ${socketId} se pone a la espera con intereses:`, interests);
    cleanUpUserFromQueues(socketId); 
    if (interests.length > 0) {
      interests.forEach(interest => {
        if (!interestQueues.has(interest)) interestQueues.set(interest, []);
        const queue = interestQueues.get(interest)!;
        if (!queue.includes(socketId)) {
          queue.push(socketId);
        }
      });
    } else {
      if (!genericQueue.includes(socketId)) {
      genericQueue.push(socketId);
      }
    }
  }
};

const cleanUpUserFromQueues = (socketId: string) => {
    const genericIndex = genericQueue.indexOf(socketId);
  if (genericIndex > -1) {
    genericQueue.splice(genericIndex, 1);
    log(`Limpiado ${socketId} de la cola genérica.`);
  }

  interestQueues.forEach((queue, interest) => {
        const index = queue.indexOf(socketId);
    if (index > -1) {
      queue.splice(index, 1);
      log(`Limpiado ${socketId} de la cola de interés: ${interest}.`);
}
  });
};

const endChat = (socketId: string) => {
    const partnerId = userPairs.get(socketId);
    if (partnerId) {
    log(`Finalizando chat entre ${socketId} y ${partnerId}`);
      io.to(partnerId).emit("partner_disconnected");
      userPairs.delete(partnerId);
    }
    userPairs.delete(socketId);
};

// Función para verificar emparejamiento automático de usuarios sin emparejar
const checkAutoPairing = () => {
  const totalDevices = deviceSet.size;
  const totalSockets = io.engine.clientsCount;
  log(`[AutoPairing] Dispositivos únicos: ${totalDevices}, Sockets activos: ${totalSockets}`);
  if (totalDevices === 2) {
    const allSockets = Array.from(io.sockets.sockets.keys());
    const unpairedUsers = allSockets.filter(id => !userPairs.has(id));
    
    if (unpairedUsers.length === 2) {
      const [user1, user2] = unpairedUsers;
      log(`Emparejamiento automático detectado: ${user1} y ${user2} (2 dispositivos únicos)`);
      
      userPairs.set(user1, user2);
      userPairs.set(user2, user1);
      
      cleanUpUserFromQueues(user1);
      cleanUpUserFromQueues(user2);

      io.to(user1).emit("partner", { id: user2, initiator: true });
      io.to(user2).emit("partner", { id: user1, initiator: false });
    }
  }
};

function logEstadoEmparejamiento(contexto = '') {
  log(`[${contexto}] Estado actual:`);
  log(`  deviceSet: ${Array.from(deviceSet).join(', ')}`);
  log(`  userPairs: ${JSON.stringify(Array.from(userPairs.entries()))}`);
  log(`  interestQueues: ${JSON.stringify(Array.from(interestQueues.entries()))}`);
  log(`  genericQueue: ${JSON.stringify(genericQueue)}`);
  log(`  userInterests: ${JSON.stringify(Array.from(userInterests.entries()))}`);
}

function cleanUpUserFromAllQueues(socketId: string) {
  userPairs.delete(socketId);
  for (const queue of interestQueues.values()) {
    const idx = queue.indexOf(socketId);
    if (idx !== -1) queue.splice(idx, 1);
  }
  const idxGen = genericQueue.indexOf(socketId);
  if (idxGen !== -1) genericQueue.splice(idxGen, 1);
  userInterests.delete(socketId);
}

io.on("connection", (socket) => {
  const ip = socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'] || '';

  socket.on("find_partner", async ({ interests, deviceId: clientDeviceId }: { interests: string[]; deviceId?: string }) => {
    const deviceId = clientDeviceId || `${ip}|${userAgent}`;
    socketToDeviceId.set(socket.id, deviceId);
    deviceSet.add(deviceId);
    log(`[Conexión] deviceId añadido: ${deviceId} para socket ${socket.id}`);
    logEstadoEmparejamiento('find_partner');
    userInterests.set(socket.id, interests || []);
    await findPartnerFor(socket.id);
    setTimeout(checkAutoPairing, 1000);
  });

  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
  });

  socket.on('get_user_count', () => {
    socket.emit('user_count', deviceSet.size);
    log(`[Contador] deviceSet actual: ${Array.from(deviceSet).join(', ')}`);
    logEstadoEmparejamiento('get_user_count');
  });

  socket.on("end_chat", () => {
    endChat(socket.id);
    cleanUpUserFromAllQueues(socket.id);
    logEstadoEmparejamiento('end_chat');
    setTimeout(checkAutoPairing, 1000);
  });

  socket.on("disconnect", () => {
    log(`Usuario desconectado: ${socket.id}`);
    endChat(socket.id);
    cleanUpUserFromAllQueues(socket.id);
    
    // Limpiar deviceId del socket desconectado
    const deviceId = socketToDeviceId.get(socket.id);
    if (deviceId) {
      deviceSet.delete(deviceId);
      socketToDeviceId.delete(socket.id);
      log(`[Desconexión] deviceId eliminado: ${deviceId} del socket ${socket.id}`);
    }
    
    logEstadoEmparejamiento('disconnect');
    setTimeout(checkAutoPairing, 1000);
  });
});

const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await connectToDatabase();
    httpServer.listen(PORT, () => {
      log(`🚀 Servidor de señalización iniciado en puerto ${PORT}`);
      log(`🌍 CORS configurado para: ${process.env.ALLOWED_ORIGINS || 'dominios por defecto'}`);
    });
  } catch (error) {
    console.error('No se pudo conectar a la base de datos. El servidor no se iniciará.');
    process.exit(1);
  }
})();

export { httpServer, io };
