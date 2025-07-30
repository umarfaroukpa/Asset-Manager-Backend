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
      
      // Test the connection
      console.log('🧪 Testing Firebase connection...');
      admin.auth().listUsers(1)
        .then(() => {
          console.log('✅ Firebase connection test successful');
        })
        .catch(err => {
          console.error('❌ Firebase connection test failed:', err.message);
          console.error('   This might indicate incorrect credentials or permissions');
        });
      
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

// Firebase token detection
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
      isFirebaseToken: isFirebase
    });
    
    return isFirebase;
  } catch (error) {
    console.log('❌ Token parsing failed:', error.message);
    return false;
  }
};

//More robust JWT token detection
const isJWTToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // JWT tokens characteristics
    const isJWT = (
      (header.alg === 'HS256' || header.alg === 'HS512') && // Our app likely uses HMAC
      payload.id && // Our JWT tokens likely have an 'id' field
      payload.iat && // Issued at time
      payload.exp && // Expiration time
      !payload.firebase && // Not a Firebase token
      !payload.iss?.includes('securetoken.google.com') // Not issued by Firebase
    );
    
    console.log('🔍 JWT analysis:', {
      algorithm: header.alg,
      hasId: !!payload.id,
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

// Authentication middleware with better error handling and token detection
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
    
    // Method 1: Handle explicit Firebase prefix (legacy support) - Check this FIRST
    if (token.startsWith('firebase_')) {
      console.log('🔥 Detected prefixed Firebase token...');
      
      if (!firebaseAvailable) {
        return res.status(503).json({ 
          success: false, 
          message: 'Firebase authentication is not configured' 
        });
      }
      
      try {
        const firebaseToken = token.replace('firebase_', '');
        console.log('🔥 Verifying prefixed Firebase token...');
        const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        authType = 'firebase_prefixed';
        firebaseUid = decodedToken.uid;
        tokenProcessed = true;
        
        user = await User.findOne({ firebaseUID: decodedToken.uid });
        if (!user) {
          console.log('👤 Creating new user from prefixed Firebase token...');
          user = new User({
            firebaseUID: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email?.split('@')[0] || 'Unknown User',
            role: 'user',
            isActive: true,
            permissions: ['read']
          });
          await user.save();
          console.log('✅ New user created in database');
        }
        
        user.lastLogin = new Date();
        await user.save();
        console.log('✅ Prefixed Firebase token verified successfully');
        
      } catch (firebaseError) {
        console.error('❌ Prefixed Firebase token verification failed:', firebaseError.message);
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid Firebase token',
          error: firebaseError.message 
        });
      }
    }
    
    // Method 2: Handle Firebase ID tokens (auto-detected) - Only if not already processed
    else if (!tokenProcessed && firebaseAvailable && isFirebaseToken(token)) {
      try {
        console.log('🔥 Verifying Firebase ID token...');
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('✅ Firebase token verified successfully');
        console.log('   User:', decodedToken.email, 'UID:', decodedToken.uid);
        
        authType = 'firebase';
        firebaseUid = decodedToken.uid;
        tokenProcessed = true;
        
        // Find or create user in MongoDB based on Firebase UID
        user = await User.findOne({ firebaseUID: decodedToken.uid });
        
        if (!user) {
          console.log('👤 Creating new user from Firebase token...');
          user = new User({
            firebaseUID: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email?.split('@')[0] || 'Unknown User',
            role: 'user', // Default role - customize as needed
            isActive: true,
            permissions: ['read'],
            createdAt: new Date(),
            updatedAt: new Date()
          });
          await user.save();
          console.log('✅ New user created in database');
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
        
        // Don't immediately fail - try JWT as fallback
        console.log('🔄 Firebase verification failed, trying JWT...');
        tokenProcessed = false; // Allow JWT processing
      }
    }
    
    // Method 3: Handle JWT tokens - Only if not already processed
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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        authType = 'jwt';
        tokenProcessed = true;
        
        user = await User.findById(decoded.id);
        
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
          error: jwtError.message 
        });
      }
    }
    
    // Final validation
    if (!user) {
      console.error('❌ No user found after token processing');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication failed - no user found' 
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
        userId: firebaseUid || user._id.toString(), // ✅ CORRECT field name
        action: 'AUTH_SUCCESS',
        resource: 'authentication', // ✅ REQUIRED field added
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