import express from 'express';
import Asset from '../models/Asset.js';
import Category from '../models/Category.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Organization from '../models/Organizations.js';
import { createAuditLog } from '../middleware/auditLogger.js';

const router = express.Router();

// Authentication middleware 
import { authenticateToken } from '../middleware/auth.js';
router.use(authenticateToken);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    console.log('Dashboard stats endpoint hit');
    console.log('User:', req.user);

    // Create audit log for API access
    try {
      await createAuditLog({
        userId: req.decodedToken?.uid || req.user.firebaseUid,
        action: 'API_ACCESS',
        resource: 'dashboard/stats',
        details: {
          endpoint: req.originalUrl,
          method: req.method
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('⚠️ API access audit logging failed:', auditError.message);
    }

    // Initialize stats object with default values
    const stats = {
      totalAssets: 0,
      availableAssets: 0,
      assignedAssets: 0,
      totalValue: 0,
      totalUsers: 0,
      totalOrganizations: 0,
      totalCategories: 0,
      recentActivity: [],
      assetsByCategory: [],
      monthlyGrowth: 0
    };

    // Test database connection 
    const dbTest = await Asset.findOne().limit(1);
    console.log('Database connection test:', dbTest ? 'Success' : 'No assets found');

    try {
      // Count total assets
      stats.totalAssets = await Asset.countDocuments();
      console.log('Total assets:', stats.totalAssets);
    } catch (error) {
      console.error('Error counting assets:', error.message);
    }

    try {
      // Count assets by status
      const assetStatusCounts = await Asset.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: { $toDouble: { $ifNull: ['$value', 0] } } }
          }
        }
      ]);
      
      console.log('Asset status counts:', assetStatusCounts);
      
      // Process the aggregation results
      assetStatusCounts.forEach(statusGroup => {
        if (statusGroup._id === 'available') {
          stats.availableAssets = statusGroup.count;
        } else if (statusGroup._id === 'assigned') {
          stats.assignedAssets = statusGroup.count;
        }
        stats.totalValue += statusGroup.totalValue || 0;
      });
    } catch (error) {
      console.error('Error getting asset status counts:', error.message);
    }

    try {
      // Count total users
      stats.totalUsers = await User.countDocuments();
      console.log('Total users:', stats.totalUsers);
    } catch (error) {
      console.error('Error counting users:', error.message);
    }

    try {
      // Count total organizations
      stats.totalOrganizations = await Organization.countDocuments();
      console.log('Total organizations:', stats.totalOrganizations);
    } catch (error) {
      console.error('Error counting organizations:', error.message);
    }

    try {
      // Count total categories
      stats.totalCategories = await Category.countDocuments();
      console.log('Total categories:', stats.totalCategories);
    } catch (error) {
      console.error('Error counting categories:', error.message);
    }

    try {
      // Get recent assets (last 5)
      stats.recentActivity = await Asset.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('category', 'name')
        .select('name description createdAt category status')
        .lean();
      
      console.log('Recent activity count:', stats.recentActivity.length);
    } catch (error) {
      console.error('Error fetching recent activity:', error.message);
    }

    try {
      // Group assets by category
      stats.assetsByCategory = await Asset.aggregate([
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryInfo'
          }
        },
        {
          $unwind: {
            path: '$categoryInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
            count: { $sum: 1 }
          }
        }
      ]);
      
      console.log('Assets by category:', stats.assetsByCategory);
    } catch (error) {
      console.error('Error getting assets by category:', error.message);
    }

    // Round total value to 2 decimal places
    stats.totalValue = Math.round(stats.totalValue * 100) / 100;

    console.log('Final stats:', stats);

    res.json({
      success: true,
      data: stats,
      message: 'Dashboard statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/dashboard/recent-assets
router.get('/recent-assets', async (req, res) => {
  try {
    console.log('Recent assets endpoint hit');

    // Create audit log for API access
    try {
      await createAuditLog({
        userId: req.decodedToken?.uid || req.user.firebaseUid,
        action: 'API_ACCESS',
        resource: 'dashboard/recent-assets',
        details: {
          endpoint: req.originalUrl,
          method: req.method
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('⚠️ API access audit logging failed:', auditError.message);
    }

    const limit = parseInt(req.query.limit) || 10;

    // Get recent assets
    const recentAssets = await Asset.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('category', 'name')
      .populate('organization', 'name')
      .select('name description status createdAt category organization value')
      .lean();

    console.log('Recent assets fetched:', recentAssets.length);

    res.json({
      success: true,
      data: recentAssets,
      message: `Retrieved ${recentAssets.length} recent assets`
    });
  } catch (error) {
    console.error('Error fetching recent assets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent assets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /api/dashboard/quick-stats
router.get('/quick-stats', async (req, res) => {
  try {
    console.log('Quick stats endpoint hit');

    // Create audit log for API access
    try {
      await createAuditLog({
        userId: req.decodedToken?.uid || req.user.firebaseUid,
        action: 'API_ACCESS',
        resource: 'dashboard/quick-stats',
        details: {
          endpoint: req.originalUrl,
          method: req.method
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.error('⚠️ API access audit logging failed:', auditError.message);
    }

    const quickStats = {
      totalAssets: await Asset.countDocuments() || 0,
      timestamp: new Date().toISOString(),
      dbConnected: true
    };

    console.log('Quick stats:', quickStats);

    res.json({
      success: true,
      data: quickStats,
      message: 'Quick statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quick statistics',
      error: error.message,
      dbConnected: false
    });
  }
});

// GET /api/dashboard/health
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Dashboard routes are working',
    timestamp: new Date().toISOString(),
    user: req.user ? 'Authenticated' : 'Not authenticated'
  });
});

export default router;