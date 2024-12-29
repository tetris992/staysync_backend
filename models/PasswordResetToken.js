import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema({
  hotelId: {
    type: String,
    required: true,
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL 인덱스 설정 (1시간 후 만료)
// expireAfterSeconds를 3600초(1시간)로 설정
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const PasswordResetToken = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);

export default PasswordResetToken;
