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
  deleteDoc,
  Timestamp,
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
  FaArrowLeft,
  FaSearch,
  FaTrash,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { UserCircle, Share } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

// --- HELPER FUNCTIONS ---

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return "Date N/A";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.includes("pdf")) return FaFilePdf;
  if (mimeType.includes("word") || mimeType.includes("document"))
    return FaFileWord;
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
    return FaFileExcel;
  if (mimeType.includes("image")) return FaImage;
  return FaFile;
};

const getCardProps = (
  label: string
): { icon: React.ElementType; color: string; statusKey: ComplaintStatus } => {
  switch (label) {
    case "Total Complaints":
      return { icon: FaRegFile, color: "bg-[#555A6E]", statusKey: "all" };
    case "New Complaints":
      return { icon: FaInbox, color: "bg-[#D76C82]", statusKey: "new" };
    case "Pending Complaints":
      return { icon: FaUserClock, color: "bg-[#FFB700]", statusKey: "pending" };
    case "Complaints Solved":
      return {
        icon: FaCheckCircle,
        color: "bg-[#007F5F]",
        statusKey: "solved",
      };
    case "Rejected Complaints":
      return {
        icon: FaTimesCircle,
        color: "bg-[#C70039]",
        statusKey: "rejected",
      };
    default:
      return { icon: FaRegFile, color: "bg-gray-500", statusKey: "all" };
  }
};

const getStatusBadgeColor = (status: ComplaintStatus) => {
  switch (status) {
    case "new":
      return "bg-[#D76C82]";
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
  const [currentFilter, setCurrentFilter] =
    useState<ComplaintStatus>("pending");
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Complaint Counts
  const [totalCount, setTotalCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  const handleCardClick = (statusKey: ComplaintStatus) => {
    setCurrentFilter(statusKey);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const fetchData = useCallback(async (user: any) => {
    setLoading(true);
    try {
      const adminDocRef = doc(db, "admin", user.uid);
      const adminSnap = await getDoc(adminDocRef);
      const isUserAdmin =
        adminSnap.exists() && adminSnap.data()?.role === "Admin";
      setIsAdmin(isUserAdmin);

      const complaintsCollection = collection(db, "complaints");
      let baseQuery = query(complaintsCollection, orderBy("createdAt", "desc"));

      if (!isUserAdmin) {
        baseQuery = query(
          complaintsCollection,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
      }

      const snapshot = await getDocs(baseQuery);

      const data: Complaint[] = snapshot.docs.map((doc) => {
        const complaintData = doc.data() as FirestoreComplaintData;

        const attachments: Attachment[] = complaintData.attachments
          ? complaintData.attachments
              .filter((att) => !!att.url && !!att.name)
              .map((att) => ({
                url: att.url,
                name: att.name || "File",
                type: att.type || "unknown/file",
              }))
          : [];

        let dateString: string;
        const createdAt = complaintData.createdAt;

        if (createdAt && (createdAt as Timestamp).toDate) {
          dateString = (createdAt as Timestamp).toDate().toISOString();
        } else if (typeof createdAt === "string" && createdAt) {
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

      // UPDATED COUNTS: Exclude rejected complaints from total count
      const nonRejectedComplaints = data.filter((c) => c.status !== "rejected");
      setTotalCount(nonRejectedComplaints.length);
      setNewCount(data.filter((c) => c.status === "new").length);
      setPendingCount(data.filter((c) => c.status === "pending").length);
      setSolvedCount(data.filter((c) => c.status === "solved").length);
      setRejectedCount(data.filter((c) => c.status === "rejected").length);

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
        setIsAdmin(false);
        setComplaints([]);
      }
    });
    return () => unsubscribe();
  }, [fetchData]);

  // Filter complaints based on search and current filter
  const filteredComplaints = useMemo(() => {
    let filtered = complaints;

    // Apply status filter - UPDATED: When showing "all", exclude rejected complaints
    if (currentFilter === "all") {
      filtered = filtered.filter((c) => c.status !== "rejected");
    } else {
      filtered = filtered.filter((c) => c.status === currentFilter);
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.complaint.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [complaints, currentFilter, searchQuery]);

  // Pagination calculations
  const paginatedComplaints = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredComplaints.slice(startIndex, endIndex);
  }, [filteredComplaints, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredComplaints.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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
      setLoading(true);
      const complaintDocRef = doc(db, "complaints", complaintId);
      await updateDoc(complaintDocRef, { status: newStatus });

      setComplaints((prevComplaints) => {
        const updated = prevComplaints.map((c) =>
          c.id === complaintId ? { ...c, status: newStatus } : c
        );

        // UPDATED COUNTS: Exclude rejected complaints from total count
        const nonRejectedComplaints = updated.filter(
          (c) => c.status !== "rejected"
        );
        setTotalCount(nonRejectedComplaints.length);
        setNewCount(updated.filter((c) => c.status === "new").length);
        setPendingCount(updated.filter((c) => c.status === "pending").length);
        setSolvedCount(updated.filter((c) => c.status === "solved").length);
        setRejectedCount(updated.filter((c) => c.status === "rejected").length);

        return updated;
      });
    } catch (error) {
      console.error("Error updating complaint status:", error);
      alert(
        "Failed to update complaint status. Check Firebase Rules or network."
      );
    } finally {
      setLoading(false);
    }
  };

  // DELETE FUNCTION FOR REJECTED COMPLAINTS
  const handleDeleteComplaint = async (complaintId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this rejected complaint? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      const complaintDocRef = doc(db, "complaints", complaintId);
      await deleteDoc(complaintDocRef);

      // Remove from local state
      setComplaints((prevComplaints) => {
        const updated = prevComplaints.filter((c) => c.id !== complaintId);

        // UPDATED COUNTS: Exclude rejected complaints from total count
        const nonRejectedComplaints = updated.filter(
          (c) => c.status !== "rejected"
        );
        setTotalCount(nonRejectedComplaints.length);
        setRejectedCount(updated.filter((c) => c.status === "rejected").length);

        return updated;
      });

      alert("Rejected complaint deleted successfully!");
    } catch (error) {
      console.error("Error deleting complaint:", error);
      alert("Failed to delete complaint. Check Firebase Rules or network.");
    } finally {
      setLoading(false);
    }
  };

  const openImageViewer = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  const closeImageViewer = () => {
    setSelectedImage(null);
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  };

  const counts = [
    totalCount,
    newCount,
    pendingCount,
    solvedCount,
    rejectedCount,
  ];
  const cardLabels = [
    "Total Complaints",
    "New Complaints",
    "Pending Complaints",
    "Complaints Solved",
    "Rejected Complaints",
  ];

  const renderActionButtons = (c: Complaint) => {
    if (!isAdmin) return null;

    if (c.status !== "solved" && c.status !== "rejected") {
      const nextStatus = c.status === "new" ? "pending" : "solved";
      const buttonLabel =
        c.status === "new" ? "Accept (Set Pending)" : "Mark as Solved";
      const buttonIcon = c.status === "new" ? FaUserClock : FaCheckCircle;

      return (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => handleStatusChange(c.id, nextStatus)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-[#009245] hover:bg-[#007F5F] text-sm font-medium transition"
            disabled={loading}
          >
            {React.createElement(buttonIcon)} {buttonLabel}
          </button>

          <button
            onClick={() => handleStatusChange(c.id, "rejected")}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-[#C70039] hover:bg-[#B00028] text-sm font-medium transition"
            disabled={loading}
          >
            <FaTimesCircle /> Reject
          </button>
        </div>
      );
    }

    if (c.status === "solved" || c.status === "rejected") {
      return (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => handleStatusChange(c.id, "pending")}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-gray-700 bg-gray-200 hover:bg-gray-300 text-sm font-medium transition border border-gray-400"
            disabled={loading}
          >
            <FaArrowLeft /> Revert to Pending
          </button>

          {/* DELETE BUTTON - ONLY FOR REJECTED COMPLAINTS */}
          {c.status === "rejected" && (
            <button
              onClick={() => handleDeleteComplaint(c.id)}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-white bg-red-600 hover:bg-red-700 text-sm font-medium transition"
              disabled={loading}
            >
              <FaTrash /> Delete Complaint
            </button>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] font-poppins">
      {/* TOP HEADER */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        {/* Complaints Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">
            Complaints
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          {/* <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <Share size={20} /> 
          </button> */}

          {/* ADMIN BUTTON: Navigation Handler */}
          <div
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick}
          >
            <UserCircle size={32} />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Header with Search */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">
            {getTitleForFilter(currentFilter)}
          </h1>
          <div className="relative">
            <input
              type="text"
              placeholder="Search complaints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-700 bg-white"
            />
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-4">
          {cardLabels.map((label, index) => {
            const { icon: Icon, color, statusKey } = getCardProps(label);
            const isActive = currentFilter === statusKey;

            return (
              <div
                key={index}
                className={`${color} text-white rounded-lg shadow p-4 flex flex-col transition cursor-pointer ${
                  isActive ? "ring-2 ring-white ring-opacity-50" : ""
                }`}
                onClick={() => handleCardClick(statusKey)}
              >
                <div className="flex justify-between items-center">
                  <Icon className="text-2xl" />
                  <span className="text-xl font-bold">{counts[index]}</span>
                </div>
                <p className="text-sm mt-2">{label}</p>
              </div>
            );
          })}
        </div>

        {/* Complaints List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b text-gray-700 font-semibold">
            {getTitleForFilter(currentFilter)} • {filteredComplaints.length}{" "}
            items
            <span className="text-sm text-gray-500 ml-2">
              (Showing {paginatedComplaints.length} of{" "}
              {filteredComplaints.length})
            </span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-500">
              Loading complaints...
            </div>
          ) : paginatedComplaints.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No {currentFilter === "all" ? "" : currentFilter} complaints
              found.
            </div>
          ) : (
            <>
              {paginatedComplaints.map((c) => (
                <div
                  key={c.id}
                  className="p-6 border-b last:border-none hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xl font-semibold text-black">
                      From: {c.name}
                    </p>
                    <span
                      className={`px-3 py-1 text-xs rounded-full ${getStatusBadgeColor(
                        c.status
                      )} text-white font-medium capitalize`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 font-montserrat">
                    Address: {c.address}
                  </p>
                  <p className="text-sm text-gray-600 font-montserrat">
                    Contact: {c.contact}
                  </p>

                  <div className="p-3 bg-gray-200 rounded-md border border-gray-100 mt-10 font-montserrat">
                    <p className="text-xs text-gray-500 ">
                      📅 {formatDate(c.createdAt)}
                    </p>
                    <p className="text-base font-medium text-gray-700 mb-1">
                      Message:
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed font-Montserrat">
                      {c.complaint}
                    </p>
                  </div>

                  {/* Attachments - ORIGINAL STYLING */}
                  <div className="flex gap-2 mt-4">
                    {Array.isArray(c.attachments) &&
                    c.attachments.length > 0 ? (
                      c.attachments.map((att, index) => {
                        const isImage = att.type.includes("image/");
                        const IconComponent = getFileIcon(att.type);
                        const fileExtension =
                          att.name.split(".").pop()?.toUpperCase() || "FILE";

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
                              <span className="text-[9px] text-gray-500 mt-0.5">
                                ({fileExtension})
                              </span>
                            </a>
                          );
                        }
                      })
                    ) : (
                      <div className="w-24 h-24 bg-gray-200 rounded-md flex items-center justify-center text-gray-500 text-xs">
                        <FaImage className="ml-1 w-5 h-10" />
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {renderActionButtons(c)}
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center p-6 border-t">
                  <div className="flex items-center space-x-2">
                    {/* Previous Button */}
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`flex items-center justify-center w-10 h-10 rounded-md border ${
                        currentPage === 1
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                      }`}
                    >
                      <FaChevronLeft size={14} />
                    </button>

                    {/* Page Numbers */}
                    {getPageNumbers().map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`flex items-center justify-center w-10 h-10 rounded-md border ${
                          currentPage === page
                            ? "bg-[#1e4643] text-white border-[#1e4643]"
                            : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    {/* Next Button */}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`flex items-center justify-center w-10 h-10 rounded-md border ${
                        currentPage === totalPages
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                      }`}
                    >
                      <FaChevronRight size={14} />
                    </button>
                  </div>

                  {/* Page Info */}
                  <div className="ml-4 text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Image Viewer Modal - ORIGINAL STYLING */}
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
