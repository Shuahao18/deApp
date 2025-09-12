import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";

interface Complaint {
  id: string;
  name: string;
  address: string;
  contact: string;
  complaint: string;
  status: string;
  createdAt: string;
  userId: string;
}

const Complaints: React.FC = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // 🔑 Check if user is admin
          const adminDocRef = doc(db, "admin", user.uid);
          const adminSnap = await getDoc(adminDocRef);

          let snapshot;

          if (adminSnap.exists() && adminSnap.data().accountRole === "admin") {
            // ✅ Admin: get ALL complaints
            snapshot = await getDocs(collection(db, "complaints"));
          } else {
            // ✅ Member: only get their complaints
            const q = query(
              collection(db, "complaints"),
              where("userId", "==", user.uid)
            );
            snapshot = await getDocs(q);
          }

          const data: Complaint[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Complaint[];

          setComplaints(data);
        } catch (err) {
          console.error("Error fetching complaints:", err);
        } finally {
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-6">Loading complaints...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gray-100">
        {/* Top Bar */}
        <div className="bg-[#006C5E] p-6">
          <h1 className="text-2xl text-white font-semibold">Complaints</h1>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
            {["Total Complaints", "New Complaints", "Pending Complaints", "Complaints Solved", "Rejected Complaints"].map((label, index) => {
              const colors = ["bg-sky-500", "bg-green-500", "bg-yellow-400", "bg-gray-500", "bg-red-500"];
              return (
                <div
                  key={index}
                  className={`${colors[index]} text-white p-4 rounded-md shadow flex flex-col justify-between`}
                >
                  <div className="text-lg font-bold">{complaints.length}</div>
                  <div className="text-sm">{label}</div>
                  <button className="text-xs underline mt-2 text-white/90 hover:text-white">
                    View More
                  </button>
                </div>
              );
            })}
          </div>

          {/* Complaint Cards */}
          <div className="bg-white rounded-md shadow divide-y">
            {complaints.length === 0 ? (
              <div className="p-4 text-sm">No complaints found.</div>
            ) : (
              complaints.map((c) => (
                <div key={c.id} className="p-4 space-y-2">
                  <div className="text-sm font-semibold">From: {c.name}</div>
                  <div className="text-sm">
                    Date: {new Date(c.createdAt).toDateString()}
                  </div>
                  <div className="text-sm">Address: {c.address}</div>
                  <div className="text-sm">Contact no#: {c.contact}</div>
                  <div className="text-sm">Complaint: {c.complaint}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="px-3 py-1 text-xs font-medium text-white bg-yellow-500 rounded">
                      {c.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Complaints;
