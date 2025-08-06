import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    firebaseUID: {
        type: String,
        required: true,
        unique: true,
        sparse: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'manager', 'owner'],
        default: 'user'
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization'
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

// Remove duplicate index declarations - keep only these:
userSchema.index({ organizationId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtuals and methods remain the same
userSchema.virtual('fullName').get(function() {
    return this.name;
});

userSchema.virtual('displayName').get(function() {
    return this.name || this.email.split('@')[0];
});

userSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission) || this.role === 'admin' || this.role === 'owner';
};

userSchema.methods.isAdminOrOwner = function() {
    return ['admin', 'owner'].includes(this.role);
};

userSchema.methods.isAdmin = function() {
    return this.role === 'admin';
};

userSchema.methods.isActiveUser = function() {
    return this.isActive === true;
};

const User = mongoose.model('User', userSchema);

export default User;