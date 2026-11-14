// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCDMvQApaEbP3GBsNaWZkyWSGStdwiokCI",
  authDomain: "crm-test-f9790.firebaseapp.com",
  projectId: "crm-test-f9790",
  storageBucket: "crm-test-f9790.firebasestorage.app",
  messagingSenderId: "868740687500",
  appId: "1:868740687500:web:9362b9030b92dee54efda9",
  measurementId: "G-H2BMFBZ7YX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);export {
  firebaseConfig,
  resolvedFirebaseConfig,
  DEFAULT_FIREBASE_CONFIG,
  ACTIVE_FIREBASE_PROJECT_ID,
  ACTIVE_FIREBASE_PROJECT_NAME,
  app,
  auth,
  db,
  storage
} from './services/firebase';
