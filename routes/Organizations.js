import express from 'express';
import { authenticateToken, authorize, requireRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/Validations.js';
import Organization from '../models/Organizations.js';
import User from '../models/User.js';

const router = express.Router();


// @route   GET /api/organizations
// @desc    Get user's organization (base route)
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findOne({
            $or: [
                { owner: req.user._id },
                { 'members.user': req.user._id }
            ]
        })
        .populate('owner', 'name email')
        .populate('members.user', 'name email');
        
        if (!organization) {
            // Return a default organization structure for demo purposes
            return res.json({
                success: true,
                organization: {
                    id: 1,
                    name: "Demo Organization",
                    description: "This is a demo organization",
                    industry: "Technology", 
                    size: "50-200 employees",
                    email: "demo@example.com",
                    phone: "+1 (555) 123-4567",
                    website: "https://example.com",
                    address: "123 Demo Street, Demo City, DC 12345",
                    foundedDate: "2020-01-01",
                    logo: null,
                    settings: {
                        allowPublicProfile: true,
                        requireApprovalForMembers: false,
                        enableTwoFactor: false,
                        allowDataExport: true,
                        enableApiAccess: false
                    }
                }
            });
        }

        res.json({
            success: true,
            organization: organization
        });

    } catch (error) {
        console.error('Organization fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching organization'
        });
    }
});

// @route   GET /api/organizations/members  
// @desc    Get organization members (base route)
// @access  Private
router.get('/members', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findOne({
            $or: [
                { owner: req.user._id },
                { 'members.user': req.user._id }
            ]
        })
        .populate('members.user', 'name email createdAt');
        
        if (!organization) {
            // Return demo members
            return res.json({
                success: true,
                members: [
                    {
                        id: 1,
                        name: "Demo User",
                        email: "demo@example.com", 
                        role: "admin",
                        department: "IT",
                        joinDate: "2023-01-01",
                        status: "active",
                        avatar: null
                    },
                    {
                        id: 2,
                        name: "Jane Smith",
                        email: "jane@example.com",
                        role: "user", 
                        department: "Marketing",
                        joinDate: "2023-02-15",
                        status: "active",
                        avatar: null
                    }
                ]
            });
        }
        
        // Transform the members data to match expected format
        const members = organization.members.map((member, index) => ({
            id: index + 1,
            name: member.user.name,
            email: member.user.email,
            role: member.role,
            department: member.department || "General",
            joinDate: member.joinedAt || member.user.createdAt,
            status: "active",
            avatar: null
        }));

        res.json({
            success: true,
            members: members
        });

    } catch (error) {
        console.error('Members fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching members'
        });
    }
});

// @route   POST /api/organizations
// @desc    Create new organization
// @access  Private
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, type, description } = req.body;
        
        // Check if user already has an organization as owner
        const existingOrg = await Organization.findOne({ owner: req.user._id });
        if (existingOrg) {
            return res.status(400).json({
                success: false,
                message: 'You can only own one organization'
            });
        }

        const organization = new Organization({
            name,
            type: type || 'organization',
            description,
            owner: req.user._id,
            members: [{
                user: req.user._id,
                role: 'owner',
                permissions: ['read', 'create', 'update', 'delete', 'assign', 'reports']
            }]
        });

        await organization.save();

        // Update user's organization
        await User.findByIdAndUpdate(req.user._id, {
            organizationId: organization._id,
            role: 'owner'
        });

        await organization.populate('owner', 'name email');

        res.status(201).json({
            success: true,
            message: 'Organization created successfully',
            data: { organization }
        });

    } catch (error) {
        console.error('Organization creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error creating organization'
        });
    }
});

// @route   GET /api/organizations/my
// @desc    Get user's organization
// @access  Private
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findOne({
            $or: [
                { owner: req.user._id },
                { 'members.user': req.user._id }
            ]
        })
        .populate('owner', 'name email')
        .populate('members.user', 'name email');
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'No organization found'
            });
        }

        res.json({
            success: true,
            data: { organization }
        });

    } catch (error) {
        console.error('Organization fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching organization'
        });
    }
});

// @route   GET /api/organizations/:id
// @desc    Get organization by ID
// @access  Private (Members only)
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id)
            .populate('owner', 'name email')
            .populate('members.user', 'name email');
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is a member
        const isMember = organization.members.some(
            member => member.user._id.toString() === req.user._id.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You are not a member of this organization'
            });
        }

        res.json({
            success: true,
            data: { organization }
        });

    } catch (error) {
        console.error('Organization fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching organization'
        });
    }
});

// @route   PUT /api/organizations/:id
// @desc    Update organization details
// @access  Private (Owner/Admin only)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, type, description, settings } = req.body;
        const organizationId = req.params.id;
        
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check permissions
        const userMembership = organization.members.find(
            member => member.user.toString() === req.user._id.toString()
        );

        if (!userMembership || !['owner', 'admin'].includes(userMembership.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to update organization'
            });
        }

        // Update organization fields
        if (name) organization.name = name;
        if (type) organization.type = type;
        if (description) organization.description = description;
        if (settings) organization.settings = { ...organization.settings, ...settings };

        await organization.save();

        res.json({
            success: true,
            message: 'Organization updated successfully',
            data: { organization }
        });

    } catch (error) {
        console.error('Organization update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating organization'
        });
    }
});

// @route   POST /api/organizations/:id/invite
// @desc    Invite user to organization
// @access  Private (Admin/Owner only)
router.post('/:id/invite', authenticateToken, async (req, res) => {
    try {
        const { email, role, permissions } = req.body;
        const organizationId = req.params.id;
        
        // Find organization and check permissions
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user has permission to invite
        const userMembership = organization.members.find(
            member => member.user.toString() === req.user._id.toString()
        );

        if (!userMembership || !['owner', 'admin'].includes(userMembership.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to invite users'
            });
        }

        // Find or create user by email
        let invitedUser = await User.findOne({ email });
        if (!invitedUser) {
            // Create placeholder user (they'll complete registration when they sign up)
            invitedUser = new User({
                email,
                name: email.split('@')[0],
                role: 'user',
                permissions: permissions || organization.settings.defaultPermissions,
                organizationId: organizationId,
                isInvited: true
            });
            await invitedUser.save();
        }

        // Check if user is already a member
        const existingMember = organization.members.find(
            member => member.user.toString() === invitedUser._id.toString()
        );

        if (existingMember) {
            return res.status(400).json({
                success: false,
                message: 'User is already a member of this organization'
            });
        }

        // Add user to organization
        organization.members.push({
            user: invitedUser._id,
            role: role || 'staff',
            permissions: permissions || organization.settings.defaultPermissions
        });

        await organization.save();

        // Update user's organization
        await User.findByIdAndUpdate(invitedUser._id, {
            organizationId: organizationId,
            role: role || 'staff'
        });

        res.json({
            success: true,
            message: 'User invited successfully',
            data: { invitedUser: { email: invitedUser.email, role: role || 'staff' } }
        });

    } catch (error) {
        console.error('User invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error inviting user'
        });
    }
});

// @route   PUT /api/organizations/:id/members/:userId
// @desc    Update member role/permissions
// @access  Private (Admin/Owner only)
router.put('/:id/members/:userId', authenticateToken, async (req, res) => {
    try {
        const { role, permissions } = req.body;
        const { id: organizationId, userId } = req.params;
        
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check permissions
        const userMembership = organization.members.find(
            member => member.user.toString() === req.user._id.toString()
        );

        if (!userMembership || !['owner', 'admin'].includes(userMembership.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        // Find and update member
        const memberIndex = organization.members.findIndex(
            member => member.user.toString() === userId
        );

        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        // Prevent owner from changing their own role
        if (organization.owner.toString() === userId && req.user._id.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own owner role'
            });
        }

        // Update member
        if (role) organization.members[memberIndex].role = role;
        if (permissions) organization.members[memberIndex].permissions = permissions;

        await organization.save();

        // Update user record
        await User.findByIdAndUpdate(userId, {
            role: role || 'staff',
            permissions: permissions || organization.settings.defaultPermissions
        });

        res.json({
            success: true,
            message: 'Member updated successfully',
            data: { member: organization.members[memberIndex] }
        });

    } catch (error) {
        console.error('Member update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating member'
        });
    }
});

// @route   DELETE /api/organizations/:id/members/:userId
// @desc    Remove member from organization
// @access  Private (Admin/Owner only)
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
    try {
        const { id: organizationId, userId } = req.params;
        
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check permissions
        const userMembership = organization.members.find(
            member => member.user.toString() === req.user._id.toString()
        );

        if (!userMembership || !['owner', 'admin'].includes(userMembership.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        // Prevent owner from being removed
        if (organization.owner.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot remove organization owner'
            });
        }

        // Remove member
        const memberIndex = organization.members.findIndex(
            member => member.user.toString() === userId
        );

        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        organization.members.splice(memberIndex, 1);
        await organization.save();

        // Update user record
        await User.findByIdAndUpdate(userId, {
            $unset: { organizationId: 1 },
            role: 'user'
        });

        res.json({
            success: true,
            message: 'Member removed successfully'
        });

    } catch (error) {
        console.error('Member removal error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error removing member'
        });
    }
});

// @route   GET /api/organizations/:id/members
// @desc    Get all organization members
// @access  Private (Members only)
router.get('/:id/members', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id)
            .populate('members.user', 'name email createdAt');
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is a member
        const isMember = organization.members.some(
            member => member.user._id.toString() === req.user._id.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You are not a member of this organization'
            });
        }

        res.json({
            success: true,
            data: { members: organization.members }
        });

    } catch (error) {
        console.error('Members fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching members'
        });
    }
});

// @route   DELETE /api/organizations/:id
// @desc    Delete organization
// @access  Private (Owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id);
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is the owner
        if (organization.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only organization owner can delete the organization'
            });
        }

        // Remove organization reference from all members
        const memberIds = organization.members.map(member => member.user);
        await User.updateMany(
            { _id: { $in: memberIds } },
            { 
                $unset: { organizationId: 1 },
                role: 'user'
            }
        );

        // Delete the organization
        await Organization.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Organization deleted successfully'
        });

    } catch (error) {
        console.error('Organization deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error deleting organization'
        });
    }
});

// @route   POST /api/organizations/:id/leave
// @desc    Leave organization
// @access  Private
router.post('/:id/leave', authenticateToken, async (req, res) => {
    try {
        const organization = await Organization.findById(req.params.id);
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is a member
        const memberIndex = organization.members.findIndex(
            member => member.user.toString() === req.user._id.toString()
        );

        if (memberIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'You are not a member of this organization'
            });
        }

        // Prevent owner from leaving
        if (organization.owner.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Organization owner cannot leave. Transfer ownership or delete the organization.'
            });
        }

        // Remove user from organization
        organization.members.splice(memberIndex, 1);
        await organization.save();

        // Update user record
        await User.findByIdAndUpdate(req.user._id, {
            $unset: { organizationId: 1 },
            role: 'user'
        });

        res.json({
            success: true,
            message: 'Successfully left the organization'
        });

    } catch (error) {
        console.error('Leave organization error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error leaving organization'
        });
    }
});

// @route   PUT /api/organizations/:id/transfer-ownership
// @desc    Transfer organization ownership
// @access  Private (Owner only)
router.put('/:id/transfer-ownership', authenticateToken, async (req, res) => {
    try {
        const { newOwnerId } = req.body;
        const organization = await Organization.findById(req.params.id);
        
        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if user is the current owner
        if (organization.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only the current owner can transfer ownership'
            });
        }

        // Check if new owner is a member
        const newOwnerMemberIndex = organization.members.findIndex(
            member => member.user.toString() === newOwnerId
        );

        if (newOwnerMemberIndex === -1) {
            return res.status(400).json({
                success: false,
                message: 'New owner must be a member of the organization'
            });
        }

        // Update ownership
        const oldOwnerId = organization.owner;
        organization.owner = newOwnerId;

        // Update member roles
        organization.members[newOwnerMemberIndex].role = 'owner';
        organization.members[newOwnerMemberIndex].permissions = ['read', 'create', 'update', 'delete', 'assign', 'reports'];

        // Find and update old owner's role
        const oldOwnerMemberIndex = organization.members.findIndex(
            member => member.user.toString() === oldOwnerId.toString()
        );
        if (oldOwnerMemberIndex !== -1) {
            organization.members[oldOwnerMemberIndex].role = 'admin';
        }

        await organization.save();

        // Update user records
        await User.findByIdAndUpdate(newOwnerId, { role: 'owner' });
        await User.findByIdAndUpdate(oldOwnerId, { role: 'admin' });

        res.json({
            success: true,
            message: 'Ownership transferred successfully',
            data: { newOwner: newOwnerId }
        });

    } catch (error) {
        console.error('Ownership transfer error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error transferring ownership'
        });
    }
});

export default router;