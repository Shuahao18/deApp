import React, { useEffect, useState, useMemo } from "react";
import {
  FiPlus,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiRefreshCw,
  FiEdit,
} from "react-icons/fi";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { X, Check } from "lucide-react";
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

import { db, storage } from "../Firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  Timestamp,
  updateDoc,
  doc,
  orderBy,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- TYPES ---
interface Member {
  id?: string; // ADDED: Document ID
  accNo: string;
  firstName: string;
  middleName?: string;
  surname: string;
  dateOfBirth: Date | string;
  emailAddress: string;
  civilStatus: string;
  roleInHOA: string;
  status: "Active" | "Inactive" | "Deleted";
  statusUpdatedAt?: Date;
}

type ContributionRecord = {
  id: string;
  userId: string; // ADDED: userId field
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

// --- MEMBER STATUS CHECK FUNCTION ---
const checkAndUpdateMemberStatus = async () => {
  try {
    console.log("--- 🚀 STARTING STATUS CHECK (CALENDAR MONTH DUE DATE) 🚀 ---");

    const membersSnap = await getDocs(collection(db, "members"));
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthYearToCheck = formatMonthYear(lastMonth);
    
    const dueEnforcementDate = new Date(today.getFullYear(), today.getMonth(), 30);
    const gracePeriodEnforcementStarts = new Date(dueEnforcementDate);
    gracePeriodEnforcementStarts.setDate(dueEnforcementDate.getDate() + 1);
    
    const isPastDueDate = today.getTime() >= gracePeriodEnforcementStarts.getTime();

    console.log(`Checking dues for: ${monthYearToCheck}`);
    console.log(`Grace Period Enforcement Starts On: ${gracePeriodEnforcementStarts.toDateString()}`);

    if (!isPastDueDate) {
      console.log("GRACE PERIOD IS ACTIVE. NO STATUS CHANGE WILL BE ENFORCED YET.");
      return;
    }

    for (const memberDoc of membersSnap.docs) {
      const member = memberDoc.data() as Member;
      const memberAccNo = member.accNo;
      let newStatus = member.status;

      if (member.status === "Deleted" || !memberAccNo) continue;

      const contributionQuery = query(
        collection(db, "contributions"),
        where("accNo", "==", memberAccNo),
        where("monthYear", "==", monthYearToCheck),
        limit(1)
      );

      const paymentSnap = await getDocs(contributionQuery);
      const paidForLastMonth = !paymentSnap.empty;

      if (!paidForLastMonth) {
        newStatus = "Inactive";
      } else {
        newStatus = "Active";
      }

      if (newStatus !== member.status) {
        await updateDoc(memberDoc.ref, {
          status: newStatus,
          statusUpdatedAt: today,
        });
        console.log(`Status updated for ${member.firstName} (${memberAccNo}): ${member.status} -> ${newStatus}`);
      }
    }

    console.log("--- STATUS CHECK COMPLETE ---");
  } catch (error) {
    console.error("CRITICAL ERROR IN STATUS CHECK:", error);
  }
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
      alert("Please fill in all required payment details.");
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
        // userId remains unchanged when editing
      });

      onSave();
      onClose();
    } catch (error) {
      console.error("Error updating contribution:", error);
      alert("Failed to update payment. Please check console for details.");
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
}: {
  title: string;
  value: string;
  isPrimary: boolean;
  isRed?: boolean;
  isLarge?: boolean;
  isMinimal?: boolean;
}) => {
  const colorClass = isRed
    ? "bg-red-100 text-red-700"
    : isPrimary
      ? "bg-[#125648] text-white"
      : "bg-gray-100 text-gray-800";

  const sizeClass = isLarge ? "p-5 rounded-lg shadow-lg w-1/3" : "p-0";
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
  const [memberId, setMemberId] = useState(""); // ADDED: Store member document ID

  const fetchMemberDetails = async (accNo: string) => {
    if (accNo.length < 3) {
      setFormData((prev) => ({ ...prev, name: "" }));
      setMemberError("");
      setMemberId(""); // Reset memberId
      return;
    }

    setIsSearching(true);
    setMemberError("");
    setMemberId(""); // Reset memberId
    try {
      const membersRef = collection(db, "members");
      const q = query(
        membersRef,
        where("accNo", "==", accNo),
        where("status", "!=", "Deleted")
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setMemberError(`Account No. ${accNo} not found or is inactive/deleted.`);
        setFormData((prev) => ({ ...prev, name: "" }));
      } else {
        const memberDoc = querySnapshot.docs[0];
        const memberData = memberDoc.data();
        const fullName = [
          memberData.surname,
          memberData.firstname,
          memberData.middlename,
        ]
          .filter(Boolean)
          .join(" ");
        setFormData((prev) => ({
          ...prev,
          name: fullName || "N/A",
          amount: memberData.default_dues || 30.0,
        }));
        setMemberId(memberDoc.id); // ADDED: Store the member document ID as userId
        setMemberError("");
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

  if (!show) return null;

  const handleSave = async () => {
    if (memberError || !formData.name || isSearching) {
      alert("Please enter a valid Account No. and ensure the Member Name is found.");
      return;
    }
    if (!formData.amount || !formData.recipient || !formData.transactionDate) {
      alert("Please fill in all required payment details.");
      return;
    }
    if (!memberId) { // ADDED: Check if memberId is available
      alert("Member information is not complete. Please check the account number.");
      return;
    }

    setIsSaving(true);
    let proofURL = "";

    try {
      // Check for existing payment for the current month
      const contributionsRef = collection(db, "contributions");
      const existingPaymentQuery = query(
        contributionsRef,
        where("accNo", "==", formData.accNo),
        where("monthYear", "==", monthYear)
      );
      const existingPaymentSnapshot = await getDocs(existingPaymentQuery);

      if (!existingPaymentSnapshot.empty) {
        alert(`This member has already contributed. ${formData.accNo} has already paid for ${monthYear}. A member can only contribute once per month.`);
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
        userId: memberId, // ADDED: Include userId field
        accNo: formData.accNo,
        name: formData.name,
        amount: parseFloat(formData.amount.toString()),
        paymentMethod: formData.paymentMethod,
        recipient: formData.recipient,
        monthYear: monthYear,
        transactionDate: Timestamp.fromDate(dateToSave),
        proofURL: proofURL,
      });

      onSave();
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
      setMemberId(""); // Reset memberId
    } catch (error) {
      console.error("Error saving contribution:", error);
      alert("Failed to save payment. Please check console for details.");
    } finally {
      setIsSaving(false);
    }
  };

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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 focus:ring-[#125648] focus:border-[#125648]"
              placeholder="Enter member's account number"
              disabled={isSaving}
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 bg-gray-100 focus:outline-none"
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
                disabled={isSaving}
              />
            </div>
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
            disabled={
              isSaving || memberError !== "" || !formData.name || isSearching || !memberId
            }
            className="bg-[#125648] text-white px-4 py-2 rounded-lg hover:bg-[#0d3d33] disabled:bg-gray-400"
          >
            {isSaving ? "Submitting..." : "Submit Payment"}
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
    { key: "userId", label: "User ID" }, // ADDED: User ID column option
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
      alert("Walang nakitang records para i-export.");
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
          case "userId": // ADDED: User ID case
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
  const [currentMonth, setCurrentMonth] = useState(new Date("2025-06-01"));
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
  const [selectedRecord, setSelectedRecord] = useState<ContributionRecord | null>(null);

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate('/EditModal');
  };

  const handleDashboardClick = () => {
    navigate('/Dashboard');
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

      const contributionList: ContributionRecord[] = monthQuerySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || "N/A", // ADDED: Include userId when fetching
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
    } catch (error) {
      console.error("Error fetching contributions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAndUpdateMemberStatus();
    fetchContributionData(currentMonth);
  }, [currentMonth]);

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
    checkAndUpdateMemberStatus();
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
          <h1 className="text-xl font-bold">Contribution</h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <ShareIcon className="h-5 w-5" /> 
          </button>

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
              <thead className="bg-gray-50">
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
                      className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
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
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-gray-500">
                      No records found for this month.
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
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
                            Image no. {record.id.substring(0, 4)}
                          </a>
                        ) : (
                          <span className="text-gray-400">-----</span>
                        )}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        <button
                          onClick={() => handleEditClick(record)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          title="Edit payment"
                        >
                          <FiEdit className="w-3 h-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Payment Modal */}
        <AddPaymentModal
          show={showModal}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            checkAndUpdateMemberStatus();
            fetchContributionData(currentMonth);
          }}
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

        {/* Export to PDF Modal */}
        <ExportModal
          show={showExportModal}
          onClose={() => setShowExportModal(false)}
          records={records}
          monthYear={currentMonthDisplay}
        />
      </main>
    </div>
  );
}