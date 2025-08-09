import mongoose from 'mongoose';

const savedReportSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Report name is required'],
        trim: true,
        maxlength: [100, 'Report name cannot exceed 100 characters']
    },
    type: {
        type: String,
        required: [true, 'Report type is required'],
        enum: {
            values: [
                'asset-inventory',
                'financial-summary', 
                'depreciation-analysis',
                'category-distribution',
                'maintenance-report',
                'utilization-analysis',
                'compliance-audit',
                'assignment-report'
            ],
            message: 'Invalid report type'
        }
    },
    filters: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        validate: {
            validator: function(filters) {
                // Add any filter validation logic here
                return typeof filters === 'object';
            },
            message: 'Filters must be an object'
        }
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization reference is required']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Creator reference is required']
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    scheduleEnabled: {
        type: Boolean,
        default: false
    },
    scheduleConfig: {
        frequency: {
            type: String,
            enum: {
                values: ['daily', 'weekly', 'monthly', 'quarterly'],
                message: 'Invalid schedule frequency'
            },
            default: 'monthly'
        },
        nextRun: {
            type: Date,
            validate: {
                validator: function(date) {
                    return !this.scheduleEnabled || date > new Date();
                },
                message: 'Next run must be in the future when scheduling is enabled'
            }
        },
        recipients: {
            type: [String],
            validate: {
                validator: function(emails) {
                    if (!this.scheduleEnabled) return true;
                    return emails.every(email => 
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                    );
                },
                message: 'Invalid email format in recipients'
            }
        }
    },
    lastGenerated: Date,
    // Additional fields for report customization
    chartConfig: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    columnConfig: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for formatted schedule
savedReportSchema.virtual('formattedSchedule').get(function() {
    if (!this.scheduleEnabled) return 'Not scheduled';
    return `${this.scheduleConfig.frequency} (next: ${this.scheduleConfig.nextRun.toLocaleDateString()})`;
});

// Indexes for better query performance
savedReportSchema.index({ organization: 1, createdBy: 1 });
savedReportSchema.index({ type: 1, organization: 1 });
savedReportSchema.index({ 
    name: 'text',
    description: 'text'
}, {
    weights: {
        name: 5,
        description: 1
    }
});

// Pre-save hook to validate schedule
savedReportSchema.pre('save', function(next) {
    if (this.scheduleEnabled && !this.scheduleConfig.nextRun) {
        this.scheduleConfig.nextRun = calculateNextRun(this.scheduleConfig.frequency);
    }
    next();
});

// Helper function to calculate next run date
function calculateNextRun(frequency) {
    const date = new Date();
    switch(frequency) {
        case 'daily':
            date.setDate(date.getDate() + 1);
            break;
        case 'weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
    }
    return date;
}

const SavedReport = mongoose.model('SavedReport', savedReportSchema);

export default SavedReport;