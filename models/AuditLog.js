import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    resource: {
        type: String,
        required: true,
        index: true
    },
    resourceId: {
        type: String,
        required: false,
        index: true
    },
    details: {
        type: Object,
        required: false
    },
    ipAddress: {
        type: String,
        required: false
    },
    userAgent: {
        type: String,
        required: false
    }
    
}, {
    timestamps: true 
});

//Indexes for better query performance
auditLogSchema.index({ createdAt: -1 }); // Most recent first
auditLogSchema.index({ userId: 1, createdAt: -1 }); // User activity timeline

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;