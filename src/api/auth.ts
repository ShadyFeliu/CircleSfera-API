import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Función auxiliar para validar email
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Función auxiliar para validar username
const isValidUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

// Registro de usuario
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password, nombre, alias } = req.body;

    // Validar campos requeridos
    if (!username || !email || !password || !nombre) {
      return res.status(400).json({ 
        error: 'Todos los campos son requeridos',
        field: !username ? 'username' : !email ? 'email' : !password ? 'password' : 'nombre'
      });
    }

    // Validar formato de email
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Formato de email inválido',
        field: 'email'
      });
    }

    // Validar formato de username
    if (!isValidUsername(username)) {
      return res.status(400).json({ 
        error: 'El nombre de usuario debe tener entre 3 y 20 caracteres y solo puede contener letras, números y guiones bajos',
        field: 'username'
      });
    }

    // Validar longitud de contraseña
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener al menos 6 caracteres',
        field: 'password'
      });
    }

    // Validar longitud de nombre
    if (nombre.trim().length < 2) {
      return res.status(400).json({ 
        error: 'El nombre debe tener al menos 2 caracteres',
        field: 'nombre'
      });
    }

    // Verificar si el email ya existe
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        error: 'El email ya está registrado',
        field: 'email'
      });
    }

    // Verificar si el username ya existe
    const existingUsername = await User.findOne({ username: username.toLowerCase() });
    if (existingUsername) {
      return res.status(400).json({ 
        error: 'El nombre de usuario ya está en uso',
        field: 'username'
      });
    }

    // Verificar si el alias ya existe
    const finalAlias = alias || username;
    const existingAlias = await User.findOne({ alias: finalAlias.toLowerCase() });
    if (existingAlias) {
      return res.status(400).json({ 
        error: 'El alias ya está en uso',
        field: 'alias'
      });
    }

    // Encriptar contraseña
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Crear nuevo usuario
    const newUser = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      nombre: nombre.trim(),
      alias: finalAlias.toLowerCase(),
      publicProfile: true,
      stats: {
        totalChats: 0,
        totalTime: 0,
        countriesVisited: [],
        achievements: []
      }
    });

    await newUser.save();

    // Generar token JWT
    const token = jwt.sign(
      { userId: newUser._id, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Devolver usuario sin contraseña
    const userResponse = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      nombre: newUser.nombre,
      alias: newUser.alias,
      publicProfile: newUser.publicProfile,
      stats: newUser.stats
    };

    res.status(201).json({
      user: userResponse,
      token,
      message: 'Usuario registrado exitosamente'
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Login de usuario (por email o username)
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    // Validar que se proporcione email o username
    if (!email && !username) {
      return res.status(400).json({ 
        error: 'Debes proporcionar email o nombre de usuario',
        field: 'email'
      });
    }

    if (!password) {
      return res.status(400).json({ 
        error: 'La contraseña es requerida',
        field: 'password'
      });
    }

    // Buscar usuario por email o username
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      user = await User.findOne({ username: username.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas',
        field: email ? 'email' : 'username'
      });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas',
        field: 'password'
      });
    }

    // Generar token JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Devolver usuario sin contraseña
    const userResponse = {
      _id: user._id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      alias: user.alias,
      publicProfile: user.publicProfile,
      stats: user.stats
    };

    res.json({
      user: userResponse,
      token,
      message: 'Login exitoso'
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Verificar token (middleware)
export const verifyToken = async (req: Request, res: Response, next: Function) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    (req as any).user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}; 