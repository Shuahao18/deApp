// firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCgBbhvk9TANfxq81bWcPsnwnfVoKcHRfc",
  authDomain: "hoa-appp.firebaseapp.com",
  projectId: "hoa-appp",
  storageBucket: "hoa-appp.firebasestorage.app",
  messagingSenderId: "55802883937",
  appId: "1:55802883937:web:ce7e8a87acaee625275f20"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
