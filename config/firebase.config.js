import { initializeApp } from 'firebase/app';
import { getAuth, getIdToken, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import admin from 'firebase-admin';

const firebaseConfig = {
  apiKey: "AIzaSyCyzjBHJRXUCIUZK5s-XcTypje9adqESyw",
  authDomain: "asset-manager-fb9d3.firebaseapp.com",
  projectId: "asset-manager-fb9d3",
  storageBucket: "asset-manager-fb9d3.firebasestorage.app",
  messagingSenderId: "61212248438",
  appId: "1:61212248438:web:758ee01d1c1bd3c1649257",
  measurementId: "G-N5EMCN8T3R",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (process.env.NODE_ENV === 'development') {
  connectFirestoreEmulator(db, 'localhost', 3000);
  console.log('Connected to Firestore emulator');
}

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized successfully');
      await ensureDemoUsers();
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
} else {
  console.warn('Firebase Admin not initialized - missing environment variables');
}

export const backendAuth = {
  signIn: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('User signed in:', userCredential.user.email);
      return userCredential.user;
    } catch (error) {
      console.error('Sign in error:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          throw new Error('No account found with this email');
        case 'auth/wrong-password':
          throw new Error('Incorrect password');
        case 'auth/invalid-email':
          throw new Error('Invalid email address');
        case 'auth/user-disabled':
          throw new Error('This account has been disabled');
        default:
          throw new Error(error.message || 'Sign in failed');
      }
    }
  },
  signOut: async () => {
    try {
      await signOut(auth);
      console.log('User signed out');
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },
  register: async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('User registered:', userCredential.user.email);
      return userCredential.user;
    } catch (error) {
      console.error('Registration error:', error);
      switch (error.code) {
        case 'auth/email-already-in-use':
          throw new Error('This email is already registered');
        case 'auth/weak-password':
          throw new Error('Password should be at least 6 characters');
        case 'auth/invalid-email':
          throw new Error('Invalid email address');
        case 'auth/operation-not-allowed':
          throw new Error('Email/password accounts are not enabled');
        default:
          throw new Error(error.message || 'Registration failed');
      }
    }
  },
  getCurrentToken: async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await getIdToken(user, true);
        console.log('Firebase token retrieved successfully');
        return token;
      }
      console.log('No current user found');
      return null;
    } catch (error) {
      console.error('Error getting Firebase token:', error);
      return null;
    }
  },
  getCurrentUser: () => auth.currentUser,
  verifyIdToken: async (token) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      console.log('Token verified:', decodedToken);
      return decodedToken;
    } catch (error) {
      console.error('Token verification error:', error);
      throw new Error('Invalid token');
    }
  },
  ensureDemoUsers: async () => {
    try {
      const demoUsers = [
        {
          email: 'admin@demo.com',
          password: 'DemoAdmin123!',
          role: 'admin',
          displayName: 'Admin User',
        },
        {
          email: 'staff@demo.com',
          password: 'DemoStaff123!',
          role: 'staff',
          displayName: 'Staff User',
        },
      ];

      for (const demoUser of demoUsers) {
        try {
          const userRecord = await admin.auth().getUserByEmail(demoUser.email);
          console.log(`Demo user ${demoUser.email} already exists`);
        } catch (error) {
          if (error.code === 'auth/user-not-found') {
            const userRecord = await admin.auth().createUser({
              email: demoUser.email,
              password: demoUser.password,
              displayName: demoUser.displayName,
            });
            console.log(`Created demo user: ${demoUser.email}`);

            await db.collection('users').doc(userRecord.uid).set({
              firstName: demoUser.displayName.split(' ')[0],
              lastName: demoUser.displayName.split(' ')[1] || '',
              email: demoUser.email,
              role: demoUser.role,
              organizationId: 'demo-org',
              permissions: demoUser.role === 'admin' ? ['read', 'write', 'admin'] : ['read'],
              isActive: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastLogin: null,
              department: demoUser.role === 'admin' ? 'Admin' : 'Staff',
              phone: '',
              name: demoUser.displayName,
            });
            console.log(`Firestore document created for ${demoUser.email}`);
          } else {
            console.error(`Error checking demo user ${demoUser.email}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring demo users:', error);
    }
  },
};

export const testBackendAPI = async (token) => {
  try {
    const decodedToken = await backendAuth.verifyIdToken(token);
    const user = await admin.auth().getUser(decodedToken.uid);
    return {
      uid: user.uid,
      email: user.email,
    };
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};