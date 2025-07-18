import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        trim: true,
        maxlength: [100, 'Organization name cannot exceed 100 characters'],
        unique: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    type: {
        type: String,
        enum: ['company', 'organization', 'department', 'branch'],
        default: 'organization'
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    contactInfo: {
        phone: String,
        email: {
            type: String,
            lowercase: true,
            validate: {
                validator: function(v) {
                    return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
                },
                message: 'Please enter a valid email'
            }
        },
        website: String
    },
    owner: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    members: [{
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['owner', 'admin', 'manager', 'member'],
            default: 'member'
        },
        permissions: [{
            type: String,
            enum: ['read', 'create', 'update', 'delete', 'assign', 'reports']
        }],
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    settings: {
        assetPrefix: {
            type: String,
            default: 'AST',
            maxlength: 5
        },
        autoGenerateAssetTags: {
            type: Boolean,
            default: true
        },
        requireApprovalForAssignment: {
            type: Boolean,
            default: false
        },
        defaultDepreciationRate: {
            type: Number,
            default: 10,
            min: 0,
            max: 100
        }
    },
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'basic', 'premium', 'enterprise'],
            default: 'free'
        },
        maxAssets: {
            type: Number,
            default: 100
        },
        maxUsers: {
            type: Number,
            default: 5
        },
        expiresAt: Date
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
organizationSchema.index({ owner: 1 });
organizationSchema.index({ 'members.user': 1 });
organizationSchema.index({ isActive: 1 });

// Virtual for member count
organizationSchema.virtual('memberCount').get(function() {
    return this.members ? this.members.length : 0;
});

// Virtual for asset count (to be populated externally)
organizationSchema.virtual('assetCount', {
    ref: 'Asset',
    localField: '_id',
    foreignField: 'organization',
    count: true
});

// Instance method to check if user is member
organizationSchema.methods.isMember = function(userId) {
    return this.members.some(member => 
        member.user.toString() === userId.toString()
    );
};

// Instance method to get user role
organizationSchema.methods.getUserRole = function(userId) {
    const member = this.members.find(member => 
        member.user.toString() === userId.toString()
    );
    return member ? member.role : null;
};

// Instance method to check permissions
organizationSchema.methods.hasPermission = function(userId, permission) {
    const member = this.members.find(member => 
        member.user.toString() === userId.toString()
    );
    return member ? member.permissions.includes(permission) : false;
};

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
