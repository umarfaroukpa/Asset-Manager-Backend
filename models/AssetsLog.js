import mongoose from 'mongoose';

const assetsLogSchema = new mongoose.Schema({
    asset: {
        type: mongoose.Schema.ObjectId,
        ref: 'Asset',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'created',
            'updated',
            'assigned',
            'unassigned',
            'moved',
            'maintenance_started',
            'maintenance_completed',
            'status_changed',
            'retired',
            'deleted',
            'restored'
        ]
    },
    description: {
        type: String,
        required: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    performedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    previousValues: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    newValues: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        location: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    },
    organization: {
        type: mongoose.Schema.ObjectId,
        ref: 'Organization',
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low'
    },
    category: {
        type: String,
        enum: ['asset_management', 'maintenance', 'security', 'compliance'],
        default: 'asset_management'
    }
}, {
    timestamps: true
});

// Indexes for performance
assetsLogSchema.index({ asset: 1, createdAt: -1 });
assetsLogSchema.index({ performedBy: 1, createdAt: -1 });
assetsLogSchema.index({ organization: 1, createdAt: -1 });
assetsLogSchema.index({ action: 1, createdAt: -1 });
assetsLogSchema.index({ severity: 1 });
assetsLogSchema.index({ category: 1 });
assetsLogSchema.index({ 'metadata.timestamp': -1 });

// Compound index for efficient querying
assetsLogSchema.index({ 
    organization: 1, 
    asset: 1, 
    createdAt: -1 
});

// Static method to log asset actions
assetsLogSchema.statics.logAction = async function(assetId, action, description, performedBy, previousValues = {}, newValues = {}, metadata = {}) {
    try {
        // Get asset to determine organization
        const Asset = mongoose.model('Asset');
        const asset = await Asset.findById(assetId).select('organization');
        
        if (!asset) {
            throw new Error('Asset not found');
        }

        const logEntry = new this({
            asset: assetId,
            action,
            description,
            performedBy,
            previousValues,
            newValues,
            metadata: {
                ...metadata,
                timestamp: new Date()
            },
            organization: asset.organization,
            severity: this.determineSeverity(action),
            category: this.determineCategory(action)
        });

        await logEntry.save();
        return logEntry;
    } catch (error) {
        console.error('Error logging asset action:', error);
        throw error;
    }
};

// Static method to determine severity based on action
assetsLogSchema.statics.determineSeverity = function(action) {
    const severityMap = {
        'created': 'low',
        'updated': 'low',
        'assigned': 'medium',
        'unassigned': 'medium',
        'moved': 'medium',
        'maintenance_started': 'medium',
        'maintenance_completed': 'low',
        'status_changed': 'medium',
        'retired': 'high',
        'deleted': 'critical',
        'restored': 'high'
    };
    return severityMap[action] || 'low';
};

// Static method to determine category based on action
assetsLogSchema.statics.determineCategory = function(action) {
    const categoryMap = {
        'created': 'asset_management',
        'updated': 'asset_management',
        'assigned': 'asset_management',
        'unassigned': 'asset_management',
        'moved': 'asset_management',
        'maintenance_started': 'maintenance',
        'maintenance_completed': 'maintenance',
        'status_changed': 'asset_management',
        'retired': 'compliance',
        'deleted': 'security',
        'restored': 'security'
    };
    return categoryMap[action] || 'asset_management';
};

// Instance method to format log entry for display
assetsLogSchema.methods.formatForDisplay = function() {
    return {
        id: this._id,
        action: this.action,
        description: this.description,
        performedBy: this.performedBy,
        timestamp: this.metadata.timestamp || this.createdAt,
        severity: this.severity,
        category: this.category,
        hasChanges: Object.keys(this.previousValues).length > 0 || Object.keys(this.newValues).length > 0
    };
};

const AssetsLog = mongoose.model('AssetsLog', assetsLogSchema);

export default AssetsLog;
