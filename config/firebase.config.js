import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);