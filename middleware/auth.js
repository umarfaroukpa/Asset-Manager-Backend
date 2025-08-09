import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin safely
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return true;
  
  console.log('🔥 Starting Firebase initialization...');
  
  try {
    let serviceAccount;
    
    // Method 1: File-based configuration (recommended)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const filePath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      console.log('📁 Loading Firebase config from file:', filePath);
      
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        serviceAccount = JSON.parse(fileContent);
        console.log('✅ Firebase service account loaded from file');
        console.log('   Project ID:', serviceAccount.project_id);
        console.log('   Client Email:', serviceAccount.client_email);
      } else {
        console.error('❌ Firebase service account file not found:', filePath);
        throw new Error(`Firebase service account file not found: ${filePath}`);
      }
    }
    // Method 2: Environment variables (fallback)
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🔧 Using Firebase config from environment variables');
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        type: "service_account",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token"
      };
      console.log('✅ Firebase service account created from env vars');
    }
    // Method 3: No configuration found
    else {
      console.warn('⚠️  No Firebase configuration found');
      console.warn('   Either set FIREBASE_SERVICE_ACCOUNT_PATH or individual Firebase env vars');
      console.warn('⚠️  Firebase authentication will be disabled. Using JWT-only authentication.');
      return false;
    }

    // Initialize Firebase Admin
    if (!admin.apps.length) {
      console.log('🚀 Initializing Firebase Admin...');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      
      firebaseInitialized = true;
      console.log('✅ Firebase Admin initialized successfully');
      
      return true;
    } else {
      console.log('✅ Firebase Admin already initialized');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    console.warn('⚠️  Falling back to JWT-only authentication');
    return false;
  }
};

// Enhanced Firebase token detection
const isFirebaseToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Firebase tokens have specific characteristics
    const isFirebase = (
      header.alg === 'RS256' &&
      payload.iss && 
      payload.iss.includes('securetoken.google.com') &&
      payload.aud &&
      payload.firebase &&
      payload.auth_time &&
      payload.exp &&
      payload.iat
    );
    
    console.log('🔍 Token analysis:', {
      algorithm: header.alg,
      issuer: payload.iss,
      audience: payload.aud,
      hasFirebaseField: !!payload.firebase,
      hasAuthTime: !!payload.auth_time,
      isFirebaseToken: isFirebase ? payload.exp : false
    });
    
    return isFirebase;
  } catch (error) {
    console.log('❌ Token parsing failed:', error.message);
    return false;
  }
};

// More robust JWT token detection
const isJWTToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // JWT tokens characteristics - be more flexible with algorithm detection
    const isJWT = (
      (header.alg === 'HS256' || header.alg === 'HS512' || header.alg === 'RS256') &&
      (payload.id || payload.sub || payload.userId) && // More flexible user ID detection
      payload.iat && // Issued at time
      payload.exp && // Expiration time
      !payload.firebase && // Not a Firebase token
      !payload.iss?.includes('securetoken.google.com') // Not issued by Firebase
    );
    
    console.log('🔍 JWT analysis:', {
      algorithm: header.alg,
      hasId: !!(payload.id || payload.sub || payload.userId),
      hasIat: !!payload.iat,
      hasExp: !!payload.exp,
      isJWTToken: isJWT
    });
    
    return isJWT;
  } catch (error) {
    console.log('❌ JWT parsing failed:', error.message);
    return false;
  }
};

// Create a user from Firebase token
const createUserFromFirebaseToken = async (decodedToken) => {
  try {
    console.log('👤 Creating new user from Firebase token...');
    console.log('   Firebase UID:', decodedToken.uid);
    console.log('   Email:', decodedToken.email);
    
    const user = new User({
      firebaseUID: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email?.split('@')[0] || 'Unknown User',
      role: decodedToken.role || 'user', 
      isActive: true,
      permissions: ['read'],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await user.save();
    console.log('✅ New user created in database');
    return user;
  } catch (error) {
    console.error('❌ Failed to create user:', error.message);
    throw error;
  }
};

// Authentication middleware with improved error handling
const authenticate = async (req, res, next) => {
  try {
    // Initialize Firebase on first use (lazy initialization)
    const firebaseAvailable = initializeFirebase();

    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required - No Authorization header' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    let user;
    let authType = 'unknown';
    let firebaseUid = null;
    
    console.log('🔍 Processing authentication...');
    console.log('   Token length:', token.length);
    console.log('   Route:', req.method, req.path);
    
    // Better token type detection order
    let tokenProcessed = false;

    // Method 0: Handle demo tokens (development only)
    if (process.env.NODE_ENV === 'development' && 
        (token === 'demo-admin-token' || token === 'demo-user-token')) {
      
      console.log('🧪 Using demo token for development');
      
      // Create a demo user object
      user = {
        _id: 'demo-user-id',
        email: 'demo@example.com',
        name: 'Demo User',
        role: token === 'demo-admin-token' ? 'admin' : 'user',
        firebaseUID: 'demo-firebase-uid',
        isActive: true,
        permissions: token === 'demo-admin-token' 
          ? ['read', 'create', 'update', 'delete', 'assign', 'reports']
          : ['read'],
        lastLogin: new Date()
      };
      
      authType = 'demo';
      tokenProcessed = true;
      
      // Attach user info to request object
      req.token = token;
      req.user = user;
      req.authType = authType;
      
      console.log(`✅ Demo authentication successful: ${user.email} (${authType})`);
      return next();
    }
    
    // Method 1: Handle Firebase ID tokens (primary method for your app)
    if (!tokenProcessed && firebaseAvailable && isFirebaseToken(token)) {
      try {
        console.log('🔥 Verifying Firebase ID token...');
        
        // Add checkRevoked option to verify the token is still valid
        const decodedToken = await admin.auth().verifyIdToken(token, true);
        console.log('✅ Firebase token verified successfully');
        console.log('   User:', decodedToken.email, 'UID:', decodedToken.uid);
        
        authType = 'firebase';
        firebaseUid = decodedToken.uid;
        tokenProcessed = true;
        
        // Find or create user in MongoDB based on Firebase UID
        user = await User.findOne({ firebaseUID: decodedToken.uid });
        
        if (!user) {
          user = await createUserFromFirebaseToken(decodedToken);
        } else {
          console.log('✅ Existing user found in database');
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();
        
      } catch (firebaseError) {
        console.error('❌ Firebase token verification failed:', firebaseError.message);
        console.error('   Error code:', firebaseError.code);
        console.error('   Error details:', firebaseError);
        
        // For signature errors, immediately return 401 instead of trying JWT
        if (firebaseError.code === 'auth/argument-error' || 
            firebaseError.message.includes('invalid signature')) {
          return res.status(401).json({ 
            success: false, 
            message: 'Invalid Firebase token - signature verification failed',
            code: 'FIREBASE_TOKEN_INVALID',
            error: firebaseError.message 
          });
        }
        
        // For other errors, try JWT as fallback
        console.log('🔄 Firebase verification failed, trying JWT...');
        tokenProcessed = false;
      }
    }
    
    // Method 2: Handle JWT tokens - Only if Firebase failed or not detected
    if (!tokenProcessed) {
      try {
        if (!process.env.JWT_SECRET) {
          console.warn('⚠️  No JWT_SECRET found. Cannot verify JWT tokens.');
          return res.status(401).json({ 
            success: false, 
            message: 'JWT authentication not configured' 
          });
        }
        
        console.log('🔑 Attempting JWT token verification...');
        
        // Try different algorithms
        let decoded;
        const algorithms = ['HS256', 'HS512', 'RS256'];
        
        for (const algorithm of algorithms) {
          try {
            decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [algorithm] });
            console.log(`✅ JWT verified with algorithm: ${algorithm}`);
            break;
          } catch (algError) {
            console.log(`❌ JWT verification failed with ${algorithm}:`, algError.message);
            continue;
          }
        }
        
        if (!decoded) {
          throw new Error('JWT verification failed with all algorithms');
        }
        
        authType = 'jwt';
        tokenProcessed = true;
        
        // Find user by ID (try different field names)
        const userId = decoded.id || decoded.sub || decoded.userId;
        user = await User.findById(userId);
        
        if (!user) {
          return res.status(401).json({ 
            success: false, 
            message: 'Invalid token - user not found' 
          });
        }
        
        // Check if password was changed after token was issued
        if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
          return res.status(401).json({ 
            success: false, 
            message: 'Password changed. Please log in again.' 
          });
        }
        
        console.log('✅ JWT token verified successfully');
        
      } catch (jwtError) {
        console.error('❌ JWT token verification failed:', jwtError.message);
        console.error('   JWT Error code:', jwtError.name);
        
        // Provide more specific error messages
        let errorMessage = 'Invalid token';
        if (jwtError.name === 'TokenExpiredError') {
          errorMessage = 'Token has expired. Please log in again.';
        } else if (jwtError.name === 'JsonWebTokenError') {
          errorMessage = 'Invalid token format';
        } else if (jwtError.name === 'NotBeforeError') {
          errorMessage = 'Token not active yet';
        }
        
        return res.status(401).json({ 
          success: false, 
          message: errorMessage,
          code: 'JWT_VERIFICATION_FAILED',
          error: jwtError.message 
        });
      }
    }
    
    // Final validation
    if (!user) {
      console.error('❌ No user found after token processing');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication failed - no user found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Check if user account is active
    if (!user.isActive) {
      console.error('❌ User account is inactive:', user.email);
      return res.status(403).json({ 
        success: false, 
        message: 'Account has been deactivated' 
      });
    }
    
    // Attach user info to request object
    req.token = token;
    req.user = user;
    req.authType = authType;
    
    console.log(`✅ Authentication successful: ${user.email} (${authType})`);
    
    // Audit log with field names matching schema
    try {
      await AuditLog.create({
        userId: firebaseUid || user._id.toString(),
        action: 'AUTH_SUCCESS',
        resource: 'authentication',
        resourceId: user._id.toString(),
        details: {
          method: req.method,
          path: req.path,
          role: user.role,
          authType: authType,
          timestamp: new Date()
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.warn('⚠️  Failed to create audit log:', auditError.message);
      // Don't fail the request if audit logging fails
    }
    
    next();
    
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    console.error('   Stack trace:', error.stack);
    res.status(401).json({ 
      success: false, 
      message: 'Authentication failed',
      code: 'AUTH_MIDDLEWARE_ERROR',
      error: error.message 
    });
  }
};

// Authorization middleware (role-based)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for authorization check'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. User role '${req.user.role}' is not authorized. Required: ${roles.join(' or ')}`
      });
    }
    
    console.log(`✅ Authorization successful: ${req.user.email} has role '${req.user.role}'`);
    next();
  };
};

// Permission-based authorization
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for permission check'
      });
    }
    
    // Admin users have all permissions
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user has required permissions
    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.every(perm => userPermissions.includes(perm));
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${permissions.join(', ')}. User has: ${userPermissions.join(', ')}`
      });
    }
    
    console.log(`✅ Permission check successful: ${req.user.email} has permissions [${permissions.join(', ')}]`);
    next();
  };
};

// Aliases for common usage
const authenticateToken = authenticate;

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
        message: `Access denied. Required role: ${roles.join(' or ')}, current role: ${req.user.role}`
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