// firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC6MCxsIZb51Pberve6gS_l9G0Rh7AQQro",
  authDomain: "hoa-system-28fa2.firebaseapp.com",
  projectId: "hoa-system-28fa2",
  storageBucket: "hoa-system-28fa2.firebasestorage.app",
  messagingSenderId: "194461946838",
  appId: "1:194461946838:web:aa36406681942bf9c94a77"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
