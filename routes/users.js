import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import User from '../models/User.js';
import Organization from '../models/Organizations.js';

const router = express.Router();

// Apply authentication to all user routes
router.use(authenticateToken);

// @route   GET /api/users/search
// @desc    Search users
// @access  Private (Admin/Manager only)
router.get('/search', requireRole('admin', 'manager'), async (req, res) => {
    try {
        const { q, role, department, isActive } = req.query;

        const query = { organizationId: req.user.organizationId };

        if (q) {
            query.$or = [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
                { department: { $regex: q, $options: 'i' } }
            ];
        }

        if (role) query.role = role;
        if (department) query.department = department;
        if (typeof isActive === 'string') query.isActive = isActive === 'true';

        const users = await User.find(query)
            .select('-firebaseUID')
            .sort({ name: 1 })
            .limit(50); // Limit results

        res.json({
            success: true,
            count: users.length,
            data: { users }
        });
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error searching users'
        });
    }
});

// @route   GET /api/users
// @desc    Get all users in organization
// @access  Private (Admin/Manager only)
router.get('/', requireRole('admin', 'manager'), async (req, res) => {
    try {
        const users = await User.find({ 
            organizationId: req.user.organizationId,
            isActive: true 
        })
        .select('-firebaseUID')
        .sort({ name: 1 });

        res.json({
            success: true,
            count: users.length,
            data: { users }
        });
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching users'
        });
    }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin/Manager or own profile)
router.get('/:id', async (req, res) => {
    try {
        // Check if user is accessing their own profile or has admin/manager role
        if (req.params.id !== req.user._id.toString() && 
            !['admin', 'manager'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const user = await User.findById(req.params.id)
            .select('-firebaseUID')
            .populate('organizationId', 'name type');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('User fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching user'
        });
    }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin only or own profile for basic fields)
router.put('/:id', async (req, res) => {
    try {
        const { name, department, phone, role, permissions, isActive } = req.body;
        const targetUserId = req.params.id;
        const isOwnProfile = targetUserId === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        // Check permissions
        if (!isOwnProfile && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Prepare update data
        const updateData = { name, department, phone };

        // Only admins can update role, permissions, and isActive
        if (isAdmin && !isOwnProfile) {
            if (role) updateData.role = role;
            if (permissions) updateData.permissions = permissions;
            if (typeof isActive === 'boolean') updateData.isActive = isActive;
        }

        const user = await User.findByIdAndUpdate(
            targetUserId,
            updateData,
            { new: true, runValidators: true }
        ).select('-firebaseUID');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            data: { user }
        });
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating user'
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    Deactivate user (soft delete)
// @access  Private (Admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        ).select('-firebaseUID');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deactivated successfully',
            data: { user }
        });
    } catch (error) {
        console.error('User deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deactivating user'
        });
    }
});

// @route   POST /api/users/:id/activate
// @desc    Reactivate user
// @access  Private (Admin only)
router.post('/:id/activate', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: true },
            { new: true }
        ).select('-firebaseUID');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User activated successfully',
            data: { user }
        });
    } catch (error) {
        console.error('User activation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error activating user'
        });
    }
});

export default router;
