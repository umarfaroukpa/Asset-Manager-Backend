import AuditLog from '../models/AuditLog.js';

export const createAuditLog = async (logData) => {
    try {
        console.log('🔍 Attempting to create audit log with data:', JSON.stringify(logData, null, 2));
        
        // Validate required fields before creating
        if (!logData.userId) {
            console.error('❌ Cannot create audit log: userId is required');
            console.error('❌ Received logData:', logData);
            return null;
        }
        
        if (!logData.resource) {
            console.error('❌ Cannot create audit log: resource is required');
            console.error('❌ Received logData:', logData);
            return null;
        }

        const auditLog = new AuditLog({
            userId: logData.userId,
            action: logData.action,
            resource: logData.resource,
            resourceId: logData.resourceId || null,
            details: logData.details || {},
            ipAddress: logData.ipAddress || null,
            userAgent: logData.userAgent || null
        });

        await auditLog.save();
        console.log('✅ Audit log created successfully');
        return auditLog;
    } catch (error) {
        console.error('❌ Failed to create audit log:', error.message);
        return null;
    }
};

// Example usage in your authentication middleware
export const auditAuthSuccess = async (req, user) => {
    await createAuditLog({
        userId: user.uid || user._id, // Use Firebase UID or MongoDB _id
        action: 'AUTH_SUCCESS',
        resource: 'authentication',
        resourceId: user.uid,
        details: {
            email: user.email,
            method: 'firebase'
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
};

// Example usage in your API routes
export const auditApiAccess = async (req, user) => {
    await createAuditLog({
        userId: user.uid || user._id,
        action: 'API_ACCESS',
        resource: req.route?.path || req.path,
        resourceId: null,
        details: {
            method: req.method,
            endpoint: req.originalUrl
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
};

// Updated authentication middleware example
export const authenticateUser = async (req, res, next) => {
    try {
        // Your existing authentication logic...
        const token = req.headers.authorization?.split(' ')[1];
        
        // Verify Firebase token (your existing code)
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Find or create user in database
        const user = await User.findOne({ firebaseUid: decodedToken.uid });
        
        if (user) {
            req.user = user;
            
            // Create audit log with proper data
            await auditAuthSuccess(req, {
                uid: decodedToken.uid,
                email: decodedToken.email,
                _id: user._id
            });
            
            next();
        } else {
            throw new Error('User not found in database');
        }
    } catch (error) {
        console.error('Authentication failed:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// Route handler example with audit logging
export const getMembersHandler = async (req, res) => {
    try {
        // Your existing logic to get members...
        const members = await Organization.findById(req.params.orgId).populate('members');
        
        // Create audit log for API access
        await auditApiAccess(req, req.user);
        
        res.json(members);
    } catch (error) {
        console.error('Error getting members:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};