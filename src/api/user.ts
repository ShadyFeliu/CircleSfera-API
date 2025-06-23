import { Request, Response } from 'express';
import User from '../models/User';

// Crear usuario
export const createUser = async (req: Request, res: Response) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: 'Error al crear usuario', details: error });
  }
};

// Obtener perfil público de usuario por alias
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { alias } = req.params;
    const user = await User.findOne({ alias, publicProfile: true }).select('-email -__v');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado o perfil privado' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario', details: error });
  }
};

// Actualizar perfil de usuario (solo campos permitidos)
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { alias } = req.params;
    // Solo campos editables por el usuario
    const allowedFields = [
      'avatarUrl', 'country', 'city', 'languages', 'age', 'gender', 'interests', 'publicProfile'
    ];
    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    const user = await User.findOneAndUpdate(
      { alias },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-email -__v');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Error al actualizar perfil', details: error });
  }
};

// Notificar evento de usuario (actualización segura de estadísticas/logros)
export const notifyUserEvent = async (req: Request, res: Response) => {
  try {
    const { alias } = req.params;
    const { event, data } = req.body;
    const user = await User.findOne({ alias });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Lógica de actualización según tipo de evento
    switch (event) {
      case 'chat_finished':
        user.stats = user.stats || {};
        user.stats.totalChats = (user.stats.totalChats || 0) + 1;
        if (data?.duration) {
          user.stats.totalTime = (user.stats.totalTime || 0) + data.duration;
        }
        if (data?.country) {
          user.stats.countriesVisited = Array.from(new Set([...(user.stats.countriesVisited || []), data.country]));
        }
        break;
      case 'achievement_unlocked':
        user.stats = user.stats || {};
        user.stats.achievements = Array.from(new Set([...(user.stats.achievements || []), data.achievement]));
        break;
      // Puedes añadir más eventos aquí
      default:
        return res.status(400).json({ error: 'Evento no soportado' });
    }
    await user.save();
    res.json({ success: true, stats: user.stats });
  } catch (error) {
    res.status(400).json({ error: 'Error al procesar evento', details: error });
  }
}; 