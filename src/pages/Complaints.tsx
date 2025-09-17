import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  orderBy,
} from "firebase/firestore";
import { db, auth } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";
import { FaInbox, FaUserClock, FaCheckCircle, FaTimesCircle, FaRegFile } from 'react-icons/fa';

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

const getCardProps = (label: string) => {
  switch (label) {
    case 'Total Complaints':
      return { icon: FaRegFile, color: 'bg-[#555A6E]' };
    case 'New Complaints':
      return { icon: FaInbox, color: 'bg-[#009245]' };
    case 'Pending Complaints':
      return { icon: FaUserClock, color: 'bg-[#FFB700]' };
    case 'Complaints Solved':
      return { icon: FaCheckCircle, color: 'bg-[#007F5F]' };
    case 'Rejected Complaints':
      return { icon: FaTimesCircle, color: 'bg-[#C70039]' };
    default:
      return { icon: FaRegFile, color: 'bg-gray-500' };
  }
};

const Complaints: React.FC = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  const [totalCount, setTotalCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminDocRef = doc(db, "admin", user.uid);
          const adminSnap = await getDoc(adminDocRef);

          let snapshot;
          const isUserAdmin = adminSnap.exists() && adminSnap.data()?.accountRole === "admin";
          const complaintsCollection = collection(db, "complaints");

          if (isUserAdmin) {
            const allComplaintsQuery = query(
              complaintsCollection,
              orderBy("createdAt", "desc")
            );
            snapshot = await getDocs(allComplaintsQuery);

            const newQuery = query(complaintsCollection, where("status", "==", "new"));
            const pendingQuery = query(complaintsCollection, where("status", "==", "pending"));
            const solvedQuery = query(complaintsCollection, where("status", "==", "solved"));
            const rejectedQuery = query(complaintsCollection, where("status", "==", "rejected"));

            const [newSnap, pendingSnap, solvedSnap, rejectedSnap] = await Promise.all([
              getDocs(newQuery),
              getDocs(pendingQuery),
              getDocs(solvedQuery),
              getDocs(rejectedQuery),
            ]);

            setTotalCount(snapshot.size);
            setNewCount(newSnap.size);
            setPendingCount(pendingSnap.size);
            setSolvedCount(solvedSnap.size);
            setRejectedCount(rejectedSnap.size);
          } else {
            const memberQuery = query(
              complaintsCollection,
              where("userId", "==", user.uid),
              orderBy("createdAt", "desc")
            );
            snapshot = await getDocs(memberQuery);

            const allMemberComplaints = snapshot.docs.map((doc) => doc.data() as Complaint);
            setTotalCount(allMemberComplaints.length);
            setNewCount(allMemberComplaints.filter((c) => c.status === "new").length);
            setPendingCount(allMemberComplaints.filter((c) => c.status === "pending").length);
            setSolvedCount(allMemberComplaints.filter((c) => c.status === "solved").length);
            setRejectedCount(allMemberComplaints.filter((c) => c.status === "rejected").length);
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

  const counts = [totalCount, newCount, pendingCount, solvedCount, rejectedCount];

  return (
    <div className="min-h-screen bg-white font-poppins">
      <main className="bg-gray-100">
        {/* Top Bar */}
        <div className="bg-[#006C5E] p-6">
          <h1 className="text-2xl text-white font-semibold">Complaints</h1>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
            {["Total Complaints", "New Complaints", "Pending Complaints", "Complaints Solved", "Rejected Complaints"].map((label, index) => {
              const { icon: Icon, color } = getCardProps(label);
              return (
                <div
                  key={index}
                  className={`${color} text-white p-4 rounded-md shadow flex flex-col justify-between`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="text-3xl" />
                    <div className="text-2xl font-bold">{counts[index]}</div>
                  </div>
                  <div className="text-sm mt-2">{label}</div>
                  <button className="text-xs underline mt-2 text-white/90 hover:text-white">
                    View More
                  </button>
                </div>
              );
            })}
          </div>

          {/* Complaint Cards */}
          <div className="bg-white rounded-md shadow divide-y">
            <div className="p-4 bg-gray-50 font-bold text-gray-700">New Complaints</div>
            {complaints.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No complaints found.</div>
            ) : (
              complaints.map((c) => (
                <div key={c.id} className="p-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">From: {c.name}</div>
                    <div className="px-3 py-1 text-xs font-medium text-white rounded-full bg-green-500">
                      {c.status}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Date: {new Date(c.createdAt).toDateString()}
                  </div>
                  <div className="text-sm text-gray-600">Address: {c.address}</div>
                  <div className="text-sm text-gray-600">Contact no#: {c.contact}</div>
                  <div className="text-sm text-gray-800 mt-4 leading-relaxed">
                    Complaint: {c.complaint}
                  </div>
                  <div className="flex flex-col space-y-2 mt-4">
                    <button className="py-2 px-4 rounded-md text-white font-medium bg-[#009245] hover:bg-[#007F5F] transition-colors duration-200">
                      <div className="flex items-center justify-center">
                        <FaCheckCircle className="mr-2" /> Accept
                      </div>
                    </button>
                    <button className="py-2 px-4 rounded-md text-white font-medium bg-[#C70039] hover:bg-[#B00028] transition-colors duration-200">
                      <div className="flex items-center justify-center">
                        <FaTimesCircle className="mr-2" /> Reject
                      </div>
                    </button>
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