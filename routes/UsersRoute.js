import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateUser } from '../middleware/Validations.js';
import User from '../models/User.js';
import Organization from '../models/Organizations.js';

// ✅ Import your Firebase Admin setup instead of direct admin import
import { verifyFirebaseToken, isFirebaseAdminReady, initializeFirebaseAdmin } from '../config/firebase-admin.js';

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
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 Fetching user profile for:', req.user?._id);
        
        // ✅ Try to fetch user with organization population first
        let user;
        try {
            user = await User.findById(req.user._id)
                .select('-firebaseUID -refreshTokens')
                .populate('organization', 'name description');
        } catch (populateError) {
            // If populate fails, fetch without population
            console.log('⚠️ Organization field not available for population, fetching without it...');
            user = await User.findById(req.user._id)
                .select('-firebaseUID -refreshTokens');
        }

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
                    displayName: user.name
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

// @route   PUT /api/users/me
// @desc    Update current user profile
// @access  Private
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { name, department, phone, avatar } = req.body;

        console.log('🔍 Updating current user profile for user:', req.user?.email);

        // ✅ Try to update and populate, fallback if population fails
        let user;
        try {
            user = await User.findByIdAndUpdate(
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
            .select('-firebaseUID -refreshTokens')
            .populate('organization', 'name description');
        } catch (populateError) {
            console.log('⚠️ Organization field not available for population, updating without it...');
            user = await User.findByIdAndUpdate(
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
            ).select('-firebaseUID -refreshTokens');
        }

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

        // ✅ Try to search with organization population first
        let users;
        try {
            users = await User.find({
                $or: [
                    { name: { $regex: q, $options: 'i' } },
                    { email: { $regex: q, $options: 'i' } }
                ],
                status: 'active'
            })
            .select('name email role department avatar')
            .limit(parseInt(limit))
            .sort({ name: 1 })
            .populate('organization', 'name');
        } catch (populateError) {
            console.log('⚠️ Organization field not available for population, searching without it...');
            users = await User.find({
                $or: [
                    { name: { $regex: q, $options: 'i' } },
                    { email: { $regex: q, $options: 'i' } }
                ],
                status: 'active'
            })
            .select('name email role department avatar')
            .limit(parseInt(limit))
            .sort({ name: 1 });
        }

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
        // ✅ Try to fetch with organization population first
        let user;
        try {
            user = await User.findById(req.params.id)
                .select('-firebaseUID -refreshTokens')
                .populate('organization', 'name description');
        } catch (populateError) {
            console.log('⚠️ Organization field not available for population, fetching without it...');
            user = await User.findById(req.params.id)
                .select('-firebaseUID -refreshTokens');
        }

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

// @route   POST /api/users/register
// @desc    Register new user via Firebase UID
// @access  Public (No admin role required)
router.post('/register', async (req, res) => {
  try {
    const { firebaseUID, email, name, userType, ...otherData } = req.body;

    console.log('📝 Registration attempt:', { firebaseUID, email, name, userType });

    // ✅ Check if authorization header exists
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Missing or invalid authorization token' 
      });
    }

    // Extract token from Bearer header
    const token = authHeader.split(' ')[1];
    
    // ✅ Use your Firebase Admin verification function instead of direct admin call
    console.log('🔍 Verifying Firebase token...');
    
    // Ensure Firebase Admin is initialized
    if (!isFirebaseAdminReady()) {
      console.log('🔄 Firebase Admin not ready, initializing...');
      await initializeFirebaseAdmin();
    }
    
    // Verify the token using your custom function
    const decodedToken = await verifyFirebaseToken(token);
    
    if (decodedToken.uid !== firebaseUID) {
      return res.status(403).json({ 
        success: false, 
        message: 'Token does not match user' 
      });
    }

    console.log('✅ Token verified for user:', decodedToken.email);

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { firebaseUID: firebaseUID },
        { email: email }
      ]
    });

    if (existingUser) {
      console.log('⚠️ User already exists:', existingUser.email);
      return res.status(409).json({ 
        success: false, 
        message: 'User already exists with this email or Firebase UID' 
      });
    }

    // Create new user
    const user = new User({
      firebaseUID,
      email,
      name: name || email.split('@')[0],
      role: 'user', // Default role
      status: 'active',
      userType,
      ...otherData
    });

    await user.save();
    console.log('✅ User created successfully:', user.email);
    
    // ✅ Return user data without trying to populate organization
    // Just get the basic user data without population
    const userResponse = await User.findById(user._id)
      .select('-firebaseUID -refreshTokens');
    
    res.status(201).json({ 
      success: true, 
      message: 'User registered successfully',
      data: { user: userResponse } 
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific Firebase errors
    if (error.message.includes('Token has expired')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication token has expired' 
      });
    } else if (error.message.includes('Token has been revoked')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication token has been revoked' 
      });
    } else if (error.message.includes('Invalid token signature')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    } else if (error.message.includes('Firebase Admin initialization failed')) {
      return res.status(500).json({ 
        success: false, 
        message: 'Authentication service unavailable' 
      });
    }
    
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Registration failed' 
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

        // Verify organization exists (only if organization field exists in schema)
        if (organization) {
            try {
                const org = await Organization.findById(organization);
                if (!org) {
                    return res.status(400).json({
                        success: false,
                        message: 'Organization not found'
                    });
                }
            } catch (orgError) {
                console.log('⚠️ Organization validation skipped - field may not exist in schema');
            }
        }

        // Create user data
        const userData = {
            name,
            email,
            role,
            department,
            phone,
            status: 'active'
        };

        // Only add organization if it exists in schema
        if (organization && req.user.organization) {
            userData.organization = organization || req.user.organization;
        }

        const user = new User(userData);
        await user.save();

        // ✅ Only populate organization if the field exists in schema
        let savedUser;
        try {
            savedUser = await User.findById(user._id).populate('organization', 'name');
        } catch (populateError) {
            console.log('⚠️ Organization field not available for population, returning basic user data');
            savedUser = await User.findById(user._id);
        }

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: { user: savedUser }
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

        // ✅ Try to update with organization population first
        let user;
        try {
            user = await User.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            )
            .select('-firebaseUID -refreshTokens')
            .populate('organization', 'name');
        } catch (populateError) {
            console.log('⚠️ Organization field not available for population, updating without it...');
            user = await User.findByIdAndUpdate(
                req.params.id,
                updateData,
                { new: true, runValidators: true }
            ).select('-firebaseUID -refreshTokens');
        }

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