import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  alias: string;
  email?: string;
  avatarUrl?: string;
  country?: string;
  city?: string;
  languages?: string[];
  age?: number;
  gender?: string;
  interests?: string[];
  stats?: {
    totalChats?: number;
    achievements?: string[];
    ranking?: number;
    totalTime?: number;
    countriesVisited?: string[];
    favoriteInterests?: string[];
  };
  badges?: string[];
  connectionQuality?: 'excellent' | 'good' | 'poor';
  isVerified?: boolean;
  createdAt: Date;
  updatedAt: Date;
  publicProfile: boolean;
}

const UserSchema = new Schema<IUser>({
  alias: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  avatarUrl: String,
  country: String,
  city: String,
  languages: [String],
  age: Number,
  gender: String,
  interests: [String],
  stats: {
    totalChats: { type: Number, default: 0 },
    achievements: [String],
    ranking: Number,
    totalTime: Number,
    countriesVisited: [String],
    favoriteInterests: [String],
  },
  badges: [String],
  connectionQuality: { type: String, enum: ['excellent', 'good', 'poor'] },
  isVerified: { type: Boolean, default: false },
  publicProfile: { type: Boolean, default: true },
}, {
  timestamps: true
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema); 