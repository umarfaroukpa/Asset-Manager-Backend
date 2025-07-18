import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import Organization from '../models/Organizations.js';
import Category from '../models/Category.js';
import AssetsLog from '../models/AssetsLog.js';

const router = express.Router();

// Apply authentication to all report routes
router.use(authenticateToken);

// @route   GET /api/reports/assets
// @desc    Get asset reports with various filters and groupings
// @access  Private
router.get('/assets', async (req, res) => {
    try {
        const { 
            groupBy = 'category', 
            status,
            category,
            startDate,
            endDate,
            format = 'json'
        } = req.query;

        // Build base query
        const query = { organization: req.user.organizationId };
        
        if (status) query.status = status;
        if (category) query.category = category;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        let aggregationPipeline = [
            { $match: query },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo',
                    foreignField: '_id',
                    as: 'assignedUser'
                }
            }
        ];

        // Group by specified field
        if (groupBy === 'category') {
            aggregationPipeline.push({
                $group: {
                    _id: '$category',
                    categoryName: { $first: { $arrayElemAt: ['$categoryInfo.name', 0] } },
                    count: { $sum: 1 },
                    totalValue: { $sum: '$currentValue' },
                    assets: { 
                        $push: {
                            _id: '$_id',
                            name: '$name',
                            status: '$status',
                            currentValue: '$currentValue'
                        }
                    }
                }
            });
        } else if (groupBy === 'status') {
            aggregationPipeline.push({
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$currentValue' },
                    assets: { 
                        $push: {
                            _id: '$_id',
                            name: '$name',
                            category: { $arrayElemAt: ['$categoryInfo.name', 0] },
                            currentValue: '$currentValue'
                        }
                    }
                }
            });
        } else if (groupBy === 'location') {
            aggregationPipeline.push({
                $group: {
                    _id: '$location',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$currentValue' },
                    assets: { 
                        $push: {
                            _id: '$_id',
                            name: '$name',
                            status: '$status',
                            currentValue: '$currentValue'
                        }
                    }
                }
            });
        }

        aggregationPipeline.push({ $sort: { count: -1 } });

        const results = await Asset.aggregate(aggregationPipeline);

        // Calculate summary statistics
        const summary = await Asset.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAssets: { $sum: 1 },
                    totalValue: { $sum: '$currentValue' },
                    averageValue: { $avg: '$currentValue' },
                    statusBreakdown: {
                        $push: '$status'
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                summary: summary[0] || {},
                groupedData: results,
                groupBy,
                filters: { status, category, startDate, endDate }
            }
        });
    } catch (error) {
        console.error('Asset report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error generating asset report'
        });
    }
});

// @route   GET /api/reports/maintenance
// @desc    Get maintenance reports
// @access  Private
router.get('/maintenance', async (req, res) => {
    try {
        const { startDate, endDate, status = 'all' } = req.query;

        // Build query for assets with maintenance data
        const query = { organization: req.user.organizationId };
        
        if (startDate || endDate) {
            query.nextMaintenance = {};
            if (startDate) query.nextMaintenance.$gte = new Date(startDate);
            if (endDate) query.nextMaintenance.$lte = new Date(endDate);
        }

        const maintenanceData = await Asset.find(query)
            .select('name assetTag location status lastMaintenance nextMaintenance maintenanceSchedule')
            .populate('category', 'name')
            .populate('assignedTo', 'name email')
            .sort({ nextMaintenance: 1 });

        // Categorize maintenance
        const now = new Date();
        const overdue = [];
        const upcoming = [];
        const scheduled = [];

        maintenanceData.forEach(asset => {
            if (asset.nextMaintenance) {
                if (asset.nextMaintenance < now) {
                    overdue.push(asset);
                } else if (asset.nextMaintenance <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
                    upcoming.push(asset);
                } else {
                    scheduled.push(asset);
                }
            }
        });

        res.json({
            success: true,
            data: {
                summary: {
                    total: maintenanceData.length,
                    overdue: overdue.length,
                    upcoming: upcoming.length,
                    scheduled: scheduled.length
                },
                overdue,
                upcoming,
                scheduled
            }
        });
    } catch (error) {
        console.error('Maintenance report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error generating maintenance report'
        });
    }
});

// @route   GET /api/reports/audit
// @desc    Get audit trail reports
// @access  Private (Admin/Manager only)
router.get('/audit', requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { 
            startDate, 
            endDate, 
            action, 
            userId,
            assetId,
            page = 1,
            limit = 50
        } = req.query;

        // Build query
        const query = { organization: req.user.organizationId };
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        if (action) query.action = action;
        if (userId) query.performedBy = userId;
        if (assetId) query.asset = assetId;

        const total = await AssetsLog.countDocuments(query);
        
        const auditLogs = await AssetsLog.find(query)
            .populate('asset', 'name assetTag')
            .populate('performedBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        // Get action summary
        const actionSummary = await AssetsLog.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            data: {
                auditLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                },
                summary: {
                    totalEvents: total,
                    actionBreakdown: actionSummary
                }
            }
        });
    } catch (error) {
        console.error('Audit report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error generating audit report'
        });
    }
});

// @route   GET /api/reports/utilization
// @desc    Get asset utilization reports
// @access  Private
router.get('/utilization', async (req, res) => {
    try {
        const utilizationData = await Asset.aggregate([
            { $match: { organization: req.user.organizationId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$currentValue' }
                }
            },
            {
                $project: {
                    status: '$_id',
                    count: 1,
                    totalValue: 1,
                    _id: 0
                }
            }
        ]);

        // Calculate utilization percentages
        const totalAssets = utilizationData.reduce((sum, item) => sum + item.count, 0);
        const utilizationWithPercentages = utilizationData.map(item => ({
            ...item,
            percentage: totalAssets > 0 ? ((item.count / totalAssets) * 100).toFixed(2) : 0
        }));

        res.json({
            success: true,
            data: {
                totalAssets,
                utilization: utilizationWithPercentages
            }
        });
    } catch (error) {
        console.error('Utilization report error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error generating utilization report'
        });
    }
});

// @route   GET /api/reports/export
// @desc    Export reports in various formats
// @access  Private
router.get('/export', async (req, res) => {
    try {
        const { type = 'assets', format = 'json' } = req.query;

        // This is a basic implementation - you might want to add CSV, Excel export later
        let data;
        
        switch (type) {
            case 'assets':
                data = await Asset.find({ organization: req.user.organizationId })
                    .populate('category', 'name')
                    .populate('assignedTo', 'name email')
                    .select('-__v');
                break;
            case 'audit':
                data = await AssetsLog.find({ organization: req.user.organizationId })
                    .populate('asset', 'name assetTag')
                    .populate('performedBy', 'name email')
                    .select('-__v');
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid export type'
                });
        }

        res.json({
            success: true,
            data,
            exportInfo: {
                type,
                format,
                count: data.length,
                exportedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error exporting data'
        });
    }
});

export default router;
