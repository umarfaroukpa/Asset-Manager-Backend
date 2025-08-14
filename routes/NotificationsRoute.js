import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import AssetsLog from '../models/AssetsLog.js';

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get all notifications for the user's organization
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page );
    const limitNum = parseInt(limit );
    const organizationId = req.user.organizationId;

    console.log(`📢 Fetching notifications for organization ${organizationId}, page ${page}, limit ${limit}...`);

    // Fetch maintenance notifications (overdue or upcoming)
    const now = new Date();
    const upcomingThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const maintenanceNotifications = await Asset.find({
      organization: organizationId,
      nextMaintenance: { $lte: upcomingThreshold },
    })
      .select('name assetTag nextMaintenance')
      .lean()
      .then((assets) =>
        assets.map((asset, index) => ({
          id: `maintenance-${asset._id}-${index}`,
          type: 'maintenance',
          message: `Asset "${asset.name}" (${asset.assetTag}) needs maintenance`,
          priority: asset.nextMaintenance < now ? 'high' : 'medium',
          createdAt: asset.nextMaintenance || now.toISOString(),
          assetId: asset._id.toString(),
          read: false,
        }))
      );

    // Fetch warranty notifications (placeholder; assumes warranty info in Asset model)
    const warrantyNotifications = await Asset.find({
      organization: organizationId,
      warrantyEnd: { $lte: upcomingThreshold },
    })
      .select('name assetTag warrantyEnd')
      .lean()
      .then((assets) =>
        assets.map((asset, index) => ({
          id: `warranty-${asset._id}-${index}`,
          type: 'warranty',
          message: `Warranty for asset "${asset.name}" (${asset.assetTag}) is expiring soon`,
          priority: 'medium',
          createdAt: asset.warrantyEnd || now.toISOString(),
          assetId: asset._id.toString(),
          read: false,
        }))
      );

    // Fetch assignment notifications from AssetsLog
    const assignmentNotifications = await AssetsLog.find({
      organization: organizationId,
      action: 'ASSIGNMENT',
      createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    })
      .populate('asset', 'name assetTag')
      .populate('performedBy', 'name')
      .lean()
      .then((logs) =>
        logs.map((log, index) => ({
          id: `assignment-${log._id}-${index}`,
          type: 'assignment',
          message: `Asset "${log.asset?.name}" (${log.asset?.assetTag}) assigned to ${log.performedBy?.name}`,
          priority: 'low',
          createdAt: log.createdAt.toISOString(),
          assetId: log.asset?._id.toString(),
          read: false,
        }))
      );

    // Combine and sort notifications
    const allNotifications = [
      ...maintenanceNotifications,
      ...warrantyNotifications,
      ...assignmentNotifications,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedNotifications = allNotifications.slice(startIndex, startIndex + limitNum);

    res.status(200).json({
      success: true,
      data: paginatedNotifications,
      count: paginatedNotifications.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: allNotifications.length,
        pages: Math.ceil(allNotifications.length / limitNum),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📢 Marking notification ${id} as read...`);

    // Placeholder: Since notifications are generated dynamically, you may need a Notification model
    // For now, return success to allow frontend to update UI
    res.status(200).json({
      success: true,
      message: `Notification ${id} marked as read`,
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message,
    });
  }
});

export default router;