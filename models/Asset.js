// models/Assets.js
const mongoose = require('mongoose');
const validator = require('validator');

const assetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Asset name is required'],
    trim: true,
    maxlength: [100, 'Asset name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  serialNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true
  },
  assetTag: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['Electronics', 'Furniture', 'Vehicle', 'Equipment', 'Software', 'Other'],
      message: 'Invalid category'
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['available', 'assigned', 'maintenance', 'retired'],
    default: 'available'
  },
  purchaseDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value <= new Date();
      },
      message: 'Purchase date cannot be in the future'
    }
  },
  purchasePrice: {
    type: Number,
    min: [0, 'Purchase price cannot be negative'],
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  currentValue: {
    type: Number,
    min: [0, 'Current value cannot be negative'],
    get: v => Math.round(v * 100) / 100,
    set: v => Math.round(v * 100) / 100
  },
  location: {
    type: String,
    required: [true, 'Location is required']
  },
  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  qrCode: String,
  barcode: String,
  warrantyExpiration: Date,
  maintenanceSchedule: {
    type: String,
    enum: ['none', 'monthly', 'quarterly', 'biannual', 'annual']
  },
  lastMaintenance: Date,
  nextMaintenance: Date,
  depreciationRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  customFields: mongoose.Schema.Types.Mixed,
  organization: {
    type: mongoose.Schema.ObjectId,
    ref: 'Organization',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Indexes for performance
assetSchema.index({ name: 'text', description: 'text', serialNumber: 'text' });
assetSchema.index({ status: 1 });
assetSchema.index({ category: 1 });
assetSchema.index({ location: 1 });
assetSchema.index({ assignedTo: 1 });
assetSchema.index({ organization: 1 });
assetSchema.index({ nextMaintenance: 1 });
assetSchema.index({ warrantyExpiration: 1 });

// Virtual for asset age
assetSchema.virtual('age').get(function() {
  return this.purchaseDate ? 
    Math.floor((new Date() - this.purchaseDate) / (1000 * 60 * 60 * 24 * 365)) : 
    null;
});

// Pre-save hook to calculate current value
assetSchema.pre('save', function(next) {
  if (this.isModified('purchasePrice') || this.isModified('depreciationRate') || this.isNew) {
    if (this.purchasePrice && this.depreciationRate && this.purchaseDate) {
      const ageInYears = (new Date() - this.purchaseDate) / (1000 * 60 * 60 * 24 * 365);
      const depreciation = this.purchasePrice * (this.depreciationRate / 100) * ageInYears;
      this.currentValue = Math.max(0, this.purchasePrice - depreciation);
    } else {
      this.currentValue = this.purchasePrice || 0;
    }
  }
  
  // Calculate next maintenance date
  if (this.isModified('maintenanceSchedule') || this.isModified('lastMaintenance') || this.isNew) {
    if (this.maintenanceSchedule && this.maintenanceSchedule !== 'none') {
      const intervals = {
        monthly: 30 * 24 * 60 * 60 * 1000,
        quarterly: 90 * 24 * 60 * 60 * 1000,
        biannual: 180 * 24 * 60 * 60 * 1000,
        annual: 365 * 24 * 60 * 60 * 1000
      };
      
      const last = this.lastMaintenance || new Date();
      this.nextMaintenance = new Date(last.getTime() + intervals[this.maintenanceSchedule]);
    } else {
      this.nextMaintenance = null;
    }
  }
  
  next();
});

module.exports = mongoose.model('Asset', assetSchema);