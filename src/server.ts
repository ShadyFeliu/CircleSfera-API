import { createServer } from "http";
import { Server } from "socket.io";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const httpServer = createServer();
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

// Basic logging
const log = (message: string, data?: any) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

// User management
const userPairs = new Map<string, string>();
const userInterests = new Map<string, string[]>();
const interestQueues = new Map<string, string[]>();
const genericQueue: string[] = [];

// Find partner logic
const findPartnerFor = (socketId: string) => {
  const interests = userInterests.get(socketId) || [];
  let partnerId: string | undefined;

  // 1. Buscar en colas de intereses
  for (const interest of interests) {
    const queue = interestQueues.get(interest);
    if (queue && queue.length > 0) {
      partnerId = queue.shift()!;
      break;
    }
  }

  // 2. Si no hay match en intereses, buscar en la cola genérica
  if (!partnerId && genericQueue.length > 0) {
    partnerId = genericQueue.shift()!;
  }

  // 3. Si encontramos pareja, los emparejamos
  if (partnerId) {
    log(`Emparejando ${socketId} y ${partnerId}`);
    userPairs.set(socketId, partnerId);
    userPairs.set(partnerId, socketId);
    
    // Limpiar al partner de cualquier otra cola
    cleanUpUserFromQueues(partnerId);

    io.to(socketId).emit("partner", { id: partnerId, initiator: true });
    io.to(partnerId).emit("partner", { id: partnerId, initiator: false });
  } 
  // 4. Si no, a la cola
  else {
    log(`Usuario ${socketId} se pone a la espera con intereses:`, interests);
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
  const genericIndex = genericQueue.indexOf(socketId);
  if (genericIndex > -1) genericQueue.splice(genericIndex, 1);
  interestQueues.forEach(queue => {
    const index = queue.indexOf(socketId);
    if (index > -1) queue.splice(index, 1);
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

io.on("connection", (socket) => {
  log(`Usuario conectado: ${socket.id}`);
  
  socket.on("find_partner", ({ interests, ageFilter }: { interests: string[]; ageFilter?: string }) => {
    log('Usuario buscando pareja', { socketId: socket.id, interests, ageFilter });
    userInterests.set(socket.id, interests);
    findPartnerFor(socket.id);
  });
  
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
  });

  socket.on('get_user_count', () => {
    const count = io.engine.clientsCount;
    socket.emit('user_count', count);
  });

  socket.on("disconnect", () => {
    log(`Usuario desconectado: ${socket.id}`);
    endChat(socket.id);
    cleanUpUserFromQueues(socket.id);
    userInterests.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  httpServer.listen(PORT, () => {
    log(`🚀 Servidor de señalización iniciado en puerto ${PORT}`);
    log(`🌍 CORS configurado para: ${process.env.ALLOWED_ORIGINS || 'dominios por defecto'}`);
  });
}

export { httpServer, io };
