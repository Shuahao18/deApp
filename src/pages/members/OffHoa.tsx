import { useState, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import { db } from "../../Firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

interface Official {
  id: string;
  name: string;
  position: string;
  contactNo: string;
  email: string;
  termDuration: string;
  photoURL?: string;
}

export default function OffHoa() {
  const [officials, setOfficials] = useState<Official[]>([]);

  useEffect(() => {
    if (!db) {
      console.error("Firestore database is not initialized.");
      return;
    }
    
    // Fetch from the new 'elected_officials' collection
    const q = query(collection(db, "elected_officials"), orderBy("position"));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const officialsList: Official[] = [];
        querySnapshot.forEach((doc) => {
          officialsList.push({ id: doc.id, ...doc.data() } as Official);
        });
        setOfficials(officialsList);
      },
      (error) => {
        console.error("Error fetching elected officials:", error);
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
        {officials.length > 0 ? (
          officials.map((o) => (
            <div
              key={o.id}
              className="flex items-center bg-white shadow-md rounded-xl overflow-hidden"
            >
              <div className="w-1/3 bg-gray-200 h-40 flex items-center justify-center">
                {o.photoURL ? (
                  <img
                    src={o.photoURL}
                    alt={o.name}
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
                  <span className="font-semibold">Name:</span> {o.name}
                </p>
                <p>
                  <span className="font-semibold">Position:</span> {o.position}
                </p>
                <p>
                  <span className="font-semibold">Contact:</span> {o.contactNo}
                </p>
                <p>
                  <span className="font-semibold">Email:</span> {o.email}
                </p>
                <p>
                  <span className="font-semibold">Term:</span> {o.termDuration}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p>No elected officials found. Please run an election first.</p>
        )}
      </div>
    </div>
  );
}