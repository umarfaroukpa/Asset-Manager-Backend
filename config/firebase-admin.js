import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseInitialized = false;
let adminInstance = null;

export const initializeFirebaseAdmin = async () => {
  if (firebaseInitialized && adminInstance) {
    console.log('✅ Firebase Admin already initialized');
    return adminInstance;
  }

  console.log('🔥 Initializing Firebase Admin...');

  try {
    // Clear any existing Firebase apps
    admin.apps.forEach(app => {
      console.log('🧹 Deleting existing Firebase app:', app.name);
      app.delete();
    });

    let serviceAccount;

    // Method 1: Use environment variables (RECOMMENDED for security)
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      console.log('🔧 Using Firebase config from environment variables');

      // Validate project ID
      if (process.env.FIREBASE_PROJECT_ID !== 'asset-manager-fb9d3') {
        throw new Error(`Wrong project! Expected: asset-manager-fb9d3, Got: ${process.env.FIREBASE_PROJECT_ID}`);
      }

      serviceAccount = {
        type: process.env.FIREBASE_TYPE || 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Handle newlines
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
        universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
      };

      console.log('✅ Service account created from environment variables');
      console.log('   Project ID:', serviceAccount.project_id);
      console.log('   Client Email:', serviceAccount.client_email);
    } 
    // Method 2: Fallback to file (NOT RECOMMENDED for production)
    else {
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
                                path.join(__dirname, '..', 'config', 'firebase-service-account.json');
      
      console.log('⚠️  WARNING: Using file-based service account (not secure for production)');
      console.log('📁 Looking for service account file at:', serviceAccountPath);
      
      try {
        const fs = await import('fs');
        if (fs.existsSync(serviceAccountPath)) {
          const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
          serviceAccount = JSON.parse(fileContent);
          console.log('✅ Service account loaded from file');
        } else {
          throw new Error('Service account file not found');
        }
      } catch (fileError) {
        console.error('❌ File-based service account failed:', fileError.message);
        throw new Error('No Firebase configuration found. Please set environment variables.');
      }
    }

    // Validate required fields
    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields in service account: ${missingFields.join(', ')}`);
    }

    // Initialize Firebase Admin
    adminInstance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    console.log('✅ Firebase Admin initialized successfully');
    console.log('   Project ID:', serviceAccount.project_id);

    // Test the connection
    console.log('🧪 Testing Firebase Admin connection...');
    const testTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection test timeout')), 10000)
    );

    await Promise.race([
      adminInstance.auth().listUsers(1)
        .then((listUsersResult) => {
          console.log('✅ Firebase Auth connection successful');
          console.log(`   Project confirmed: ${serviceAccount.project_id}`);
          console.log(`   Users in project: ${listUsersResult.users.length}`);
          firebaseInitialized = true;
          return adminInstance;
        }),
      testTimeout
    ]);

    return adminInstance;

  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.error('📋 Troubleshooting steps:');
    console.error('   1. Verify all environment variables are set');
    console.error('   2. Check FIREBASE_PRIVATE_KEY format (should include \\n for newlines)');
    console.error('   3. Verify project ID is: asset-manager-fb9d3');
    console.error('   4. Restart the server');
    adminInstance = null;
    firebaseInitialized = false;
    throw error;
  }
};

export const verifyFirebaseToken = async (token) => {
  try {
    if (!adminInstance) {
      console.log('🔄 Firebase Admin not initialized, attempting initialization...');
      adminInstance = await initializeFirebaseAdmin();
      if (!adminInstance) {
        throw new Error('Firebase Admin initialization failed');
      }
    }

    console.log('🔍 Verifying Firebase ID token...');
    console.log('   Token length:', token?.length || 0);
    console.log('   Firebase Admin available:', !!adminInstance);

    if (!token) {
      throw new Error('No token provided');
    }

    const decodedToken = await adminInstance.auth().verifyIdToken(token, true);

    console.log('✅ Token verified successfully:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      aud: decodedToken.aud,
      iss: decodedToken.iss
    });

    if (decodedToken.aud !== 'asset-manager-fb9d3') {
      throw new Error(`Token audience mismatch. Expected: asset-manager-fb9d3, Got: ${decodedToken.aud}`);
    }

    return decodedToken;

  } catch (error) {
    console.error('❌ Token verification failed:', {
      message: error.message,
      code: error.code
    });

    if (error.code === 'auth/id-token-expired') {
      throw new Error('Token has expired');
    } else if (error.code === 'auth/id-token-revoked') {
      throw new Error('Token has been revoked');
    } else if (error.code === 'auth/argument-error') {
      console.error('❌ SIGNATURE VERIFICATION FAILED');
      console.error('   This usually means wrong service account or corrupted credentials');
      throw new Error('Invalid token signature - service account mismatch');
    } else {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
};

export const isFirebaseAdminReady = () => {
  return firebaseInitialized && adminInstance !== null;
};

export { adminInstance as firebaseAdmin };