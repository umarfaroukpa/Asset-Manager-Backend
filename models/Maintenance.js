import mongoose from 'mongoose';

const maintenanceSchema = new mongoose.Schema({
    asset: {
        type: mongoose.Schema.ObjectId,
        ref: 'Asset',
        required: true
    },
    type: {
        type: String,
        enum: ['scheduled', 'emergency', 'preventive', 'corrective'],
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'],
        default: 'scheduled'
    },
    title: {
        type: String,
        required: [true, 'Maintenance title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    startDate: Date,
    completedDate: Date,
    estimatedDuration: {
        type: Number, // in hours
        min: 0
    },
    actualDuration: {
        type: Number, // in hours
        min: 0
    },
    assignedTo: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    cost: {
        labor: {
            type: Number,
            default: 0,
            min: 0
        },
        parts: {
            type: Number,
            default: 0,
            min: 0
        },
        external: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    parts: [{
        name: String,
        quantity: Number,
        cost: Number,
        supplier: String
    }],
    instructions: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    },
    attachments: [{
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
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
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
maintenanceSchema.index({ asset: 1, scheduledDate: -1 });
maintenanceSchema.index({ status: 1, scheduledDate: 1 });
maintenanceSchema.index({ organization: 1, scheduledDate: -1 });
maintenanceSchema.index({ assignedTo: 1 });
maintenanceSchema.index({ priority: 1 });
maintenanceSchema.index({ type: 1 });

// Virtual for total cost
maintenanceSchema.virtual('totalCost').get(function() {
    return (this.cost.labor || 0) + (this.cost.parts || 0) + (this.cost.external || 0);
});

// Virtual for is overdue
maintenanceSchema.virtual('isOverdue').get(function() {
    if (this.status === 'completed' || this.status === 'cancelled') {
        return false;
    }
    return new Date() > this.scheduledDate;
});

// Virtual for days until/overdue
maintenanceSchema.virtual('daysUntilDue').get(function() {
    const today = new Date();
    const scheduled = new Date(this.scheduledDate);
    const diffTime = scheduled - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
});

// Pre-save middleware to update status if overdue
maintenanceSchema.pre('save', function(next) {
    if (this.isOverdue && this.status === 'scheduled') {
        this.status = 'overdue';
    }
    
    // Calculate actual duration if completed
    if (this.status === 'completed' && this.startDate && this.completedDate) {
        const duration = (this.completedDate - this.startDate) / (1000 * 60 * 60); // hours
        this.actualDuration = Math.round(duration * 100) / 100; // round to 2 decimal places
    }
    
    next();
});

// Instance method to mark as started
maintenanceSchema.methods.start = function() {
    this.status = 'in_progress';
    this.startDate = new Date();
    return this.save();
};

// Instance method to mark as completed
maintenanceSchema.methods.complete = function(notes = '') {
    this.status = 'completed';
    this.completedDate = new Date();
    if (notes) {
        this.notes = this.notes ? `${this.notes}\n\nCompletion notes: ${notes}` : notes;
    }
    return this.save();
};

// Static method to get overdue maintenance
maintenanceSchema.statics.getOverdue = function(organizationId) {
    return this.find({
        organization: organizationId,
        status: { $in: ['scheduled', 'overdue'] },
        scheduledDate: { $lt: new Date() }
    }).populate('asset', 'name assetTag').populate('assignedTo', 'name email');
};

// Static method to get upcoming maintenance
maintenanceSchema.statics.getUpcoming = function(organizationId, days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        organization: organizationId,
        status: 'scheduled',
        scheduledDate: { 
            $gte: new Date(),
            $lte: futureDate
        }
    }).populate('asset', 'name assetTag').populate('assignedTo', 'name email');
};

const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

export default Maintenance;
