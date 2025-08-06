import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    // Step 1: Clear any existing Firebase apps
    admin.apps.forEach(app => {
      console.log('🧹 Deleting existing Firebase app:', app.name);
      app.delete();
    });

    let serviceAccount;

    // Method 1: Load from service account file (RECOMMENDED)
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
                              path.join(__dirname, '..', 'config', 'firebase-service-account.json');

    console.log('📁 Looking for service account file at:', serviceAccountPath);

    if (fs.existsSync(serviceAccountPath)) {
      console.log('✅ Service account file found');
      const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
      serviceAccount = JSON.parse(fileContent);

      // Log service account details after loading
      console.log('Service account contents:', {
        project_id: serviceAccount.project_id,
        client_email: serviceAccount.client_email,
        has_private_key: !!serviceAccount.private_key
      });

      // Validate the service account
      if (serviceAccount.project_id !== 'asset-manager-fb9d3') {
        throw new Error(`Wrong project! Expected: asset-manager-fb9d3, Got: ${serviceAccount.project_id}`);
      }

      console.log('   ✅ Project ID verified:', serviceAccount.project_id);
      console.log('   ✅ Client Email:', serviceAccount.client_email);
      console.log('   ✅ Private Key ID:', serviceAccount.private_key_id);

    } else if (process.env.FIREBASE_PROJECT_ID && 
               process.env.FIREBASE_CLIENT_EMAIL && 
               process.env.FIREBASE_PRIVATE_KEY) {
      console.log('🔧 Using Firebase config from environment variables');

      // Validate project ID
      if (process.env.FIREBASE_PROJECT_ID !== 'asset-manager-fb9d3') {
        throw new Error(`Wrong project! Expected: asset-manager-fb9d3, Got: ${process.env.FIREBASE_PROJECT_ID}`);
      }

      serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
      };

      // Log service account details after creation
      console.log('Service account contents:', {
        project_id: serviceAccount.project_id,
        client_email: serviceAccount.client_email,
        has_private_key: !!serviceAccount.private_key
      });

      console.log('✅ Service account created from environment variables');
      console.log('   Project ID:', serviceAccount.project_id);
      console.log('   Client Email:', serviceAccount.client_email);

    } else {
      console.error('❌ No Firebase configuration found!');
      console.error('📋 To fix this:');
      console.error('   1. Download service account from: https://console.firebase.google.com/project/asset-manager-fb9d3/settings/serviceaccounts/adminsdk');
      console.error('   2. Save as: ./config/firebase-service-account.json');
      console.error('   3. Or set environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
      throw new Error('Firebase configuration missing');
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

    // Test the connection immediately
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
    console.error('   1. Verify project ID is: asset-manager-fb9d3');
    console.error('   2. Download fresh service account from Firebase Console');
    console.error('   3. Check file permissions and path');
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
    console.log('   Project ID:', adminInstance?.options?.credential?.projectId);

    if (!token) {
      throw new Error('No token provided');
    }

    const decodedToken = await adminInstance.auth().verifyIdToken(token, true);

    console.log('✅ Token verified successfully:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      aud: decodedToken.aud,
      iss: decodedToken.iss,
      iat: new Date(decodedToken.iat * 1000).toISOString(),
      exp: new Date(decodedToken.exp * 1000).toISOString()
    });

    if (decodedToken.aud !== 'asset-manager-fb9d3') {
      throw new Error(`Token audience mismatch. Expected: asset-manager-fb9d3, Got: ${decodedToken.aud}`);
    }

    return decodedToken;

  } catch (error) {
    console.error('❌ Token verification failed:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      projectId: adminInstance?.options?.credential?.projectId
    });

    if (error.code === 'auth/id-token-expired') {
      throw new Error('Token has expired');
    } else if (error.code === 'auth/id-token-revoked') {
      throw new Error('Token has been revoked');
    } else if (error.code === 'auth/argument-error') {
      console.error('❌ SIGNATURE VERIFICATION FAILED');
      console.error('   This usually means:');
      console.error('   1. Wrong service account for this project');
      console.error('   2. Service account file is corrupted');
      console.error('   3. Token was issued by different Firebase project');
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