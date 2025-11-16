import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  FiPlus,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiRefreshCw,
  FiEdit,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { X, Check } from "lucide-react";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

import { db, storage } from "../Firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  Timestamp,
  updateDoc,
  doc,
  orderBy,
  limit,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

// --- TYPES ---
interface Member {
  id?: string;
  accNo: string;
  firstName: string;
  middleName?: string;
  surname: string;
  dateOfBirth: Date | string;
  emailAddress: string;
  civilStatus: string;
  roleInHOA: string;
  status: "Active" | "Inactive" | "Deleted" | "Pending" | "New";
  statusUpdatedAt?: Date;
  createdAt?: Date;
}

type ContributionRecord = {
  id: string;
  userId: string;
  accNo: string;
  name: string;
  amount: number;
  paymentMethod: string;
  recipient: string;
  transactionDate: Timestamp;
  proofURL: string;
  monthYear: string;
};

type ContributionSummary = {
  totalFunds: number;
  totalMembers: number;
  paidMembers: number;
  unpaidMembers: number;
  contributionAmount: number;
};

// --- NOTIFICATION TYPES ---
interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

// --- NOTIFICATION COMPONENT ---
const NotificationContainer = ({ notifications, removeNotification }: {
  notifications: Notification[];
  removeNotification: (id: string) => void;
}) => (
  <div className="fixed top-4 right-4 z-50 space-y-2">
    {notifications.map((notification) => (
      <div
        key={notification.id}
        className={`p-4 rounded-lg shadow-lg border-l-4 transform transition-all duration-300 ${
          notification.type === 'success'
            ? 'bg-green-50 border-green-500 text-green-700'
            : notification.type === 'error'
            ? 'bg-red-50 border-red-500 text-red-700'
            : 'bg-blue-50 border-blue-500 text-blue-700'
        }`}
      >
        <div className="flex items-center gap-3">
          {notification.type === 'success' && (
            <Check className="h-5 w-5 text-green-500" />
          )}
          {notification.type === 'error' && (
            <X className="h-5 w-5 text-red-500" />
          )}
          {notification.type === 'info' && (
            <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="font-medium">{notification.message}</span>
          <button
            onClick={() => removeNotification(notification.id)}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          >
            ×
          </button>
        </div>
      </div>
    ))}
  </div>
);

// --- HELPER FUNCTIONS ---

const fetchTotalMembers = async (): Promise<number> => {
  try {
    const membersSnapshot = await getDocs(
      query(collection(db, "members"), where("status", "!=", "Deleted"))
    );
    return membersSnapshot.docs.length;
  } catch (error) {
    console.error("Error fetching total members:", error);
    return 0;
  }
};

const formatMonthYear = (date: Date) => {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
};

// Fetch monthly dues from Firebase
const fetchMonthlyDues = async (): Promise<number> => {
  try {
    const duesDoc = await getDoc(doc(db, "settings", "dues"));
    if (duesDoc.exists()) {
      return duesDoc.data().amount || 30.0;
    }
    // Create default if doesn't exist
    await setDoc(doc(db, "settings", "dues"), {
      amount: 30.0,
      lastUpdated: new Date(),
      updatedBy: "system"
    });
    return 30.0;
  } catch (error) {
    console.error("Error fetching monthly dues:", error);
    return 30.0; // Default fallback
  }
};

// ✅ FIXED: AUTO STATUS UPDATE BASED ON CONTRIBUTION
const checkAndUpdateMemberStatus = async () => {
  try {
    console.log("--- 🔄 STARTING AUTO STATUS UPDATE (CONTRIBUTION-BASED) 🔄 ---");

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Get current month we're checking
    const currentMonthToCheck = new Date(currentYear, currentMonth, 1);
    const monthYearToCheck = formatMonthYear(currentMonthToCheck);

    console.log(`📅 Checking payments for: ${monthYearToCheck}`);
    console.log(`📊 Today: ${today.toDateString()}`);

    // ✅ GET ALL MEMBERS AND CURRENT MONTH CONTRIBUTIONS
    const [membersSnap, contributionsSnap] = await Promise.all([
      getDocs(query(collection(db, "members"), where("status", "!=", "Deleted"))),
      getDocs(query(
        collection(db, "contributions"), 
        where("monthYear", "==", monthYearToCheck)
      ))
    ]);

    // ✅ CREATE SET OF MEMBERS WHO PAID FOR CURRENT MONTH
    const paidMembersSet = new Set();
    contributionsSnap.docs.forEach(doc => {
      const accNo = doc.data().accNo;
      if (accNo) {
        paidMembersSet.add(accNo);
        console.log(`💰 Member ${accNo} PAID for ${monthYearToCheck}`);
      }
    });

    console.log(`📈 Total members: ${membersSnap.docs.length}`);
    console.log(`✅ Paid members this month: ${paidMembersSet.size}`);

    const updatePromises = membersSnap.docs.map(async (memberDoc) => {
      const member = memberDoc.data();
      const memberAccNo = member.accNo;
      
      if (!memberAccNo) return null;

      const paidForCurrentMonth = paidMembersSet.has(memberAccNo);
      const currentStatus = member.status;

      console.log(`👤 ${memberAccNo} - ${member.firstName}: current=${currentStatus}, paid=${paidForCurrentMonth}`);

      let newStatus = currentStatus;

      // ✅ CRITICAL: AUTO UPDATE LOGIC
      if (paidForCurrentMonth) {
        // ✅ IF PAID FOR CURRENT MONTH - SET TO ACTIVE
        newStatus = "Active";
        console.log(`🎯 ${memberAccNo}: PAID → ACTIVE`);
      } else {
        // ✅ IF NOT PAID - SET TO INACTIVE (except new members this month)
        const memberCreatedAt = member.createdAt ? 
          (member.createdAt instanceof Timestamp ? 
            member.createdAt.toDate() : 
            new Date(member.createdAt)) : 
          new Date();
        
        const isNewMemberThisMonth = 
          memberCreatedAt.getMonth() === currentMonth && 
          memberCreatedAt.getFullYear() === currentYear;

        if (isNewMemberThisMonth) {
          // 🛡️ NEW MEMBER PROTECTION: Set to "New" if not already set
          if (currentStatus === "Active" || currentStatus === "Inactive") {
            // Keep existing status if already set by admin
            console.log(`🛡️ ${memberAccNo}: NEW MEMBER - keeping current status: ${currentStatus}`);
          } else {
            // Set to "New" for new unconfirmed members
            newStatus = "New";
            console.log(`🛡️ ${memberAccNo}: NEW MEMBER → NEW (awaiting admin confirmation)`);
          }
        } else {
          newStatus = "Inactive";
          console.log(`📉 ${memberAccNo}: NOT PAID → INACTIVE`);
        }
      }

      // Only update if status actually changed
      if (newStatus !== currentStatus) {
        console.log(`🔄 STATUS CHANGE: ${memberAccNo} ${currentStatus} → ${newStatus}`);
        return updateDoc(memberDoc.ref, {
          status: newStatus,
          statusUpdatedAt: today,
        });
      } else {
        console.log(`➡️ ${memberAccNo}: No change needed (${currentStatus})`);
      }

      return null;
    });

    // Execute all updates
    const results = await Promise.all(updatePromises);
    const successfulUpdates = results.filter(result => result !== null).length;
    
    console.log(`--- ✅ AUTO STATUS UPDATE COMPLETE: ${successfulUpdates} members updated ---`);

  } catch (error) {
    console.error("❌ ERROR IN AUTO STATUS UPDATE:", error);
  }
};

// --- EDIT DUES MODAL COMPONENT ---
const EditDuesModal = ({
  show,
  onClose,
  onSave,
  currentAmount,
}: {
  show: boolean;
  onClose: () => void;
  onSave: (newAmount: number) => void;
  currentAmount: number;
}) => {
  const [newAmount, setNewAmount] = useState(currentAmount);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setNewAmount(currentAmount);
    }
  }, [show, currentAmount]);

  if (!show) return null;

  const handleSave = async () => {
    if (newAmount <= 0) {
      return;
    }

    if (newAmount === currentAmount) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(newAmount);
      onClose();
    } catch (error) {
      console.error("Error updating monthly dues:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">
          Edit Monthly Dues
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Update the monthly contribution amount for all members.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Current Monthly Dues
            </label>
            <div className="text-2xl font-bold text-gray-700 bg-gray-100 p-3 rounded-lg">
              P {currentAmount.toFixed(2)}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              New Monthly Dues
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                P
              </span>
              <input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-10 py-3 pl-10 focus:ring-[#125648] focus:border-[#125648] text-lg font-semibold"
                placeholder="Enter new amount"
                disabled={isSaving}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              This will affect all members' default contribution amount.
            </p>
          </div>

          {newAmount !== currentAmount && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-700">
                <strong>Note:</strong> Changing from P {currentAmount.toFixed(2)} to P {newAmount.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || newAmount <= 0}
            className="bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
          >
            {isSaving ? "Updating..." : "Update Dues"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- DELETE CONFIRMATION MODAL COMPONENT ---
const DeleteConfirmationModal = ({
  show,
  onClose,
  onConfirm,
  record,
  isDeleting,
}: {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  record: ContributionRecord | null;
  isDeleting: boolean;
}) => {
  if (!show || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <div className="flex items-center mb-4">
          <div className="bg-red-100 p-3 rounded-full mr-4">
            <X className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              Delete Payment Record
            </h2>
            <p className="text-sm text-gray-600">
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700 font-medium mb-2">
            Are you sure you want to delete this payment record?
          </p>
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              <strong>Account No:</strong> {record.accNo}
            </p>
            <p>
              <strong>Member:</strong> {record.name}
            </p>
            <p>
              <strong>Amount:</strong> P {record.amount.toFixed(2)}
            </p>
            <p>
              <strong>Date:</strong>{" "}
              {record.transactionDate.toDate().toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-400"
          >
            {isDeleting ? (
              <>
                <FiRefreshCw className="animate-spin w-4 h-4" />
                Deleting...
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                Delete Record
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- PAGINATION COMPONENT ---
const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => {
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-b-lg">
      {/* Mobile view */}
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      {/* Desktop view */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{totalPages}</span>
          </p>
        </div>
        <div>
          <nav
            className="isolate inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Pagination"
          >
            {/* First page button */}
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">First</span>
              <FiChevronsLeft className="h-4 w-4" />
            </button>

            {/* Previous page button */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Previous</span>
              <FiChevronLeft className="h-4 w-4" />
            </button>

            {/* Page numbers */}
            {getPageNumbers().map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                  currentPage === page
                    ? "bg-[#125648] text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#125648]"
                    : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                }`}
              >
                {page}
              </button>
            ))}

            {/* Next page button */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <FiChevronRight className="h-4 w-4" />
            </button>

            {/* Last page button */}
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Last</span>
              <FiChevronsRight className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};

// --- EDIT PAYMENT MODAL COMPONENT ---
const EditPaymentModal = ({
  show,
  onClose,
  onSave,
  record,
}: {
  show: boolean;
  onClose: () => void;
  onSave: () => void;
  record: ContributionRecord | null;
}) => {
  const [formData, setFormData] = useState({
    accNo: "",
    name: "",
    amount: 30.0,
    paymentMethod: "Cash Payment",
    recipient: "",
    transactionDate: new Date().toISOString().substring(0, 10),
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setFormData({
        accNo: record.accNo,
        name: record.name,
        amount: record.amount,
        paymentMethod: record.paymentMethod,
        recipient: record.recipient,
        transactionDate: record.transactionDate
          .toDate()
          .toISOString()
          .substring(0, 10),
      });
      setImageFile(null);
    }
  }, [record]);

  if (!show || !record) return null;

  const handleSave = async () => {
    if (!formData.amount || !formData.recipient || !formData.transactionDate) {
      return;
    }

    setIsSaving(true);
    let proofURL = record.proofURL;

    try {
      if (imageFile) {
        const storageRef = ref(
          storage,
          `contributions/${formData.accNo}/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(storageRef, imageFile);
        proofURL = await getDownloadURL(storageRef);
      }

      const dateToSave = new Date(formData.transactionDate);

      await updateDoc(doc(db, "contributions", record.id), {
        accNo: formData.accNo,
        name: formData.name,
        amount: parseFloat(formData.amount.toString()),
        paymentMethod: formData.paymentMethod,
        recipient: formData.recipient,
        transactionDate: Timestamp.fromDate(dateToSave),
        proofURL: proofURL,
      });

      onSave();
      onClose();
    } catch (error) {
      console.error("Error updating contribution:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">
          Edit Payment Details
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Update the payment information below.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Account Number</label>
            <input
              type="text"
              value={formData.accNo}
              readOnly
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-gray-100 focus:outline-none cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Member Name</label>
            <input
              type="text"
              value={formData.name}
              readOnly
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-gray-100 focus:outline-none cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              Name of Recipient
            </label>
            <input
              type="text"
              value={formData.recipient}
              onChange={(e) =>
                setFormData({ ...formData, recipient: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]"
              placeholder="Enter recipient's name"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Payment Method</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) =>
                setFormData({ ...formData, paymentMethod: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-white focus:ring-[#125648] focus:border-[#125648]"
              disabled={isSaving}
            >
              <option value="Cash Payment">Cash Payment</option>
              <option value="GCash">GCash</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">
                Date of Transaction
              </label>
              <input
                type="date"
                value={formData.transactionDate}
                onChange={(e) =>
                  setFormData({ ...formData, transactionDate: e.target.value })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-white focus:ring-[#125648] focus:border-[#125648]"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                Amount of Payment
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]"
                placeholder="Enter the payment value"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium mb-1">
              Proof of Payment (Optional)
            </label>
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition cursor-pointer">
              {imageFile ? (
                <p className="text-sm text-green-600">
                  New file selected: {imageFile.name}
                </p>
              ) : record.proofURL ? (
                <p className="text-sm text-blue-600">
                  Current proof: {record.id.substring(0, 4)}.jpg
                </p>
              ) : (
                <p className="text-gray-500">
                  Upload an image or drag and drop
                </p>
              )}
              <input
                type="file"
                onChange={(e) =>
                  setImageFile(e.target.files ? e.target.files[0] : null)
                }
                className="opacity-0 absolute inset-0 cursor-pointer"
                disabled={isSaving}
              />
            </div>
            {record.proofURL && !imageFile && (
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to keep current proof of payment
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
          >
            {isSaving ? "Updating..." : "Update Payment"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- SEPARATE COMPONENTS (StatBox, AddPaymentModal, ExportModal) ---
const StatBox = ({
  title,
  value,
  isPrimary,
  isRed,
  isLarge,
  isMinimal,
  onEdit,
}: {
  title: string;
  value: string;
  isPrimary: boolean;
  isRed?: boolean;
  isLarge?: boolean;
  isMinimal?: boolean;
  onEdit?: () => void;
}) => {
  const colorClass = isRed
    ? "bg-red-100 text-red-700"
    : isPrimary
      ? "bg-[#125648] text-white"
      : "bg-gray-100 text-gray-800";

  const sizeClass = isLarge ? "p-5 rounded-lg shadow-lg w-1/3 relative" : "p-0";
  const titleSize = isLarge
    ? "text-sm font-medium uppercase opacity-90"
    : "text-sm text-gray-600";
  const valueSize = isLarge
    ? "text-3xl font-bold mt-1"
    : isRed
      ? "text-xl font-bold text-red-700"
      : "text-xl font-bold text-gray-900";
  
  if (isMinimal) {
    return (
      <div className="flex flex-col">
        <div className={`${titleSize}`}>{title}</div>
        <div className={`${valueSize}`}>{value}</div>
      </div>
    );
  }
  
  return (
    <div
      className={`rounded-lg transition duration-150 ${sizeClass} ${colorClass}`}
    >
      {/* Edit button for monthly dues */}
      {onEdit && title === "Monthly Dues" && (
        <button
          onClick={onEdit}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/10 transition-colors"
          title="Edit monthly dues"
        >
          <FiEdit className={`w-4 h-4 ${isPrimary ? 'text-white' : 'text-gray-600'}`} />
        </button>
      )}
      <div className={titleSize}>{title}</div>
      <div
        className={`${valueSize} ${isPrimary ? "text-white" : "text-gray-900"}`}
      >
        {value}
      </div>
    </div>
  );
};

/** Modal for adding a new contribution payment. */
const AddPaymentModal = ({
  show,
  onClose,
  onSave,
  monthYear,
}: {
  show: boolean;
  onClose: () => void;
  onSave: () => void;
  monthYear: string;
}) => {
  const [formData, setFormData] = useState({
    accNo: "",
    name: "",
    amount: 30.0,
    paymentMethod: "Cash Payment",
    recipient: "",
    transactionDate: new Date().toISOString().substring(0, 10),
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberId, setMemberId] = useState("");
  
  // ✅ ADD THIS: Prevent double submission flag
  const isSubmittingRef = useRef(false);

  const fetchMemberDetails = async (accNo: string) => {
    if (accNo.length < 3) {
      setFormData((prev) => ({ ...prev, name: "" }));
      setMemberError("");
      setMemberId("");
      return;
    }

    setIsSearching(true);
    setMemberError("");
    setMemberId("");
    try {
      const membersRef = collection(db, "members");
      const q = query(
        membersRef,
        where("accNo", "==", accNo),
        where("status", "!=", "Deleted")
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setMemberError(`Account No. ${accNo} not found.`);
        setFormData((prev) => ({ ...prev, name: "" }));
      } else {
        const memberDoc = querySnapshot.docs[0];
        const memberData = memberDoc.data();
        
        // ✅ CHECK MEMBER STATUS - ONLY ALLOW ACTIVE/INACTIVE
        const memberStatus = memberData.status;
        
        if (memberStatus === "Active" || memberStatus === "Inactive") {
          // ✅ ALLOW PAYMENT FOR ACTIVE/INACTIVE MEMBERS
          const fullName = [
            memberData.surname,
            memberData.firstName || memberData.firstname,
            memberData.middleName || memberData.middlename,
          ]
            .filter(Boolean)
            .join(" ");
          setFormData((prev) => ({
            ...prev,
            name: fullName || "N/A",
            amount: memberData.default_dues || 30.0,
          }));
          setMemberId(memberDoc.id);
          setMemberError("");
        } else if (memberStatus === "New") {
          // ❌ BLOCK PAYMENT FOR NEW MEMBERS - SHOW SPECIFIC MESSAGE
          setMemberError(`Account No. ${accNo} is a NEW member. Please wait for admin to confirm and activate this account before making payments.`);
          setFormData((prev) => ({ ...prev, name: "NEW MEMBER - AWAITING CONFIRMATION" }));
          setMemberId("");
        } else if (memberStatus === "Pending") {
          // ❌ BLOCK PAYMENT FOR PENDING MEMBERS
          setMemberError(`Account No. ${accNo} is PENDING approval. Please wait for admin confirmation.`);
          setFormData((prev) => ({ ...prev, name: "PENDING - AWAITING CONFIRMATION" }));
          setMemberId("");
        } else {
          // ❌ BLOCK PAYMENT FOR OTHER STATUSES
          setMemberError(`Account No. ${accNo} status is "${memberStatus}". Please wait for admin approval.`);
          setFormData((prev) => ({ ...prev, name: `${memberStatus.toUpperCase()} - AWAITING CONFIRMATION` }));
          setMemberId("");
        }
      }
    } catch (error) {
      console.error("Error searching member:", error);
      setMemberError("An error occurred during lookup.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchMemberDetails(formData.accNo);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [formData.accNo]);

  // ✅ RESET FORM WHEN MODAL CLOSES/OPENS
  useEffect(() => {
    if (show) {
      // Reset form when modal opens
      setFormData({
        accNo: "",
        name: "",
        amount: 30.0,
        paymentMethod: "Cash Payment",
        recipient: "",
        transactionDate: new Date().toISOString().substring(0, 10),
      });
      setImageFile(null);
      setMemberError("");
      setMemberId("");
      setIsSaving(false);
      // ✅ RESET THE SUBMISSION FLAG
      isSubmittingRef.current = false;
    }
  }, [show]);

  if (!show) return null;

  const handleSave = async () => {
    // ✅ CRITICAL FIX: PROPER DOUBLE SUBMISSION PREVENTION
    if (isSubmittingRef.current || isSaving) {
      console.log("🛑 BLOCKED: Submission already in progress");
      return;
    }

    // ✅ SET BOTH STATE AND REF TO PREVENT DOUBLE CLICKS
    isSubmittingRef.current = true;
    setIsSaving(true);

    // Existing validations...
    if (memberError || !formData.name || isSearching) {
      // ✅ RESET FLAGS IF VALIDATION FAILS
      isSubmittingRef.current = false;
      setIsSaving(false);
      return;
    }
    if (!formData.amount || !formData.recipient || !formData.transactionDate) {
      // ✅ RESET FLAGS IF VALIDATION FAILS
      isSubmittingRef.current = false;
      setIsSaving(false);
      return;
    }
    if (!memberId) {
      // ✅ RESET FLAGS IF VALIDATION FAILS
      isSubmittingRef.current = false;
      setIsSaving(false);
      return;
    }

    // ✅ ADDITIONAL STATUS CHECK BEFORE SAVING
    try {
      const memberDocRef = doc(db, "members", memberId);
      const memberDoc = await getDoc(memberDocRef);
      
      if (memberDoc.exists()) {
        const memberData = memberDoc.data();
        const memberStatus = memberData.status;
        
        // ❌ BLOCK IF MEMBER IS NOT ACTIVE/INACTIVE
        if (memberStatus !== "Active" && memberStatus !== "Inactive") {
          setMemberError(`Payment blocked: Member status is "${memberStatus}". Please wait for admin confirmation.`);
          // ✅ RESET FLAGS IF VALIDATION FAILS
          isSubmittingRef.current = false;
          setIsSaving(false);
          return;
        }
      } else {
        setMemberError("Member record not found.");
        // ✅ RESET FLAGS IF VALIDATION FAILS
        isSubmittingRef.current = false;
        setIsSaving(false);
        return;
      }
    } catch (error) {
      console.error("Error verifying member status:", error);
      setMemberError("Error verifying member status. Please try again.");
      // ✅ RESET FLAGS IF VALIDATION FAILS
      isSubmittingRef.current = false;
      setIsSaving(false);
      return;
    }

    let proofURL = "";

    try {
      const contributionsRef = collection(db, "contributions");
      const existingPaymentQuery = query(
        contributionsRef,
        where("accNo", "==", formData.accNo),
        where("monthYear", "==", monthYear)
      );
      const existingPaymentSnapshot = await getDocs(existingPaymentQuery);

      if (!existingPaymentSnapshot.empty) {
        setMemberError(`Member ${formData.accNo} already has a payment for ${monthYear}`);
        // ✅ RESET FLAGS IF DUPLICATE FOUND
        isSubmittingRef.current = false;
        setIsSaving(false);
        return;
      }

      if (imageFile) {
        const storageRef = ref(
          storage,
          `contributions/${formData.accNo}/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(storageRef, imageFile);
        proofURL = await getDownloadURL(storageRef);
      }

      const dateToSave = new Date(formData.transactionDate);
      await addDoc(collection(db, "contributions"), {
        userId: memberId,
        accNo: formData.accNo,
        name: formData.name,
        amount: parseFloat(formData.amount.toString()),
        paymentMethod: formData.paymentMethod,
        recipient: formData.recipient,
        monthYear: monthYear,
        transactionDate: Timestamp.fromDate(dateToSave),
        proofURL: proofURL,
      });

      // ✅ SUCCESS - CALL ONSAVE AND RESET FORM
      onSave();
      
      // ✅ RESET FORM AFTER SUCCESSFUL SUBMISSION
      setFormData({
        accNo: "",
        name: "",
        amount: 30.0,
        paymentMethod: "Cash Payment",
        recipient: "",
        transactionDate: new Date().toISOString().substring(0, 10),
      });
      setImageFile(null);
      setMemberError("");
      setMemberId("");
      
    } catch (error) {
      console.error("Error saving contribution:", error);
      setMemberError("Failed to save payment. Please try again.");
    } finally {
      // ✅ CRITICAL: ALWAYS RESET BOTH STATE AND REF
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  };

  // ✅ DISABLE ALL FORM INPUTS WHILE SAVING
  const isFormDisabled = isSaving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">
          Payment Details Form
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Please fill out the form below to complete the transaction.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Account Number</label>
            <input
              type="text"
              value={formData.accNo}
              onChange={(e) =>
                setFormData({ ...formData, accNo: e.target.value })
              }
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648] ${
                isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="Enter member's account number"
              disabled={isFormDisabled}
            />
            {memberError && (
              <p className="text-xs text-red-600 mt-1">{memberError}</p>
            )}
            {isSearching && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <FiRefreshCw className="animate-spin w-3 h-3" /> Searching for
                member...
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Member Name</label>
            <input
              type="text"
              value={formData.name}
              readOnly
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-gray-100 focus:outline-none cursor-not-allowed"
              placeholder={
                formData.name ||
                (memberError ? "Name not found" : "Awaiting account number...")
              }
              disabled={true}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">
              Name of Recipient
            </label>
            <input
              type="text"
              value={formData.recipient}
              onChange={(e) =>
                setFormData({ ...formData, recipient: e.target.value })
              }
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648] ${
                isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="Enter recipient's name"
              disabled={isFormDisabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Payment Method</label>
            <select
              value={formData.paymentMethod}
              onChange={(e) =>
                setFormData({ ...formData, paymentMethod: e.target.value })
              }
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648] ${
                isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              disabled={isFormDisabled}
            >
              <option value="Cash Payment">Cash Payment</option>
              <option value="GCash">GCash</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">
                Date of Transaction
              </label>
              <input
                type="date"
                value={formData.transactionDate}
                onChange={(e) =>
                  setFormData({ ...formData, transactionDate: e.target.value })
                }
                className={`w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648] ${
                  isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                disabled={isFormDisabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                Amount of Payment
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
                className={`w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648] ${
                  isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
                placeholder="Enter the payment value"
                disabled={isFormDisabled}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium mb-1">
              Proof of Payment (Optional)
            </label>
            <div className={`relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition ${
              isFormDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}>
              {imageFile ? (
                <p className="text-sm text-green-600">
                  File selected: {imageFile.name}
                </p>
              ) : (
                <p className="text-gray-500">
                  Upload an image or drag and drop
                </p>
              )}
              <input
                type="file"
                onChange={(e) =>
                  setImageFile(e.target.files ? e.target.files[0] : null)
                }
                className="opacity-0 absolute inset-0 cursor-pointer"
                disabled={isFormDisabled}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              memberError !== "" ||
              !formData.name ||
              isSearching ||
              !memberId
            }
            className="flex items-center justify-center bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors min-w-[120px]"
            title={
              isSaving ? "Submitting payment..." :
              memberError ? memberError : 
              !formData.name ? "Please enter valid account number" :
              "Submit payment"
            }
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="animate-spin w-4 h-4 mr-2" />
                Submitting...
              </>
            ) : (
              "Submit Payment"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Modal for exporting contribution records to PDF. */
const ExportModal = ({
  show,
  onClose,
  records,
  monthYear,
}: {
  show: boolean;
  onClose: () => void;
  records: ContributionRecord[];
  monthYear: string;
}) => {
  const initialFileName = `Contributions_Report_${monthYear.replace(/\s/g, "_")}`;
  const [fileName, setFileName] = useState(initialFileName);
  const [selectedColumns, setSelectedColumns] = useState([
    "accNo",
    "name",
    "amount",
    "paymentMethod",
    "recipient",
    "transactionDate",
    "proofURL",
  ]);
  const [isExporting, setIsExporting] = useState(false);

  if (!show) return null;

  const ALL_COLUMNS = [
    { key: "accNo", label: "Account No." },
    { key: "name", label: "Member Name" },
    { key: "amount", label: "Amount (P)" },
    { key: "paymentMethod", label: "Payment" },
    { key: "recipient", label: "Recipient" },
    { key: "transactionDate", label: "Date Paid" },
    { key: "proofURL", label: "Proof of Payment" },
    
  ];

  const handleToggleColumn = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExportPDF = () => {
    if (selectedColumns.length === 0 || !fileName.trim()) return;

    setIsExporting(true);

    try {
      const { applyPlugin } = require("jspdf-autotable");
      applyPlugin(jsPDF);
    } catch (e) {
      console.error("Failed to apply jspdf-autotable plugin:", e);
    }

    if (records.length === 0) {
      setIsExporting(false);
      onClose();
      return;
    }
    const columns = ALL_COLUMNS.filter((col) =>
      selectedColumns.includes(col.key)
    );
    const headers = columns.map((col) => col.label);

    const data = records.map((record) => {
      const row: string[] = [];
      columns.forEach((col) => {
        let value: string = "";

        switch (col.key) {
          case "accNo":
            value = record.accNo || "N/A";
            break;
          case "name":
            value = record.name || "N/A";
            break;
          case "amount":
            value =
              record.amount !== undefined && record.amount !== null
                ? `P ${record.amount.toFixed(2)}`
                : "P 0.00";
            break;
          case "paymentMethod":
            value = record.paymentMethod || "Cash Payment";
            break;
          case "recipient":
            value = record.recipient || "N/A";
            break;
          case "transactionDate":
            value = record.transactionDate
              ? record.transactionDate.toDate().toLocaleDateString("en-US")
              : "N/A";
            break;
          case "proofURL":
            value = record.proofURL ? "Available" : "No Proof";
            break;
          case "userId":
            value = record.userId || "N/A";
            break;
          default:
            value = "N/A";
        }
        row.push(value);
      });
      return row;
    });

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Contribution Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${monthYear}`, 14, 22);

    // @ts-ignore
    (doc as any).autoTable({
      startY: 30,
      head: [headers],
      body: data,
      theme: "striped",
      headStyles: { fillColor: [18, 86, 72] },
    });

    doc.save(`${fileName}.pdf`);
    setIsExporting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
          Export Records
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-[#125648] focus:border-[#125648]"
              disabled={isExporting}
            />
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3">
              Select Columns to Include
            </h3>
            <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto p-3 border rounded-lg bg-gray-50">
              {ALL_COLUMNS.map((col) => (
                <div key={col.key} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`col-${col.key}`}
                    checked={selectedColumns.includes(col.key)}
                    onChange={() => handleToggleColumn(col.key)}
                    className="h-4 w-4 text-[#125648] border-gray-300 rounded focus:ring-[#125648]"
                    disabled={isExporting}
                  />
                  <label
                    htmlFor={`col-${col.key}`}
                    className="ml-2 text-sm text-gray-700 cursor-pointer"
                  >
                    {col.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={
              isExporting || selectedColumns.length === 0 || !fileName.trim()
            }
            className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
          >
            {isExporting ? (
              <>
                <FiRefreshCw className="animate-spin w-4 h-4" /> Exporting...
              </>
            ) : (
              <>
                <FiDownload className="w-4 h-4" /> Export to PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN CONTRIBUTION COMPONENT ---
export default function Contribution() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [records, setRecords] = useState<ContributionRecord[]>([]);
  const [summary, setSummary] = useState<ContributionSummary>({
    totalFunds: 0,
    totalMembers: 0,
    paidMembers: 0,
    unpaidMembers: 0,
    contributionAmount: 30,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditDuesModal, setShowEditDuesModal] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<ContributionRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingDues, setIsUpdatingDues] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const navigate = useNavigate();

  // Notification functions
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    const newNotification: Notification = {
      id,
      message,
      type,
      visible: true
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  const handleDashboardClick = () => {
    navigate("/Dashboard");
  };

  const fetchContributionData = async (month: Date) => {
    setIsLoading(true);
    const monthYearString = formatMonthYear(month);
    const currentYear = month.getFullYear();
    console.log(`[DATA FETCH] Fetching contributions for: ${monthYearString}`);

    const startOfYear = Timestamp.fromDate(new Date(currentYear, 0, 1));
    const endOfYear = Timestamp.fromDate(new Date(currentYear + 1, 0, 1));

    try {
      const totalMembers = await fetchTotalMembers();

      const yearQuery = query(
        collection(db, "contributions"),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );
      const yearSnapshot = await getDocs(yearQuery);
      const totalFundsOfYear = yearSnapshot.docs.reduce(
        (sum, doc) => sum + doc.data().amount,
        0
      );

      const monthQuery = query(
        collection(db, "contributions"),
        where("monthYear", "==", monthYearString)
      );
      const monthQuerySnapshot = await getDocs(monthQuery);

      const contributionList: ContributionRecord[] =
        monthQuerySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            userId: data.userId || "N/A",
            accNo: data.accNo,
            name: data.name,
            amount: data.amount,
            paymentMethod: data.paymentMethod,
            recipient: data.recipient,
            transactionDate: data.transactionDate as Timestamp,
            proofURL: data.proofURL,
            monthYear: data.monthYear,
          };
        });

      const paidMembers = new Set(contributionList.map((r) => r.accNo)).size;
      const unpaidMembers = Math.max(0, totalMembers - paidMembers);
      setRecords(contributionList);
      setSummary((prev) => ({
        ...prev,
        totalFunds: totalFundsOfYear,
        paidMembers,
        unpaidMembers,
        totalMembers,
      }));

      // Reset to first page when data changes
      setCurrentPage(1);
    } catch (error) {
      console.error("Error fetching contributions:", error);
      showNotification("Error fetching contribution data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Add this function to handle dues update
  const handleUpdateDues = async (newAmount: number) => {
    if (newAmount <= 0) {
      showNotification("Monthly dues must be greater than 0.", "error");
      return;
    }

    setIsUpdatingDues(true);
    try {
      // Update Firebase
      await setDoc(doc(db, "settings", "dues"), {
        amount: newAmount,
        lastUpdated: new Date(),
        updatedBy: "admin"
      }, { merge: true });

      // Update local state
      setSummary(prev => ({
        ...prev,
        contributionAmount: newAmount
      }));

      showNotification("Monthly dues updated successfully!", "success");
    } catch (error) {
      console.error("Error updating monthly dues:", error);
      showNotification("Failed to update monthly dues. Please try again.", "error");
      throw error;
    } finally {
      setIsUpdatingDues(false);
    }
  };

  // ✅ CRITICAL: AUTO STATUS UPDATE ON EVERY COMPONENT LOAD
  useEffect(() => {
    console.log("🔄 Contribution component mounted - running auto status update");
    checkAndUpdateMemberStatus();
    fetchContributionData(currentMonth);
    
    // Fetch monthly dues
    fetchMonthlyDues().then(amount => {
      setSummary(prev => ({ ...prev, contributionAmount: amount }));
    });
  }, [currentMonth]);

  // ✅ AUTO STATUS UPDATE WHEN PAYMENTS ARE ADDED/EDITED/DELETED
  const handleMonthChange = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev.getTime());
      newMonth.setMonth(prev.getMonth() + (direction === "next" ? 1 : -1));
      return newMonth;
    });
  };

  const handleEditClick = (record: ContributionRecord) => {
    setSelectedRecord(record);
    setShowEditModal(true);
  };

  const handleEditSave = () => {
    fetchContributionData(currentMonth);
    // ✅ AUTO UPDATE STATUS AFTER EDIT
    checkAndUpdateMemberStatus();
    showNotification("Payment updated successfully!", "success");
  };

  const handleDeleteClick = (record: ContributionRecord) => {
    setSelectedRecord(record);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRecord) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "contributions", selectedRecord.id));

      if (selectedRecord.proofURL) {
        try {
          const storageRef = ref(storage, selectedRecord.proofURL);
          await deleteObject(storageRef);
          console.log("Proof image deleted successfully");
        } catch (storageError) {
          console.warn("Could not delete proof image:", storageError);
        }
      }

      await fetchContributionData(currentMonth);
      // ✅ AUTO UPDATE STATUS AFTER DELETE
      checkAndUpdateMemberStatus();

      setShowDeleteModal(false);
      setSelectedRecord(null);

      showNotification("Payment record deleted successfully!", "success");
    } catch (error) {
      console.error("Error deleting payment record:", error);
      showNotification("Failed to delete payment record. Please check console for details.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ AUTO STATUS UPDATE AFTER ADDING PAYMENT
  const handleAddPaymentSave = () => {
    setShowModal(false);
    // ✅ CRITICAL: AUTO UPDATE STATUS AFTER ADDING PAYMENT
    checkAndUpdateMemberStatus();
    fetchContributionData(currentMonth);
    showNotification("Payment added successfully!", "success");
  };

  // Pagination calculations
  const currentRecords = useMemo(() => {
    const indexOfLastRecord = currentPage * itemsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - itemsPerPage;
    return records.slice(indexOfFirstRecord, indexOfLastRecord);
  }, [currentPage, records, itemsPerPage]);

  const totalPages = Math.ceil(records.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const currentMonthDisplay = useMemo(
    () => formatMonthYear(currentMonth),
    [currentMonth]
  );

  const totalFundsDisplay = records
    .reduce((sum, r) => sum + r.amount, 0)
    .toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* TOP HEADER - Contribution Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        {/* Contribution Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">
            Contribution
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          {/* ADMIN BUTTON: Navigation Handler */}
          <div
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick}
          >
            <UserCircleIcon className="h-8 w-8 text-white" />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-8">
        <div className="bg-white shadow-xl rounded-lg p-6">
          {/* Summary Boxes */}
          <div className="flex space-x-4 mb-6 border-b pb-6">
            <StatBox
              title={`Total Funds ${currentMonth.getFullYear()}`}
              value={`P ${summary.totalFunds.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              isPrimary={true}
              isLarge={true}
            />
            <StatBox
              title="Monthly Dues"
              value={`P ${summary.contributionAmount.toFixed(2)}`}
              isPrimary={false}
              isLarge={true}
              onEdit={() => setShowEditDuesModal(true)}
            />
          </div>

          <div className="flex items-center space-x-12 mb-6">
            <StatBox
              title="Contribution this month"
              value={`P ${totalFundsDisplay}`}
              isPrimary={false}
              isMinimal={true}
            />
            <StatBox
              title="Total members"
              value={summary.totalMembers.toString()}
              isPrimary={false}
              isMinimal={true}
            />
            <StatBox
              title="Paid Members"
              value={summary.paidMembers.toString()}
              isPrimary={false}
              isMinimal={true}
            />
            <StatBox
              title="Unpaid Members"
              value={summary.unpaidMembers.toString()}
              isPrimary={false}
              isRed={true}
              isMinimal={true}
            />
          </div>

          {/* Controls and Export */}
          <div className="flex justify-between items-center pb-4 mb-4">
            <div className="flex items-center space-x-2 border rounded-lg overflow-hidden shadow-sm">
              <button
                onClick={() => handleMonthChange("prev")}
                className="p-3 bg-gray-50 hover:bg-gray-100 border-r"
                aria-label="Previous Month"
              >
                <FiChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="text-lg font-semibold w-40 text-center text-gray-800">
                {currentMonthDisplay}
              </div>
              <button
                onClick={() => handleMonthChange("next")}
                className="p-3 bg-gray-50 hover:bg-gray-100 border-l"
                aria-label="Next Month"
              >
                <FiChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 shadow-sm"
              >
                <FiDownload className="w-4 h-4" /> Export
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-[#125648] text-white px-4 py-2 text-sm font-medium rounded-lg shadow-md hover:bg-[#0d3d33]"
              >
                <FiPlus /> Add Payment
              </button>
            </div>
          </div>

          {/* Contribution Table */}
          <div className="overflow-x-auto border rounded-lg shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#125648] text-white">
                <tr>
                  {[
                    "Acc. No.",
                    "Name",
                    "P Amount",
                    "Payment Method",
                    "Recipient",
                    "Transaction Date",
                    "Proof of Payment",
                    "Actions",
                  ].map((header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-gray-500">
                      <FiRefreshCw className="animate-spin inline-block mr-2 w-4 h-4 text-[#125648]" />
                      Loading records...
                    </td>
                  </tr>
                ) : currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-gray-500">
                      No records found for this month.
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-gray-900">
                        {record.accNo}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        {record.name}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700 font-medium">{`P ${record.amount.toFixed(2)}`}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        {record.paymentMethod}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        {record.recipient}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        {record.transactionDate
                          .toDate()
                          .toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm">
                        {record.proofURL ? (
                          <a
                            href={record.proofURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            View Proof
                          </a>
                        ) : (
                          <span className="text-gray-400">-----</span>
                        )}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditClick(record)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            title="Edit payment"
                          >
                            <FiEdit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(record)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                            title="Delete payment"
                          >
                            <X className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Component */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>

        {/* Add Payment Modal */}
        <AddPaymentModal
          show={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleAddPaymentSave}
          monthYear={currentMonthDisplay}
        />

        {/* Edit Payment Modal */}
        <EditPaymentModal
          show={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedRecord(null);
          }}
          onSave={handleEditSave}
          record={selectedRecord}
        />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          show={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedRecord(null);
          }}
          onConfirm={handleDeleteConfirm}
          record={selectedRecord}
          isDeleting={isDeleting}
        />

        {/* Export to PDF Modal */}
        <ExportModal
          show={showExportModal}
          onClose={() => setShowExportModal(false)}
          records={records}
          monthYear={currentMonthDisplay}
        />

        {/* Edit Dues Modal */}
        <EditDuesModal
          show={showEditDuesModal}
          onClose={() => setShowEditDuesModal(false)}
          onSave={handleUpdateDues}
          currentAmount={summary.contributionAmount}
        />
      </main>

      {/* Notification Container */}
      <NotificationContainer 
        notifications={notifications} 
        removeNotification={removeNotification} 
      />
    </div>
  );
}