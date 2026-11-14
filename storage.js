const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 2500,
  connectTimeoutMS: 2500,
  socketTimeoutMS: 5000
}).then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

const isDbConnected = () => mongoose.connection && mongoose.connection.readyState === 1;

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
  shortCode: { type: String, required: true, index: true },
  transferName: String,
  pinHash: String,
  failedPinAttempts: { type: Number, default: 0 },
  files: [fileSchema],
  links: { type: [String], default: [] },
  folderStructure: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Number, default: Date.now },
  expiresAt: { type: Number, required: true },
  totalSize: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  isSavedForLater: { type: Boolean, default: false },
  isOffline: { type: Boolean, default: false },
  proximity: { type: mongoose.Schema.Types.Mixed, default: null },
  userId: String,
  userEmail: String,
  status: { type: String, default: 'ACTIVE' }
});

const analyticsSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: 'global' },
  totalTransfersCreated: { type: Number, default: 0 },
  totalFilesUploaded: { type: Number, default: 0 },
  totalDownloads: { type: Number, default: 0 },
  uniqueDevices: { type: [String], default: [] },
  resetMigration: { type: String, default: '' }
});

const User = mongoose.model('User', userSchema);
const Transfer = mongoose.model('Transfer', transferSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

const dailyMetricSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // 'YYYY-MM-DD'
  timestamp: { type: Number, required: true }, // Midnight timestamp
  transfers: { type: Number, default: 0 },
  cumulativeTransfers: { type: Number, default: 0 },
  files: { type: Number, default: 0 },
  cumulativeFiles: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  cumulativeDownloads: { type: Number, default: 0 },
  visitors: { type: Number, default: 0 },
  cumulativeVisitors: { type: Number, default: 0 },
  visitorDevices: { type: [String], default: [] },
  activeTransfers: { type: Number, default: 0 },
  storageBytes: { type: Number, default: 0 },
  hourly: {
    type: mongoose.Schema.Types.Mixed,
    default: () => {
      const h = {};
      for (let i = 0; i < 24; i++) {
        h[i] = { transfers: 0, files: 0, downloads: 0, visitors: 0, storageBytes: 0 };
      }
      return h;
    }
  }
});
const DailyMetric = mongoose.model('DailyMetric', dailyMetricSchema);

// In-memory transfer and counter cache for offline/LAN operations
const memoryTransfers = new Map();
const memoryCounters = {};

module.exports = {
  users: {
    findOne: async (query) => {
      if (!isDbConnected()) return null;
      try {
        return await User.findOne(query).lean();
      } catch (_) { return null; }
    },
    find: async (query) => {
      if (!isDbConnected()) return [];
      try {
        return await User.find(query || {}).lean();
      } catch (_) { return []; }
    },
    insert: async (user) => {
      if (!isDbConnected()) return user;
      try {
        const newUser = new User(user);
        await newUser.save();
        return newUser.toObject();
      } catch (_) { return user; }
    }
  },
  transfers: {
    get: async (id) => {
      if (!id) return null;
      if (memoryTransfers.has(id)) {
        return memoryTransfers.get(id);
      }
      try {
        if (mongoose.connection.readyState === 1) {
          const doc = await Transfer.findOne({ id }).lean();
          if (doc) {
            memoryTransfers.set(id, doc);
            return doc;
          }
        }
      } catch (_) {}
      return null;
    },
    set: async (id, transferData) => {
      if (!id) return;
      memoryTransfers.set(id, transferData);
      try {
        if (mongoose.connection.readyState === 1) {
          await Transfer.findOneAndUpdate({ id }, transferData, { upsert: true, returnDocument: 'after' });
        }
      } catch (err) {
        console.warn(`[Storage] MongoDB set failed for ${id} (in-memory offline cache active):`, err.message);
      }
    },
    delete: async (id) => {
      if (!id) return;
      memoryTransfers.delete(id);
      try {
        if (mongoose.connection.readyState === 1) {
          await Transfer.deleteOne({ id });
        }
      } catch (_) {}
    },
    getAll: async () => {
      const allMap = new Map(memoryTransfers);
      try {
        if (mongoose.connection.readyState === 1) {
          const docs = await Transfer.find().lean();
          docs.forEach(d => allMap.set(d.id, d));
        }
      } catch (_) {}
      return Array.from(allMap.values());
    },
    find: async (query) => {
      try {
        if (mongoose.connection.readyState === 1) {
          return await Transfer.find(query).lean();
        }
      } catch (_) {}
      return Array.from(memoryTransfers.values());
    },
    findByActiveCode: async (code) => {
      if (!code) return null;
      const upper = String(code).trim().toUpperCase();
      const now = Date.now();

      // Check in-memory transfers first (instant)
      for (const t of memoryTransfers.values()) {
        if (t.shortCode === upper && t.status !== 'EXPIRED' && t.expiresAt > now) {
          return t;
        }
      }

      try {
        if (mongoose.connection.readyState === 1) {
          const doc = await Transfer.findOne({
            shortCode: upper,
            status: { $ne: 'EXPIRED' },
            expiresAt: { $gt: now }
          }).lean();
          if (doc) {
            memoryTransfers.set(doc.id, doc);
            return doc;
          }
        }
      } catch (_) {}
      return null;
    },
    saveAll: async () => { /* No-op for MongoDB */ },
    getNextSequence: async (timeBlockId) => {
      try {
        if (mongoose.connection.readyState === 1) {
          const counter = await Counter.findByIdAndUpdate(
            timeBlockId,
            { $inc: { seq: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          if (counter && typeof counter.seq === 'number') {
            return counter.seq;
          }
        }
      } catch (_) {}
      memoryCounters[timeBlockId] = (memoryCounters[timeBlockId] || 0) + 1;
      return memoryCounters[timeBlockId];
    }
  },
  analytics: {
    get: async () => {
      if (!isDbConnected()) return { id: 'global', totalTransfersCreated: 0, totalFilesUploaded: 0, totalDownloads: 0, uniqueDevices: [] };
      try {
        let stats = await Analytics.findOne({ id: 'global' }).lean();
        if (!stats) {
          const newStats = new Analytics({ id: 'global' });
          await newStats.save();
          return newStats.toObject();
        }
        return stats;
      } catch (_) {
        return { id: 'global', totalTransfersCreated: 0, totalFilesUploaded: 0, totalDownloads: 0, uniqueDevices: [] };
      }
    },
    set: async (statsData) => {
      if (!isDbConnected()) return;
      try {
        await Analytics.findOneAndUpdate({ id: 'global' }, statsData, { upsert: true });
      } catch (_) {}
    }
  },
  dailyMetrics: {
    getToday: async (dateStr, initialCumulative = {}) => {
      if (!isDbConnected()) return null;
      try {
        let doc = await DailyMetric.findOne({ date: dateStr }).lean();
        if (!doc) {
          const now = new Date();
          const startOfDay = new Date(now).setHours(0, 0, 0, 0);
          const newDoc = new DailyMetric({
            date: dateStr,
            timestamp: startOfDay,
            transfers: 0,
            cumulativeTransfers: initialCumulative.transfers || 0,
            files: 0,
            cumulativeFiles: initialCumulative.files || 0,
            downloads: 0,
            cumulativeDownloads: initialCumulative.downloads || 0,
            visitors: 0,
            cumulativeVisitors: initialCumulative.visitors || 0,
            activeTransfers: initialCumulative.activeTransfers || 0,
            storageBytes: 0,
            visitorDevices: []
          });
          await newDoc.save();
          return newDoc.toObject();
        }
        return doc;
      } catch (_) {
        return null;
      }
    },
    recordVisit: async (dateStr, deviceId, currentTotals) => {
      if (!isDbConnected()) return;
      try {
        let doc = await DailyMetric.findOne({ date: dateStr });
        if (!doc) {
          const now = new Date();
          const startOfDay = new Date(now).setHours(0, 0, 0, 0);
          doc = new DailyMetric({
            date: dateStr,
            timestamp: startOfDay,
            transfers: 0,
            cumulativeTransfers: currentTotals.transfers || 0,
            files: 0,
            cumulativeFiles: currentTotals.files || 0,
            downloads: 0,
            cumulativeDownloads: currentTotals.downloads || 0,
            visitors: 0,
            cumulativeVisitors: currentTotals.visitors || 0,
            activeTransfers: currentTotals.activeTransfers || 0,
            storageBytes: 0,
            visitorDevices: []
          });
        }
        const hour = new Date().getHours();
        if (!doc.visitorDevices.includes(deviceId)) {
          doc.visitorDevices.push(deviceId);
          doc.visitors = doc.visitorDevices.length;
          doc.cumulativeVisitors = currentTotals.visitors || doc.cumulativeVisitors;
          if (!doc.hourly) doc.hourly = {};
          if (!doc.hourly[hour]) doc.hourly[hour] = { transfers: 0, files: 0, downloads: 0, visitors: 0, storageBytes: 0 };
          doc.hourly[hour].visitors = (doc.hourly[hour].visitors || 0) + 1;
          doc.markModified('hourly');
          doc.markModified('visitorDevices');
          await doc.save();
        }
      } catch (e) {
        console.error('[dailyMetrics.recordVisit Error]:', e.message);
      }
    },
    recordTransfer: async (dateStr, { filesCount = 0, storageBytes = 0, currentTotals, activeCount = 0 }) => {
      if (!isDbConnected()) return;
      try {
        let doc = await DailyMetric.findOne({ date: dateStr });
        if (!doc) {
          const now = new Date();
          const startOfDay = new Date(now).setHours(0, 0, 0, 0);
          doc = new DailyMetric({
            date: dateStr,
            timestamp: startOfDay,
            transfers: 0,
            cumulativeTransfers: currentTotals.transfers || 0,
            files: 0,
            cumulativeFiles: currentTotals.files || 0,
            downloads: 0,
            cumulativeDownloads: currentTotals.downloads || 0,
            visitors: 0,
            cumulativeVisitors: currentTotals.visitors || 0,
            activeTransfers: currentTotals.activeTransfers || 0,
            storageBytes: 0,
            visitorDevices: []
          });
        }
        const hour = new Date().getHours();
        doc.transfers += 1;
        doc.cumulativeTransfers = currentTotals.transfers || doc.cumulativeTransfers;
        doc.files += filesCount;
        doc.cumulativeFiles = currentTotals.files || doc.cumulativeFiles;
        doc.storageBytes += storageBytes;
        doc.activeTransfers = activeCount;
        if (!doc.hourly) doc.hourly = {};
        if (!doc.hourly[hour]) doc.hourly[hour] = { transfers: 0, files: 0, downloads: 0, visitors: 0, storageBytes: 0 };
        doc.hourly[hour].transfers = (doc.hourly[hour].transfers || 0) + 1;
        doc.hourly[hour].files = (doc.hourly[hour].files || 0) + filesCount;
        doc.hourly[hour].storageBytes = (doc.hourly[hour].storageBytes || 0) + storageBytes;
        doc.markModified('hourly');
        await doc.save();
      } catch (e) {
        console.error('[dailyMetrics.recordTransfer Error]:', e.message);
      }
    },
    recordDownload: async (dateStr, { currentTotals }) => {
      if (!isDbConnected()) return;
      try {
        let doc = await DailyMetric.findOne({ date: dateStr });
        if (!doc) {
          const now = new Date();
          const startOfDay = new Date(now).setHours(0, 0, 0, 0);
          doc = new DailyMetric({
            date: dateStr,
            timestamp: startOfDay,
            transfers: 0,
            cumulativeTransfers: currentTotals.transfers || 0,
            files: 0,
            cumulativeFiles: currentTotals.files || 0,
            downloads: 0,
            cumulativeDownloads: currentTotals.downloads || 0,
            visitors: 0,
            cumulativeVisitors: currentTotals.visitors || 0,
            activeTransfers: currentTotals.activeTransfers || 0,
            storageBytes: 0,
            visitorDevices: []
          });
        }
        const hour = new Date().getHours();
        doc.downloads += 1;
        doc.cumulativeDownloads = currentTotals.downloads || doc.cumulativeDownloads;
        if (!doc.hourly) doc.hourly = {};
        if (!doc.hourly[hour]) doc.hourly[hour] = { transfers: 0, files: 0, downloads: 0, visitors: 0, storageBytes: 0 };
        doc.hourly[hour].downloads = (doc.hourly[hour].downloads || 0) + 1;
        doc.markModified('hourly');
        await doc.save();
      } catch (e) {
        console.error('[dailyMetrics.recordDownload Error]:', e.message);
      }
    },
    getAll: async () => {
      if (!isDbConnected()) return [];
      try {
        return await DailyMetric.find().sort({ timestamp: 1 }).lean();
      } catch (_) {
        return [];
      }
    }
  }
};
