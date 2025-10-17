// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
// ASSUME: Ang iyong Firebase Auth instance ay na-export na bilang 'auth'
import { auth } from '../firebase/firebaseConfig'; 

const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase observer para sa login/logout state
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user); // Ito ay naglalaman ng user.uid, user.email, user.photoURL
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup
  }, []);

  return { user, loading };
};

export default useAuth;