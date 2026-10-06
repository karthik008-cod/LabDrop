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
  links: { type: [String], default: [] },
  folderStructure: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Number, default: Date.now },
  expiresAt: { type: Number, required: true },
  totalSize: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  isSavedForLater: { type: Boolean, default: false },
  userId: String,
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
      await Transfer.findOneAndUpdate({ id }, transferData, { upsert: true, returnDocument: 'after' });
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
    saveAll: async () => { /* No-op for MongoDB */ },
    getNextSequence: async (timeBlockId) => {
      const counter = await Counter.findByIdAndUpdate(
        timeBlockId,
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return counter.seq;
    }
  },
  analytics: {
    get: async () => {
      let stats = await Analytics.findOne({ id: 'global' }).lean();
      if (!stats) {
        const newStats = new Analytics({ id: 'global' });
        await newStats.save();
        return newStats.toObject();
      }
      return stats;
    },
    set: async (statsData) => {
      await Analytics.findOneAndUpdate({ id: 'global' }, statsData, { upsert: true });
    }
  },
  dailyMetrics: {
    getToday: async (dateStr, initialCumulative = {}) => {
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
    },
    recordVisit: async (dateStr, deviceId, currentTotals) => {
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
      return await DailyMetric.find().sort({ timestamp: 1 }).lean();
    }
  }
};
