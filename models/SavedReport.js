import mongoose from 'mongoose';

const savedReportSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  reportType: {
    type: String,
    required: true,
    enum: ['assets', 'maintenance', 'audit', 'utilization', 'depreciation', 'compliance']
  },
  filters: {
    groupBy: String,
    status: String,
    category: String,
    startDate: Date,
    endDate: Date,
    userId: String,
    assetId: String,
    location: String,
    department: String
  },
  configuration: {
    format: {
      type: String,
      enum: ['json', 'csv', 'pdf'],
      default: 'json'
    },
    columns: [String],
    chartType: String,
    grouping: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  schedule: {
    enabled: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly'],
      default: 'weekly'
    },
    nextRun: Date,
    lastRun: Date,
    recipients: [String] // email addresses
  },
  metadata: {
    lastGenerated: Date,
    generationCount: {
      type: Number,
      default: 0
    },
    averageGenerationTime: Number,
    dataSize: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
savedReportSchema.index({ createdBy: 1, organizationId: 1 });
savedReportSchema.index({ reportType: 1 });
savedReportSchema.index({ 'schedule.enabled': 1, 'schedule.nextRun': 1 });

// Virtual for formatted creation date
savedReportSchema.virtual('formattedCreatedAt').get(function() {
  return this.createdAt.toLocaleDateString();
});

// Method to check if user can access this report
savedReportSchema.methods.canAccess = function(userId, userRole) {
  // Owner can always access
  if (this.createdBy.toString() === userId.toString()) {
    return true;
  }
  
  // Public reports can be accessed by organization members
  if (this.isPublic) {
    return true;
  }
  
  // Admins and managers can access all reports in their organization
  if (['admin', 'manager'].includes(userRole)) {
    return true;
  }
  
  return false;
};

const SavedReport = mongoose.model('SavedReport', savedReportSchema);

export default SavedReport;