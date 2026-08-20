const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  // Use latest mongoose driver options (they are defaults in newer versions, but good practice)
}).then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Number, default: Date.now }
});

const fileSchema = new mongoose.Schema({
  id: String,
  originalName: String,
  storageName: String,
  size: Number,
  mimetype: String,
  category: String
});

const transferSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  shortCode: { type: String, required: true },
  transferName: String,
  pinHash: String,
  failedPinAttempts: { type: Number, default: 0 },
  files: [fileSchema],
  createdAt: { type: Number, default: Date.now },
  expiresAt: { type: Number, required: true },
  totalSize: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  isSavedForLater: { type: Boolean, default: false },
  userId: String
});

const User = mongoose.model('User', userSchema);
const Transfer = mongoose.model('Transfer', transferSchema);

module.exports = {
  users: {
    findOne: async (query) => {
      return await User.findOne(query).lean();
    },
    insert: async (user) => {
      const newUser = new User(user);
      await newUser.save();
      return newUser.toObject();
    }
  },
  transfers: {
    get: async (id) => {
      return await Transfer.findOne({ id }).lean();
    },
    set: async (id, transferData) => {
      await Transfer.findOneAndUpdate({ id }, transferData, { upsert: true, new: true });
    },
    delete: async (id) => {
      await Transfer.deleteOne({ id });
    },
    getAll: async () => {
      return await Transfer.find().lean();
    },
    find: async (query) => {
      return await Transfer.find(query).lean();
    },
    saveAll: async () => { /* No-op for MongoDB */ }
  }
};
