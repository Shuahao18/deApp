import { useState, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import { db } from "../../Firebase"; // Removed storage
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

// --- Interfaces para sa data ---
interface Candidate {
  id: string;
  name: string;
  position: string;
  contactNo: string;
  email: string;
  termDuration: string;
  photoURL?: string;
}

// --- Ang Component mismo ---
export default function OffHoa() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // Fetching data mula sa Firestore
  useEffect(() => {
    if (!db) {
      console.error("Firestore database is not initialized.");
      return;
    }
    const q = query(collection(db, "candidates"), orderBy("name"));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const candidatesList: Candidate[] = [];
        querySnapshot.forEach((doc) => {
          candidatesList.push({ id: doc.id, ...doc.data() } as Candidate);
        });
        setCandidates(candidatesList);
      },
      (error) => {
        console.error("Error fetching candidates:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">HOA Board of members</h1>
      <div className="flex gap-4 mb-6 border-b pb-2">
        {[
          "HOA Boards of members",
          "Sport committee",
          "Waste management",
          "Security Committee",
        ].map((tab) => (
          <button
            key={tab}
            className="px-4 py-2 text-sm font-medium rounded-md hover:bg-gray-100"
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {candidates.map((c) => (
          <div
            key={c.id}
            className="flex items-center bg-white shadow-md rounded-xl overflow-hidden"
          >
            <div className="w-1/3 bg-gray-200 h-40 flex items-center justify-center">
              {c.photoURL ? (
                <img
                  src={c.photoURL}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-600 font-medium">+ Add Image</span>
              )}
            </div>
            <div className="w-2/3 bg-green-800 text-white p-4 relative">
              <button className="absolute top-2 right-2 text-white">
                <MoreVertical />
              </button>
              <p>
                <span className="font-semibold">Name:</span> {c.name}
              </p>
              <p>
                <span className="font-semibold">Position:</span> {c.position}
              </p>
              <p>
                <span className="font-semibold">Contact:</span> {c.contactNo}
              </p>
              <p>
                <span className="font-semibold">Email:</span> {c.email}
              </p>
              <p>
                <span className="font-semibold">Term:</span> {c.termDuration}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}