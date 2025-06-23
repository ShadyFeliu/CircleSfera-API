import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  throw new Error('Falta la variable de entorno MONGODB_URI');
}

export const connectToDatabase = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      // opciones recomendadas
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: 'circlesfera',
    } as any);
    console.log('✅ Conectado a MongoDB Atlas');
    return mongoose.connection;
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error);
    throw error;
  }
}; 