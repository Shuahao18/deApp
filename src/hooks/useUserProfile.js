// src/hooks/useUserProfile.js
import { useState, useEffect } from 'react';
// ASSUME: Ang iyong Firestore instance ay na-export na bilang 'db'
import { db } from '../firebase/firebaseConfig'; 
import { doc, onSnapshot } from 'firebase/firestore'; 

const useUserProfile = (userId) => {
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    // Tinitingnan ang document ID na katumbas ng UID sa 'admin' collection
    // (Batay sa structure ng iyong screenshot: hoz-app/Firestore Database/admin/SSEQ2.../admin)
    const userDocRef = doc(db, 'admin', userId); 

    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile(data); // Profile data na galing sa Firestore
      } else {
        setProfile(null);
      }
      setLoadingProfile(false);
    }, (error) => {
        console.error("Error fetching user profile:", error);
        setProfile(null);
        setLoadingProfile(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // Isasama na rin ang isAdmin check dito
  return { profile, loadingProfile, isAdmin: profile?.role === 'Admin' };
};

export default useUserProfile;