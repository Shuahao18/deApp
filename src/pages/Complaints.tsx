import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  orderBy,
  updateDoc,
  Timestamp,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db, auth } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  FaInbox,
  FaUserClock,
  FaCheckCircle,
  FaTimesCircle,
  FaRegFile,
  FaImage,
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFile,
} from "react-icons/fa";

// --- INTERFACES ---

type ComplaintStatus = "all" | "new" | "pending" | "solved" | "rejected";

interface Attachment {
    url: string;
    name: string;
    type: string;
}

interface Complaint {
  id: string;
  name: string;
  address: string;
  contact: string;
  complaint: string;
  status: ComplaintStatus;
  createdAt: string;
  userId: string;
  attachments?: Attachment[];
}

interface FirestoreComplaintData {
  name: string;
  address: string;
  contactNo: string;
  complaint: string;
  status: string;
  createdAt: string | Timestamp;
  userId: string;
  attachments?: {
    url: string;
    name: string;
    size: number;
    type: string;
  }[];
}

// Helper function for Date Formatting
const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return 'Date N/A';
    }
    return date.toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
};

// Helper function to get the correct icon for a file type
const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return FaFilePdf;
    if (mimeType.includes('word') || mimeType.includes('document')) return FaFileWord;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return FaFileExcel;
    if (mimeType.includes('image')) return FaImage;
    return FaFile;
};

// Map card labels to status keys and styling
const getCardProps = (label: string): { icon: React.ElementType, color: string, statusKey: ComplaintStatus } => {
    switch (label) {
        case "Total Complaints":
            return { icon: FaRegFile, color: "bg-[#555A6E]", statusKey: "all" };
        case "New Complaints":
            return { icon: FaInbox, color: "bg-[#009245]", statusKey: "new" };
        case "Pending Complaints":
            return { icon: FaUserClock, color: "bg-[#FFB700]", statusKey: "pending" };
        case "Complaints Solved":
            return { icon: FaCheckCircle, color: "bg-[#007F5F]", statusKey: "solved" };
        case "Rejected Complaints":
            return { icon: FaTimesCircle, color: "bg-[#C70039]", statusKey: "rejected" };
        default:
            return { icon: FaRegFile, color: "bg-gray-500", statusKey: "all" };
    }
};

// Function to get the status badge color
const getStatusBadgeColor = (status: ComplaintStatus) => {
    switch (status) {
        case "new":
            return "bg-[#009245]";
        case "pending":
            return "bg-[#FFB700]";
        case "solved":
            return "bg-[#007F5F]";
        case "rejected":
            return "bg-[#C70039]";
        default:
            return "bg-gray-500";
    }
};


// --- COMPONENT START ---

const Complaints: React.FC = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentFilter, setCurrentFilter] = useState<ComplaintStatus>("pending");

  const [totalCount, setTotalCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  // Function to handle card click and set the filter
  const handleCardClick = (statusKey: ComplaintStatus) => {
      setCurrentFilter(statusKey);
  };

  const fetchData = useCallback(async (user: any) => {
        setLoading(true);
        try {
            const adminDocRef = doc(db, "admin", user.uid);
            const adminSnap = await getDoc(adminDocRef);

            let snapshot: QuerySnapshot<DocumentData>;
            const isUserAdmin =
                adminSnap.exists() && adminSnap.data()?.accountRole === "admin";
            const complaintsCollection = collection(db, "complaints");

            // Define Base Query
            let baseQuery = query(complaintsCollection, orderBy("createdAt", "desc"));
            if (!isUserAdmin) {
                baseQuery = query(
                    complaintsCollection,
                    where("userId", "==", user.uid),
                    orderBy("createdAt", "desc")
                );
            }
            snapshot = await getDocs(baseQuery);

            // Counting logic (Admin or Member) - Reusing existing logic for counts
            const data: Complaint[] = snapshot.docs.map((doc) => {
                const complaintData = doc.data() as FirestoreComplaintData;

                const attachments: Attachment[] = complaintData.attachments
                    ? complaintData.attachments
                        .filter(att => !!att.url && !!att.name)
                        .map(att => ({
                            url: att.url,
                            name: att.name || 'File',
                            type: att.type || 'unknown/file'
                        }))
                    : [];

                let dateString: string;
                const createdAt = complaintData.createdAt;

                if (createdAt && (createdAt as Timestamp).toDate) {
                    dateString = (createdAt as Timestamp).toDate().toISOString();
                } else if (typeof createdAt === 'string' && createdAt) {
                    dateString = createdAt;
                } else {
                    dateString = new Date().toISOString();
                }

                return {
                    id: doc.id,
                    name: complaintData.name || "N/A",
                    address: complaintData.address || "N/A",
                    contact: complaintData.contactNo || "N/A",
                    complaint: complaintData.complaint || "No Details",
                    status: (complaintData.status || "new") as ComplaintStatus,
                    createdAt: dateString,
                    userId: complaintData.userId,
                    attachments: attachments,
                } as Complaint;
            });

            // Recalculate counts based on the fetched data
            const newComplaints = data.filter((c) => c.status === "new");
            const pendingComplaints = data.filter((c) => c.status === "pending");
            const solvedComplaints = data.filter((c) => c.status === "solved");
            const rejectedComplaints = data.filter((c) => c.status === "rejected");


            setTotalCount(data.length);
            setNewCount(newComplaints.length);
            setPendingCount(pendingComplaints.length);
            setSolvedCount(solvedComplaints.length);
            setRejectedCount(rejectedComplaints.length);


            setComplaints(data);
        } catch (err) {
            console.error("Error fetching complaints:", err);
        } finally {
            setLoading(false);
        }
    }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchData(user);
      } else {
          setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [fetchData]);

  // Use useMemo to filter complaints based on the currentFilter state
  const filteredComplaints = useMemo(() => {
        if (currentFilter === "all") {
            return complaints;
        }
        return complaints.filter((c) => c.status === currentFilter);
    }, [complaints, currentFilter]);

  // Get the display title based on the filter
  const getTitleForFilter = (filter: ComplaintStatus) => {
      const cardMap = {
        all: "All Complaints",
        new: "New Complaints",
        pending: "Pending Complaints",
        solved: "Solved Complaints",
        rejected: "Rejected Complaints",
      };
      return cardMap[filter];
  };


  const handleStatusChange = async (
    complaintId: string,
    newStatus: "solved" | "rejected" | "pending"
  ) => {
    try {
      const complaintDocRef = doc(db, "complaints", complaintId);
      await updateDoc(complaintDocRef, { status: newStatus });

      setComplaints((prevComplaints) => {
        const updated = prevComplaints.map((c) =>
          c.id === complaintId ? { ...c, status: newStatus } : c
        );
        // After updating the complaints state, manually update the counts to reflect the change immediately
        setNewCount(updated.filter((c) => c.status === "new").length);
        setPendingCount(updated.filter((c) => c.status === "pending").length);
        setSolvedCount(updated.filter((c) => c.status === "solved").length);
        setRejectedCount(updated.filter((c) => c.status === "rejected").length);
        return updated;
      });

    } catch (error) {
      console.error("Error updating complaint status:", error);
      alert("Failed to update complaint status. Please try again.");
    }
  };

  const openImageViewer = (imageUrl: string) => { setSelectedImage(imageUrl); };
  const closeImageViewer = () => { setSelectedImage(null); };

  const counts = [totalCount, newCount, pendingCount, solvedCount, rejectedCount];
  const cardLabels = [
        "Total Complaints", "New Complaints", "Pending Complaints",
        "Complaints Solved", "Rejected Complaints",
    ];


  return (
    <div className="min-h-screen bg-[#F5F6FA] font-poppins">
      <main>
        <div className="bg-teader px-6 py-4 h-20 shadow">
          <h1 className="text-xl text-white font-semibold">Complaints</h1>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
                {cardLabels.map((label, index) => {
                    // Get statusKey for click handler
                    const { icon: Icon, color, statusKey } = getCardProps(label);
                    const isActive = currentFilter === statusKey; // Highlight active card

                    return (
                        <div
                            key={index}
                            className={`${color} text-white rounded-md shadow p-4 flex flex-col transition cursor-pointer ${isActive ? 'ring-4 ring-white ring-opacity-50' : ''}`}
                            onClick={() => handleCardClick(statusKey)} // Set filter on card click
                        >
                            <div className="flex justify-between items-center">
                                <Icon className="text-2xl" />
                                <span className="text-xl font-bold">{counts[index]}</span>
                            </div>
                            <p className="text-sm mt-2">{label}</p>
                            {/* Removed redundant "View More" button since the card itself is now clickable */}
                        </div>
                    );
                })}
          </div>

          {/* Filtered Complaints List */}
          <div className="bg-white rounded-md shadow">
            <div className="p-4 border-b text-gray-700 font-semibold">
              {getTitleForFilter(currentFilter)}
            </div>

            {loading ? (
              <div className="p-6 text-sm text-gray-500">Loading...</div>
            ) : filteredComplaints.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">
                No {currentFilter === 'all' ? '' : currentFilter} complaints found.
              </div>
            ) : (
              filteredComplaints.map((c) => (
                <div
                  key={c.id}
                  className="p-6 border-b last:border-none hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">
                      From: {c.name}
                    </p>
                    {/* Dynamic Status Badge */}
                    <span className={`px-3 py-1 text-xs rounded-full ${getStatusBadgeColor(c.status)} text-white font-medium capitalize`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Date: {formatDate(c.createdAt)}
                  </p>
                  <p className="text-sm text-gray-600">Address: {c.address}</p>
                  <p className="text-sm text-gray-600">Contact: {c.contact}</p>
                  <p className="mt-3 text-sm text-gray-800 leading-relaxed">
                    {c.complaint}
                  </p>

                  {/* Display logic for all file types */}
                  <div className="flex gap-2 mt-4">
                    {Array.isArray(c.attachments) && c.attachments.length > 0 ? (
                      c.attachments.map((att, index) => {
                        const isImage = att.type.includes('image/');
                        const IconComponent = getFileIcon(att.type);
                        const fileExtension = att.name.split('.').pop()?.toUpperCase() || 'FILE';

                        if (isImage) {
                          return (
                            <img
                              key={index}
                              src={att.url}
                              alt={att.name}
                              className="w-24 h-24 rounded-md object-cover cursor-pointer hover:opacity-80 transition"
                              onClick={() => openImageViewer(att.url)}
                            />
                          );
                        } else {
                          return (
                            <a
                              key={index}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-24 h-24 bg-gray-100 rounded-md flex flex-col items-center justify-center text-gray-700 text-xs p-1 hover:bg-gray-200 transition border border-gray-300"
                              title={att.name}
                            >
                              <IconComponent className="text-xl mb-1 text-gray-500" />
                              <span className="truncate w-full text-center font-medium text-[10px] leading-tight">
                                {att.name.substring(0, 18)}...
                              </span>
                              <span className="text-[9px] text-gray-500 mt-0.5">({fileExtension})</span>
                            </a>
                          );
                        }
                      })
                    ) : (
                      <div className="w-24 h-24 bg-gray-200 rounded-md flex items-center justify-center text-gray-500 text-xs">
                        <FaImage className="mr-1" /> No Attachments
                      </div>
                    )}
                  </div>

                  {/* Show Accept/Reject buttons only if status is NOT Solved/Rejected */}
                    {/* ITO ANG UNANG FIX (Linya 351 based sa lumang file structure) */}
                  {c.status !== "solved" && c.status !== "rejected" && (
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => handleStatusChange(c.id, "solved")}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-[#009245] hover:bg-[#007F5F] text-sm font-medium transition"
                      >
                        <FaCheckCircle /> Accept
                      </button>
                      <button
                        onClick={() => handleStatusChange(c.id, "rejected")}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-[#C70039] hover:bg-[#B00028] text-sm font-medium transition"
                      >
                        <FaTimesCircle /> Reject
                      </button>
                    </div>
                  )}

                    {/* Show "Set to Pending" button only if status is Solved or Rejected */}
                    {/* ITO ANG IKALAWANG FIX (Linya 450 based sa lumang file structure) */}
                    {(c.status === "solved" || c.status === "rejected") && (
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => handleStatusChange(c.id, "pending")}
                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 text-sm font-medium transition border border-gray-400"
                            >
                                <FaUserClock /> Set to Pending
                            </button>
                        </div>
                    )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Image Viewer Modal */}
      {selectedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={closeImageViewer}
          >
            <div className="relative max-w-full max-h-full">
              <button
                onClick={closeImageViewer}
                className="absolute top-4 right-4 text-white text-4xl font-bold p-2 z-50"
                title="Close"
              >
                &times;
              </button>
              <img
                src={selectedImage}
                alt="Full-size Complaint Image"
                className="max-w-full max-h-screen object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
      )}
    </div>
  );
};

export default Complaints;