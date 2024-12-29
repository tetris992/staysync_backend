// backend/models/HotelSettings.js

import mongoose from 'mongoose';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js'; 
import availableOTAs from '../config/otas.js'; // OTA 목록

// OTA 스키마
const otaSchema = new mongoose.Schema({
  name: { type: String, enum: availableOTAs, required: true }, 
  isActive: { type: Boolean, default: false },
});

// 각 OTA의 로그인 정보 스키마
const otaCredentialsSchema = new mongoose.Schema({
  expediaCredentials: {
    email: { type: String, required: false },
    password: { type: String, required: false },
  },
  agodaCredentials: {
    email: { type: String, required: false },
    password: { type: String, required: false },
  },
  // 다른 OTA에 대한 로그인 정보 추가 가능
}, { _id: false });

const RoomTypeSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    aliases: [{ type: String, lowercase: true }],
  },
  { _id: false }
); 

const HotelSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    hotelId: {
      type: String,
      required: true,
      unique: true,
    },
    totalRooms: {
      type: Number,
      required: true,
      default: 50,
      min: [1, '총 객실 수는 최소 1개 이상이어야 합니다.'],
    },
    roomTypes: {
      type: [RoomTypeSchema],
      default: defaultRoomTypes,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: '적어도 하나의 객실 타입이 필요합니다.',
      },
    },
    otas: {
      type: [otaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })), 
    },
    email: { type: String, required: true },
    address: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    
    // 각 OTA에 대한 로그인 정보 추가
    otaCredentials: {
      type: otaCredentialsSchema,
      default: {},
    },
  },
  { timestamps: true }
);

const HotelSettings = mongoose.model('HotelSettings', HotelSettingsSchema);

export default HotelSettings;
