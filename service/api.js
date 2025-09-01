apis
const express = require('express');
const { authenticateToken, authorize, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const Asset = require('../models/Asset');
const Category = require('../models/Category');
const AuditLog = require('../models/AuditLog');
const { generateQRCode, generateAssetTag } = require('../utils/helpers');

const router = express.Router();

// @route   GET /api/assets
// @desc    Get all assets with filtering, pagination, and search
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            category,
            status,
            assignedTo,
            location,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};
        
        // Text search across multiple fields
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { assetTag: { $regex: search, $options: 'i' } },
                { serialNumber: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Status filter
        if (status) {
            filter.status = status;
        }

        // Assigned user filter
        if (assignedTo) {
            filter.assignedTo = assignedTo;
        }

        // Location filter
        if (location) {
            filter['location.building'] = { $regex: location, $options: 'i' };
        }

        // Calculate pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Sort configuration
        const sortConfig = {};
        sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query with population
        const assets = await Asset.find(filter)
            .populate('category', 'name icon color')
            .populate('assignedTo', 'name email department')
            .populate('createdBy', 'name email')
            .sort(sortConfig)
            .skip(skip)
            .limit(limitNum);

        // Get total count for pagination
        const totalAssets = await Asset.countDocuments(filter);
        const totalPages = Math.ceil(totalAssets / limitNum);

        // Calculate summary statistics
        const statusCounts = await Asset.aggregate([
            { $match: filter },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const totalValue = await Asset.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: '$currentValue' } } }
        ]);

        res.json({
            success: true,
            data: {
                assets,
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalAssets,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                },
                summary: {
                    statusCounts,
                    totalValue: totalValue[0]?.total || 0
                }
            }
        });

    } catch (error) {
        console.error('Assets fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching assets'
        });
    }
});

// @route   GET /api/assets/:id
// @desc    Get single asset by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id)
            .populate('category', 'name icon color description')
            .populate('assignedTo', 'name email department phone')
            .populate('createdBy', 'name email');

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        // Get asset history from audit logs
        const history = await AuditLog.find({ assetId: asset._id })
            .populate('userId', 'name email')
            .sort({ timestamp: -1 })
            .limit(20);

        res.json({
            success: true,
            data: {
                asset,
                history
            }
        });

    } catch (error) {
        console.error('Asset fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching asset'
        });
    }
});

// @route   POST /api/assets
// @desc    Create new asset
// @access  Private (Create permission required)
router.post('/', 
    authenticateToken, 
    requireRole('create'),
    validate(schemas.asset),
    async (req, res) => {
        try {
            const assetData = {
                ...req.body,
                createdBy: req.user._id
            };

            // Auto-generate asset tag if not provided
            if (!assetData.assetTag) {
                assetData.assetTag = await generateAssetTag();
            }

            // Verify category exists
            const category = await Category.findById(assetData.category);
            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid category specified'
                });
            }

            const asset = new Asset(assetData);

            // Generate QR code
            asset.qrCode = await generateQRCode(asset.assetTag);

            await asset.save();

            // Create audit log
            await new AuditLog({
                assetId: asset._id,
                userId: req.user._id,
                action: 'created',
                changes: { created: true },
                timestamp: new Date()
            }).save();

            // Populate before sending response
            await asset.populate([
                { path: 'category', select: 'name icon color' },
                { path: 'createdBy', select: 'name email' }
            ]);

            res.status(201).json({
                success: true,
                message: 'Asset created successfully',
                data: { asset }
            });

        } catch (error) {
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: 'Asset tag already exists'
                });
            }
            
            console.error('Asset creation error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error creating asset'
            });
        }
    }
);

// @route   PUT /api/assets/:id
// @desc    Update asset
// @access  Private (Update permission required)
router.put('/:id', 
    authenticateToken, 
    requireRole('update'),
    validate(schemas.assetUpdate),
    async (req, res) => {
        try {
            const asset = await Asset.findById(req.params.id);
            
            if (!asset) {
                return res.status(404).json({
                    success: false,
                    message: 'Asset not found'
                });
            }

            // Store original values for audit log
            const originalValues = asset.toObject();

            // Update asset
            Object.assign(asset, req.body);
            asset.updatedAt = new Date();

            await asset.save();

            // Create audit log with changes
            const changes = {};
            Object.keys(req.body).forEach(key => {
                if (originalValues[key] !== req.body[key]) {
                    changes[key] = {
                        from: originalValues[key],
                        to: req.body[key]
                    };
                }
            });

            if (Object.keys(changes).length > 0) {
                await new AuditLog({
                    assetId: asset._id,
                    userId: req.user._id,
                    action: 'updated',
                    changes,
                    timestamp: new Date()
                }).save();
            }

            // Populate before sending response
            await asset.populate([
                { path: 'category', select: 'name icon color' },
                { path: 'assignedTo', select: 'name email department' },
                { path: 'createdBy', select: 'name email' }
            ]);

            res.json({
                success: true,
                message: 'Asset updated successfully',
                data: { asset }
            });

        } catch (error) {
            console.error('Asset update error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error updating asset'
            });
        }
    }
);

// @route   DELETE /api/assets/:id
// @desc    Delete asset
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id);
        
        if (!asset) {
            return res.status(404).json({
                success: false,
                message: 'Asset not found'
            });
        }

        // Create audit log before deletion
        await new AuditLog({
            assetId: asset._id,
            userId: req.user._id,
            action: 'deleted',
            changes: { deleted: true, assetData: asset.toObject() },
            timestamp: new Date()
        }).save();

        await Asset.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Asset deleted successfully'
        });

    } catch (error) {
        console.error('Asset deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting asset'
        });
    }
});

// @route   POST /api/assets/:id/assign
// @desc    Assign asset to user
// @access  Private (Assign permission required)
router.post('/:id/assign', 
    authenticateToken, 
    requireRole('assign'),
    async (req, res) => {
        try {
            const { userId, notes } = req.body;
            
            const asset = await Asset.findById(req.params.id);
            if (!asset) {
                return res.status(404).json({
                    success: false,
                    message: 'Asset not found'
                });
            }

            // Check if asset is available
            if (asset.status !== 'available') {
                return res.status(400).json({
                    success: false,
                    message: 'Asset is not available for assignment'
                });
            }

            const previousAssignee = asset.assignedTo;

            // Update asset
            asset.assignedTo = userId;
            asset.assignedAt = new Date();
            asset.status = 'in-use';
            await asset.save();

            // Create audit log
            await new AuditLog({
                assetId: asset._id,
                userId: req.user._id,
                action: 'assigned',
                changes: {
                    assignedTo: userId,
                    previousAssignee,
                    notes
                },
                timestamp: new Date()
            }).save();

            await asset.populate('assignedTo', 'name email department');

            res.json({
                success: true,
                message: 'Asset assigned successfully',
                data: { asset }
            });

        } catch (error) {
            console.error('Asset assignment error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error assigning asset'
            });
        }
    }
);

// @route   POST /api/assets/:id/return
// @desc    Return asset from user
// @access  Private (Assign permission required)
router.post('/:id/return', 
    authenticateToken, 
    requireRole('assign'),
    async (req, res) => {
        try {
            const { condition, notes } = req.body;
            
            const asset = await Asset.findById(req.params.id);
            if (!asset) {
                return res.status(404).json({
                    success: false,
                    message: 'Asset not found'
                });
            }

            if (!asset.assignedTo) {
                return res.status(400).json({
                    success: false,
                    message: 'Asset is not currently assigned'
                });
            }

            const previousAssignee = asset.assignedTo;

            // Update asset
            asset.assignedTo = null;
            asset.assignedAt = null;
            asset.status = 'available';
            if (condition) asset.condition = condition;
            await asset.save();

            // Create audit log
            await new AuditLog({
                assetId: asset._id,
                userId: req.user._id,
                action: 'returned',
                changes: {
                    returnedFrom: previousAssignee,
                    condition,
                    notes
                },
                timestamp: new Date()
            }).save();

            res.json({
                success: true,
                message: 'Asset returned successfully',
                data: { asset }
            });

        } catch (error) {
            console.error('Asset return error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error returning asset'
            });
        }
    }
);

// @route   GET /api/assets/export/csv
// @desc    Export assets to CSV
// @access  Private (Reports permission required)
router.get('/export/csv', 
    authenticateToken, 
    requireRole('reports'),
    async (req, res) => {
        try {
            const assets = await Asset.find()
                .populate('category', 'name')
                .populate('assignedTo', 'name email')
                .populate('createdBy', 'name')
                .lean();

            // Convert to CSV format
            const csvHeaders = [
                'Asset Tag', 'Name', 'Category', 'Status', 'Condition',
                'Serial Number', 'Purchase Date', 'Purchase Price', 'Current Value',
                'Assigned To', 'Location', 'Created By', 'Created At'
            ];

            const csvRows = assets.map(asset => [
                asset.assetTag,
                asset.name,
                asset.category?.name || '',
                asset.status,
                asset.condition,
                asset.serialNumber || '',
                asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : '',
                asset.purchasePrice || '',
                asset.currentValue || '',
                asset.assignedTo?.name || '',
                `${asset.location?.building || ''} ${asset.location?.floor || ''} ${asset.location?.room || ''}`.trim(),
                asset.createdBy?.name || '',
                new Date(asset.createdAt).toLocaleDateString()
            ]);

            const csvContent = [csvHeaders, ...csvRows]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="assets-export.csv"');
            res.send(csvContent);

        } catch (error) {
            console.error('Asset export error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error exporting assets'
            });
        }
    }
);

module.exports = router;