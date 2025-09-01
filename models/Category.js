import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        maxlength: [50, 'Category name cannot exceed 50 characters'],
        unique: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: [200, 'Description cannot exceed 200 characters']
    },
    icon: {
        type: String,
        default: 'folder'
    },
    color: {
        type: String,
        default: '#6366f1',
        validate: {
            validator: function(v) {
                return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
            },
            message: 'Color must be a valid hex color code'
        }
    },
    parentCategory: {
        type: mongoose.Schema.ObjectId,
        ref: 'Category',
        default: null
    },
    subcategories: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Category'
    }],
    organization: {
        type: mongoose.Schema.ObjectId,
        ref: 'Organization',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
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
categorySchema.index({ name: 1, organization: 1 }, { unique: true });
categorySchema.index({ organization: 1 });
categorySchema.index({ parentCategory: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ sortOrder: 1 });

// Virtual for asset count
categorySchema.virtual('assetCount', {
    ref: 'Asset',
    localField: 'name',
    foreignField: 'category',
    count: true
});

// Virtual for full path (for nested categories)
categorySchema.virtual('fullPath').get(function() {
    // This would need to be populated with parent data
    return this.name;
});

// Pre-save middleware to handle subcategories
categorySchema.pre('save', async function(next) {
    if (this.isModified('parentCategory') && this.parentCategory) {
        // Add this category to parent's subcategories
        await mongoose.model('Category').findByIdAndUpdate(
            this.parentCategory,
            { $addToSet: { subcategories: this._id } }
        );
    }
    next();
});

// Pre-remove middleware to handle cleanup
categorySchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    // Remove from parent's subcategories
    if (this.parentCategory) {
        await mongoose.model('Category').findByIdAndUpdate(
            this.parentCategory,
            { $pull: { subcategories: this._id } }
        );
    }
    
    // Update child categories to have no parent
    await mongoose.model('Category').updateMany(
        { parentCategory: this._id },
        { $unset: { parentCategory: 1 } }
    );
    
    next();
});

const Category = mongoose.model('Category', categorySchema);

export default Category;
