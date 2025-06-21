import { createServer } from "http";
import { Server } from "socket.io";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const httpServer = createServer((req, res) => {
  // Responder a GET y HEAD en la raíz
  if ((req.url === '/' && (req.method === 'GET' || req.method === 'HEAD'))) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Para HEAD no se envía body, solo headers
    if (req.method === 'GET') {
      res.end(JSON.stringify({
        message: 'CircleSfera API Server',
        status: 'running',
        timestamp: new Date().toISOString()
      }));
    } else {
      res.end();
    }
    return;
  }
  // Responder a GET y HEAD en /health
  if ((req.url === '/health' && (req.method === 'GET' || req.method === 'HEAD'))) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.method === 'GET') {
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString()
      }));
    } else {
      res.end();
    }
    return;
  }
});

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

const log = (message: string, data?: any) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

const userPairs = new Map<string, string>();
const userInterests = new Map<string, string[]>();
const interestQueues = new Map<string, string[]>();
const genericQueue: string[] = [];

const findPartnerFor = (socketId: string) => {
  const interests = userInterests.get(socketId) || [];
  let partnerId: string | undefined;

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

    io.to(socketId).emit("partner", { id: partnerId, initiator: true });
    io.to(partnerId).emit("partner", { id: socketId, initiator: false });
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

io.on("connection", (socket) => {
  log(`Usuario conectado: ${socket.id}`);
  
  socket.on("find_partner", ({ interests }: { interests: string[] }) => {
    log('Usuario buscando pareja', { socketId: socket.id, interests });
    userInterests.set(socket.id, interests || []);
    findPartnerFor(socket.id);
  });
  
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
  });

  socket.on('get_user_count', () => {
    const count = io.engine.clientsCount;
    socket.emit('user_count', count);
  });

  socket.on("end_chat", () => {
    endChat(socket.id);
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
