import { initializeApp } from "firebase/app";
import { getAuth,  getIdToken, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCyzjBHJRXUCIUZK5s-XcTypje9adqESyw",
  authDomain: "asset-manager-fb9d3.firebaseapp.com",
  projectId: "asset-manager-fb9d3",
  storageBucket: "asset-manager-fb9d3.firebasestorage.app",
  messagingSenderId: "61212248438",
  appId: "1:61212248438:web:758ee01d1c1bd3c1649257",
  measurementId: "G-N5EMCN8T3R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Store the current token
let currentToken = null;

// Handle authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Get fresh ID token
      currentToken = await getIdToken(user, true);
      console.log("User authenticated, token ready");
      
      // Now you can make API calls to your backend
      testBackendAPI();
    } catch (error) {
      console.error("Error getting ID token:", error);
    }
  } else {
    currentToken = null;
    console.log("No user is signed in.");
  }
});

// Function to register a new user
const registerUser = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("User registered:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Registration error:", error);
    
    // Handle specific Firebase errors
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
};

// Function to get current token
export const getCurrentToken = () => currentToken;

// Function to get current user
export const getCurrentUser = () => auth.currentUser;

// Function to sign in
export const signIn = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("User signed in:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("Sign in error:", error);
    
    // Handle specific Firebase errors
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
};

// Function to sign out
export const signOutUser = async () => {
  try {
    await signOut(auth);
    console.log("User signed out");
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
};

// Test function to call your backend API
const testBackendAPI = async () => {
  if (!currentToken) {
    console.log("No token available");
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Backend response:", data);
  } catch (error) {
    console.error("API call error:", error);
  }
};

// Export the functions and instances
export { auth, db, testBackendAPI, registerUser };