import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateUser } from '../middleware/Validations.js';
import User from '../models/User.js';
import Organization from '../models/Organizations.js';


// Initialize Organization with potential fallback
let OrganizationModel;

try {
    // Try to import the actual Organization model
    const orgModule = await import('../models/Organizations.js');
    OrganizationModel = orgModule.default;
    console.log('✅ Organization model imported successfully');
} catch (err) {
    console.error('❌ Organization model import failed, using fallback');
    // Fallback implementation
    OrganizationModel = class Organization {
        static findById() {
            return Promise.resolve({
                _id: 'demo-org-id',
                name: 'Demo Organization'
            });
        }
    };
}

const router = express.Router();

// Helper function to handle errors
const handleError = (res, error, operation) => {
    console.error(`❌ ${operation} error:`, error);
    res.status(500).json({
        success: false,
        message: `Server error while ${operation}`
    });
};


// @route   GET /api/users/:uid/role
// @desc    Get user role by Firebase UID
// @access  Private
router.get('/:uid/role', authenticateToken, async (req, res) => {
    try {
        const { uid } = req.params;
        
        console.log('🔍 Fetching role for Firebase UID:', uid);
        
        // Find user by Firebase UID
        const user = await User.findOne({ firebaseUID: uid })
            .select('role email name');

        if (!user) {
            console.log('❌ User not found for UID:', uid);
            // Return default role instead of error to prevent auth failures
            return res.json({
                success: true,
                role: 'user', // Default role
                message: 'User not found in database, using default role'
            });
        }

        console.log('✅ User role found:', {
            uid: uid,
            email: user.email,
            role: user.role
        });

        res.json({
            success: true,
            role: user.role || 'user' // Fallback to 'user' if role is undefined
        });
    } catch (error) {
        console.error('❌ Get user role error:', error);
        
        // Return default role instead of error to prevent auth failures
        res.json({
            success: true,
            role: 'user', // Default role
            message: 'Error fetching role, using default'
        });
    }
});

// @route   GET /api/users/me
// @desc    Get current user profile
// @access  Private
// In your users route, modify the response logging:
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-firebaseUID -refreshTokens');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User profile not found' });
        }

        console.log('User document from DB:', JSON.stringify(user, null, 2)); 
        
        res.json({
            success: true,
            data: { 
                user: {
                    ...user.toObject(),
                    role: user.role
                }
            }
        });
    } catch (error) {
        handleError(res, error, 'fetching user profile');
    }
});

// @route   PUT /api/users/me
// @desc    Update current user profile
// @access  Private
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { name, department, phone, avatar } = req.body;

        console.log('🔍 Updating current user profile for user:', req.user?.email);

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { 
                name, 
                department, 
                phone, 
                avatar,
                updatedAt: new Date()
            },
            { 
                new: true, 
                runValidators: true 
            }
        )
        .populate('organization', 'name description')
        .select('-firebaseUID -refreshTokens');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found'
            });
        }

        console.log('✅ User profile updated:', user.email);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: { user }
        });
    } catch (error) {
        console.error('❌ Update current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating profile'
        });
    }
});

// @route   GET /api/users
// @desc    Get all users (with pagination and filtering)
// @access  Private (Admin/Manager only)
// @route   GET /api/users/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 Fetching user profile for:', req.user?._id);
        
        const user = await User.findById(req.user._id)
            .populate('organization', 'name description')
            .select('-firebaseUID -refreshTokens');

        if (!user) {
            console.log('❌ User profile not found for ID:', req.user?._id);
            return res.status(404).json({ 
                success: false, 
                message: 'User profile not found' 
            });
        }

        console.log('✅ User profile found:', {
            id: user._id,
            email: user.email,
            role: user.role,
            name: user.name
        });
        
        res.json({
            success: true,
            data: { 
                user: {
                    ...user.toObject(),
                    role: user.role || 'user', // Ensure role is always present
                    displayName: user.name // Add displayName for frontend compatibility
                }
            }
        });
    } catch (error) {
        console.error('❌ Get user profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// @route   GET /api/users/search
// @desc    Search users by name or email
// @access  Private
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const users = await User.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ],
            status: 'active'
        })
        .populate('organization', 'name')
        .select('name email role department avatar')
        .limit(parseInt(limit))
        .sort({ name: 1 });

        res.json({
            success: true,
            data: { users }
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while searching users'
        });
    }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('organization', 'name description')
            .select('-firebaseUID -refreshTokens');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user can view this profile
        if (req.user.role !== 'admin' && req.user._id.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user'
        });
    }
});

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin only)
router.post('/', authenticateToken, requireRole(['admin']), validateUser, async (req, res) => {
    try {
        const { name, email, role, department, phone, organization } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Verify organization exists
        if (organization) {
            const org = await Organization.findById(organization);
            if (!org) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization not found'
                });
            }
        }

        const user = new User({
            name,
            email,
            role,
            department,
            phone,
            organization: organization || req.user.organization,
            status: 'active'
        });

        await user.save();

        // Populate organization data before sending response
        await user.populate('organization', 'name');

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: { user }
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating user'
        });
    }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', authenticateToken, validateUser, async (req, res) => {
    try {
        const { name, department, phone, role, status } = req.body;

        // Check if user can update this profile
        if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Non-admin users cannot change role or status
        const updateData = { name, department, phone };
        if (req.user.role === 'admin') {
            updateData.role = role;
            updateData.status = status;
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        )
        .populate('organization', 'name')
        .select('-firebaseUID -refreshTokens');

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
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating user'
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        // Prevent admin from deleting themselves
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { status: 'deleted', deletedAt: new Date() },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting user'
        });
    }
});

// @route   POST /api/users/:id/restore
// @desc    Restore deleted user
// @access  Private (Admin only)
router.post('/:id/restore', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'active', 
                $unset: { deletedAt: 1 }
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User restored successfully',
            data: { user }
        });
    } catch (error) {
        console.error('Restore user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while restoring user'
        });
    }
});

// @route   GET /api/users/stats/summary
// @desc    Get user statistics
// @access  Private (Admin/Manager only)
router.get('/stats/summary', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
    try {
        const stats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                    inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
                    deleted: { $sum: { $cond: [{ $eq: ['$status', 'deleted'] }, 1, 0] } }
                }
            }
        ]);

        const roleStats = await User.aggregate([
            { $match: { status: 'active' } },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            }
        ]);

        const departmentStats = await User.aggregate([
            { $match: { status: 'active' } },
            {
                $group: {
                    _id: '$department',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                overview: stats[0] || { total: 0, active: 0, inactive: 0, deleted: 0 },
                byRole: roleStats,
                byDepartment: departmentStats
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user statistics'
        });
    }
});

export default router;