import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

// Initialize Firebase Admin safely
let firebaseInitialized = false;

try {
    // Check if Firebase environment variables are available
    const requiredEnvVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.warn('⚠️  Warning: Missing Firebase environment variables:', missingVars);
        console.warn('⚠️  Firebase authentication will be disabled. Using JWT-only authentication.');
        console.warn('⚠️  Please set up Firebase credentials in .env file for full functionality.');
    } else {
        const serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        };

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin initialized successfully');
        }
    }
} catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.warn('⚠️  Falling back to JWT-only authentication');
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
    if (token.startsWith('firebase_') && firebaseInitialized) {
      // Firebase token verification (only if Firebase is initialized)
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
    } else if (token.startsWith('firebase_') && !firebaseInitialized) {
      // Firebase token provided but Firebase not initialized
      return res.status(503).json({ 
        success: false, 
        message: 'Firebase authentication is not configured. Please use JWT tokens or configure Firebase.' 
      });
    } else {
      // JWT token verification or plain token
      try {
        if (process.env.JWT_SECRET) {
          // Try JWT verification first
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          user = await User.findById(decoded.id);
        } else {
          // If no JWT_SECRET, try to find user by a simple token (for development)
          console.warn('⚠️  No JWT_SECRET found. Using basic token authentication for development only.');
          user = await User.findOne({ 'developmentToken': token });
        }
        
        if (!user) {
          return res.status(401).json({ success: false, message: 'Invalid token or user not found' });
        }
      } catch (jwtError) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
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

// Alias for authenticate function (commonly used name)
const authenticateToken = authenticate;

// Role-based authorization middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    
    next();
  };
};

export {
  authenticate,
  authorize,
  requirePermission,
  authenticateToken,
  requireRole
};