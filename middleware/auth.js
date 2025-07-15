const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// Initialize Firebase Admin
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// Authentication middleware - supports both JWT and Firebase tokens
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Determine token type and verify accordingly
    let user;
    if (token.startsWith('firebase_')) {
      // Firebase token verification
      const firebaseToken = token.replace('firebase_', '');
      const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      
      // Find or create user in database
      user = await User.findOne({ firebaseUID: decodedToken.uid });
      
      if (!user) {
        user = new User({
          firebaseUID: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email.split('@')[0],
          role: 'user',
          isActive: true,
          permissions: ['read']
        });
        await user.save();
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();
    } else {
      // JWT token verification
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user
      user = await User.findOne({ _id: decoded.id, 'tokens.token': token });
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Account deactivated' });
      }
      
      // Check if password was changed after token was issued
      if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
        return res.status(401).json({ success: false, message: 'Password changed. Please log in again.' });
      }
    }
    
    // Attach user and token to request
    req.token = token;
    req.user = user;
    
    // Log the request
    await AuditLog.create({
      action: req.method + ' ' + req.path,
      performedBy: user._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        role: user.role,
        authType: token.startsWith('firebase_') ? 'firebase' : 'jwt'
      }
    });
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Please authenticate',
      error: error.message 
    });
  }
};

// Authorization middleware (role-based)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Check specific permissions
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (req.user.role === 'admin') {
      return next();
    }
    
    const hasPermission = permissions.every(perm => 
      req.user.permissions.includes(perm)
    );
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  requirePermission
};