import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    firebaseUID: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    name: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: false
    },
    phone: {
        type: String,
        required: false
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'manager', 'owner'],
        default: 'user'
    },
    organizationId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Organization',
        required: false
    },
    permissions: [{
        type: String,
        enum: ['read', 'create', 'update', 'delete', 'assign', 'reports']
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    profilePicture: {
        type: String
    }
}, {
    timestamps: true
});

// Index for better query performance
userSchema.index({ organizationId: 1 });
userSchema.index({ role: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return this.name;
});

// Instance method to check if user has permission
userSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission) || this.role === 'admin' || this.role === 'owner';
};

// Instance method to check if user is admin or owner
userSchema.methods.isAdminOrOwner = function() {
    return ['admin', 'owner'].includes(this.role);
};

const User = mongoose.model('User', userSchema);

export default User;