import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true,
        maxlength: [100, 'Company name cannot exceed 100 characters'],
        unique: true
    },
    legalName: {
        type: String,
        trim: true,
        maxlength: [150, 'Legal name cannot exceed 150 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    industry: {
        type: String,
        trim: true,
        maxlength: [100, 'Industry cannot exceed 100 characters']
    },
    logo: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                return !v || /^https?:\/\/.+/.test(v);
            },
            message: 'Website must be a valid URL'
        }
    },
    headquarters: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },
    contactInfo: {
        phone: {
            type: String,
            trim: true
        },
        email: {
            type: String,
            lowercase: true,
            trim: true,
            validate: {
                validator: function(v) {
                    return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
                },
                message: 'Please enter a valid email'
            }
        },
        fax: String
    },
    businessInfo: {
        registrationNumber: {
            type: String,
            trim: true,
            unique: true,
            sparse: true
        },
        taxId: {
            type: String,
            trim: true
        },
        incorporationDate: Date,
        fiscalYearEnd: {
            month: {
                type: Number,
                min: 1,
                max: 12
            },
            day: {
                type: Number,
                min: 1,
                max: 31
            }
        }
    },
    organizations: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Organization'
    }],
    parentCompany: {
        type: mongoose.Schema.ObjectId,
        ref: 'Company',
        default: null
    },
    subsidiaries: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Company'
    }],
    settings: {
        currency: {
            type: String,
            default: 'USD',
            maxlength: 3
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        dateFormat: {
            type: String,
            enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
            default: 'MM/DD/YYYY'
        },
        language: {
            type: String,
            default: 'en',
            maxlength: 5
        }
    },
    subscription: {
        plan: {
            type: String,
            enum: ['trial', 'starter', 'professional', 'enterprise'],
            default: 'trial'
        },
        status: {
            type: String,
            enum: ['active', 'suspended', 'cancelled', 'expired'],
            default: 'active'
        },
        startDate: {
            type: Date,
            default: Date.now
        },
        endDate: Date,
        maxOrganizations: {
            type: Number,
            default: 1
        },
        maxUsers: {
            type: Number,
            default: 10
        },
        maxAssets: {
            type: Number,
            default: 500
        },
        features: [{
            type: String,
            enum: [
                'basic_asset_management',
                'advanced_reporting',
                'maintenance_scheduling',
                'barcode_scanning',
                'api_access',
                'custom_fields',
                'bulk_import',
                'audit_trails',
                'mobile_app'
            ]
        }]
    },
    billing: {
        billingAddress: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: String
        },
        paymentMethod: {
            type: String,
            enum: ['credit_card', 'bank_transfer', 'paypal', 'invoice'],
            default: 'credit_card'
        },
        billingCycle: {
            type: String,
            enum: ['monthly', 'quarterly', 'annually'],
            default: 'monthly'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
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
companySchema.index({ name: 1 });
companySchema.index({ 'businessInfo.registrationNumber': 1 });
companySchema.index({ isActive: 1 });
companySchema.index({ 'subscription.status': 1 });
companySchema.index({ createdBy: 1 });

// Virtual for organization count
companySchema.virtual('organizationCount').get(function() {
    return this.organizations ? this.organizations.length : 0;
});

// Virtual for total asset count (across all organizations)
companySchema.virtual('totalAssetCount', {
    ref: 'Asset',
    localField: 'organizations',
    foreignField: 'organization',
    count: true
});

// Virtual for subscription days remaining
companySchema.virtual('subscriptionDaysRemaining').get(function() {
    if (!this.subscription.endDate) return null;
    const today = new Date();
    const endDate = new Date(this.subscription.endDate);
    const diffTime = endDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Instance method to check if feature is available
companySchema.methods.hasFeature = function(feature) {
    return this.subscription.features.includes(feature);
};

// Instance method to check subscription limits
companySchema.methods.checkLimits = async function() {
    const Organization = mongoose.model('Organization');
    const Asset = mongoose.model('Asset');
    const User = mongoose.model('User');

    const orgCount = await Organization.countDocuments({ 
        _id: { $in: this.organizations } 
    });
    
    const assetCount = await Asset.countDocuments({ 
        organization: { $in: this.organizations } 
    });
    
    const userCount = await User.countDocuments({ 
        organizationId: { $in: this.organizations } 
    });

    return {
        organizations: {
            current: orgCount,
            limit: this.subscription.maxOrganizations,
            exceeded: orgCount >= this.subscription.maxOrganizations
        },
        assets: {
            current: assetCount,
            limit: this.subscription.maxAssets,
            exceeded: assetCount >= this.subscription.maxAssets
        },
        users: {
            current: userCount,
            limit: this.subscription.maxUsers,
            exceeded: userCount >= this.subscription.maxUsers
        }
    };
};

// Pre-save middleware to handle subsidiaries
companySchema.pre('save', async function(next) {
    if (this.isModified('parentCompany') && this.parentCompany) {
        // Add this company to parent's subsidiaries
        await mongoose.model('Company').findByIdAndUpdate(
            this.parentCompany,
            { $addToSet: { subsidiaries: this._id } }
        );
    }
    next();
});

const Company = mongoose.model('Company', companySchema);

export default Company;
