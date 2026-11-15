// Srujaan Share Market Institute CRM - Firebase Configuration Bridge
export const firebaseTestConfig = {
  apiKey: "AIzaSyCDMvQApaEbP3GBsNaWZkyWSGStdwiokCI",
  authDomain: "crm-test-f9790.firebaseapp.com",
  projectId: "crm-test-f9790",
  storageBucket: "crm-test-f9790.firebasestorage.app",
  messagingSenderId: "868740687500",
  appId: "1:868740687500:web:9362b9030b92dee54efda9",
  measurementId: "G-H2BMFBZ7YX"
};

export {
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
