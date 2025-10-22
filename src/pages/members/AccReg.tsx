import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Search, Download, Pencil, Trash, Plus, RotateCcw, UserCircle, Share, LogOut } from "lucide-react";
import { auth, db } from "../../Firebase";
import { collection, getDocs, setDoc, doc, updateDoc, query, orderBy, getDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, sendEmailVerification, onAuthStateChanged, signOut } from "firebase/auth";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from 'react-router-dom';

interface BaseFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

interface FloatingInputProps extends BaseFieldProps {
  type?: string;
  right?: React.ReactNode;
}

const FloatingInput: React.FC<FloatingInputProps> = ({
  id,
  label,
  required,
  value,
  onChange,
  type = "text",
  right,
  className = "",
  onFocus,
  onBlur,
}) => (
  <div className={`relative ${className}`}>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder=" "
      className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none focus:border-emerald-700 transition"
    />
    {right && (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
        {right}
      </span>
    )}
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 transition-all 
               top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
               peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700"
    >
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

interface FloatingSelectProps extends BaseFieldProps {
  options: string[];
}

const FloatingSelect: React.FC<FloatingSelectProps> = ({
  id,
  label,
  required,
  value,
  onChange,
  options,
  className = "",
}) => (
  <div className={`relative ${className}`}>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none 
               focus:border-emerald-700 appearance-none transition bg-white"
    >
      {options.map((opt) => (
        <option key={opt || "empty"} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    <label
      htmlFor={id}
      className="pointer-events-none absolute left-4 px-1 bg-white text-gray-700 top-2 text-xs"
    >
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
  </div>
);

const statusColors: Record<string, string> = {
  Active: "bg-green-500 text-white",
  Inactive: "bg-red-600 text-white",
  New: "bg-yellow-400 text-black",
  Deleted: "bg-gray-400 text-white",
};

interface MemberData {
  id: string;
  accNo: string;
  surname: string;
  firstname: string;
  middlename?: string;
  dob?: string;
  address?: string;
  contact?: string;
  email: string;
  civilStatus?: string;
  role?: string;
  status: "Active" | "Inactive" | "New" | "Deleted";
  [key: string]: any;
}

interface NewMemberForm {
  surname: string;
  firstname: string;
  middlename: string;
  dob: string;
  address: string;
  contact: string;
  email: string;
  civilStatus: string;
  role: string;
  password: string;
  confirm: string;
  status: string;
}

interface UserSession {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

const COLUMN_KEYS = [
  { label: "Acc. No.", key: "accNo" },
  { label: "Surname", key: "surname" },
  { label: "First Name", key: "firstname" },
  { label: "Middle Name", key: "middlename" },
  { label: "Status", key: "status" },
  { label: "Date of Birth", key: "dob" },
  { label: "Email Address", key: "email" },
  { label: "Civil Status", key: "civilStatus" },
  { label: "Role in HOA", key: "role" },
];

const defaultForm: NewMemberForm = {
  surname: "",
  firstname: "",
  middlename: "",
  dob: "",
  address: "",
  contact: "",
  email: "",
  civilStatus: "Single",
  role: "Member",
  password: "",
  confirm: "",
  status: "New",
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isStrongPassword = (password: string): boolean => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  return password.length >= minLength && hasUppercase && hasNumber && hasSpecialChar;
};

const getNextAccNo = async (): Promise<string> => {
  const membersRef = collection(db, "members");
  try {
    const q = query(membersRef, orderBy("accNo", "desc"));
    const snapshot = await getDocs(q);

    let maxAccNo = 0;
    snapshot.docs.forEach((docSnap) => {
      const accNo = docSnap.data().accNo;
      if (accNo) {
        const num = parseInt(accNo, 10);
        if (!isNaN(num) && num > maxAccNo) maxAccNo = num;
      }
    });

    const nextNumber = maxAccNo + 1;
    return String(nextNumber).padStart(4, "0");
  } catch (error) {
    console.error("Error generating next account number:", error);
    return `E${Date.now().toString().slice(-4)}`;
  }
};

// Custom hook for authentication
const useAuth = () => {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const getUserRole = async (userId: string): Promise<string> => {
    try {
      // Check admin collection first
      const adminDoc = await getDoc(doc(db, "admin", userId));
      if (adminDoc.exists()) return "Admin";
      
      // Check elected_officials collection  
      const officerDoc = await getDoc(doc(db, "elected_officials", userId));
      if (officerDoc.exists()) return "Officer";
      
      // Default to member
      return "Member";
    } catch (error) {
      console.error("Error getting user role:", error);
      return "Member";
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const role = await getUserRole(user.uid);
        const sessionData: UserSession = {
          uid: user.uid,
          email: user.email || '',
          role: role,
          isAdmin: role === "Admin"
        };
        setUserSession(sessionData);
        console.log("🔄 User session updated:", sessionData);
      } else {
        setUserSession(null);
        console.log("No user logged in");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { userSession, loading };
};

// Session validation helper
const validateAdminSession = async (): Promise<boolean> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.error("❌ No user logged in");
    return false;
  }
  
  try {
    const adminDoc = await getDoc(doc(db, "admin", currentUser.uid));
    const isAdmin = adminDoc.exists();
    console.log("🔐 Admin session validation:", isAdmin, "User:", currentUser.email);
    return isAdmin;
  } catch (error) {
    console.error("Error validating admin session:", error);
    return false;
  }
};

/* ---------------- Export Modal (Accounts) ---------------- */
const ExportAccountsModal: React.FC<{
  show: boolean;
  onClose: () => void;
  data: MemberData[];
  viewMode: "active" | "deleted";
}> = ({ show, onClose, data, viewMode }) => {
  const initialFileName = `Accounts_${viewMode === "active" ? "Active" : "Deleted"}_${new Date().getFullYear()}`;
  const [fileName, setFileName] = useState(initialFileName);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    COLUMN_KEYS.map((c) => c.key)
  );
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setFileName(initialFileName);
  }, [show]);

  const handleToggleColumn = (key: string) => {
    setSelectedColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleToggleAll = () => {
    if (selectedColumns.length === COLUMN_KEYS.length) setSelectedColumns([]);
    else setSelectedColumns(COLUMN_KEYS.map((c) => c.key));
  };

  const handleExportPDF = () => {
    if (selectedColumns.length === 0) {
      alert("Please select at least one column to export.");
      return;
    }
    if (!fileName.trim()) {
      alert("Please enter a file name.");
      return;
    }
    setIsExporting(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const plugin = require("jspdf-autotable");
      if (plugin && typeof plugin.applyPlugin === "function") {
        plugin.applyPlugin(jsPDF);
      }
    } catch (e) {
      console.warn("Could not apply jspdf-autotable plugin via require:", e);
    }

    if (data.length === 0) {
      alert("No data to export.");
      setIsExporting(false);
      return;
    }

    const columns = COLUMN_KEYS.filter((col) => selectedColumns.includes(col.key));
    const headers = columns.map((c) => c.label);
    headers.unshift("No.");

    const body = data.map((m, idx) => {
      const row: string[] = [];
      row.push(String(idx + 1));
      columns.forEach((col) => {
        let val = (m as any)[col.key] ?? "";
        if (col.key === "dob") {
          if (!val) val = "";
          else {
            try {
              const d = new Date(val);
              if (!isNaN(d.getTime())) {
                val = d.toLocaleDateString();
              } else {
                val = String(val);
              }
            } catch {
              val = String(val);
            }
          }
        } else {
          val = String(val);
        }
        row.push(val);
      });
      return row;
    });

    const doc = new jsPDF("landscape");

    const title = `Account Registry - ${viewMode === "active" ? "Active Accounts" : "Deleted Accounts"}`;
    doc.setFontSize(14);
    doc.text(title, 14, 14);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);

    // @ts-ignore
    (doc as any).autoTable({
      head: [headers],
      body: body,
      startY: 26,
      theme: "striped",
      headStyles: { fillColor: [30, 64, 52] },
      styles: { fontSize: 8 },
      didDrawPage: function (dataPage: any) {
        const pageCount = (doc.internal as any).getNumberOfPages();
        doc.setFontSize(8);
        const pageStr = `Page ${dataPage.pageNumber} of ${pageCount}`;
        doc.text(pageStr, dataPage.settings.margin.left, (doc.internal as any).pageSize.height - 8);
      },
    });

    doc.save(`${fileName}.pdf`);
    setIsExporting(false);
    onClose();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          Close
        </button>

        <h2 className="text-2xl font-semibold mb-4">Export Accounts to PDF</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-emerald-600 focus:border-emerald-600"
              disabled={isExporting}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Columns to include</h3>
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-sm text-blue-600 hover:underline"
                disabled={isExporting}
              >
                {selectedColumns.length === COLUMN_KEYS.length ? "Deselect All" : "Select All"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-2 border rounded">
              {COLUMN_KEYS.map((col) => (
                <label key={col.key} className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.key)}
                    onChange={() => handleToggleColumn(col.key)}
                    disabled={isExporting}
                    className="h-4 w-4 text-emerald-600 rounded border-gray-300"
                  />
                  <span className="truncate">{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md hover:bg-gray-100"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting || selectedColumns.length === 0}
            className="px-4 py-2 rounded-md bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export & Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Main AccReg Component ---------------- */

const AccReg: React.FC = () => {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewMemberForm>(defaultForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPasswordInfo, setShowPasswordInfo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [isEditing, setIsEditing] = useState(false);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { userSession, loading } = useAuth();
  const navigate = useNavigate();
  const membersPerPage = 10;

  const handleAdminClick = () => {
    navigate('/EditModal');
  };

  const handleDashboardClick = () => {
    navigate('/Dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const fetchMembers = async () => {
    try {
      const membersRef = collection(db, "members");
      const snapshot = await getDocs(membersRef);

      const data = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          accNo: d.accNo || "N/A",
          surname: d.surname || "",
          firstname: d.firstname || "",
          middlename: d.middlename || "",
          dob: d.dob || "",
          address: d.address || "",
          contact: d.contact || "",
          email: d.email || "",
          civilStatus: d.civilStatus || "",
          role: d.role || "",
          status: d.status as MemberData["status"] || "New",
        };
      }) as MemberData[];

      setMembers(data.filter((m) => m.status && statusColors[m.status]));
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const resetFormAndState = () => {
    setForm(defaultForm);
    setIsEditing(false);
    setCurrentMemberId(null);
    setErrorMessage(null);
    setShowPasswordInfo(false);
    setIsProcessing(false);
  };

  const handleOpenCreateModal = async () => {
    // Validate admin session before opening modal
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      return;
    }
    
    resetFormAndState();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setTimeout(() => {
      resetFormAndState();
    }, 100);
  };

  const filteredMembers = members
    .filter((member) => {
      const targetStatus = viewMode === "active" ? "Deleted" : "";
      return viewMode === "active" ? member.status !== targetStatus : member.status === "Deleted";
    })
    .filter(
      (member) =>
        member.firstname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.surname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.accNo.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const activeCount = members.filter((m) => m.status !== "Deleted").length;
  const deletedCount = members.filter((m) => m.status === "Deleted").length;

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / membersPerPage));
  const startIndex = (currentPage - 1) * membersPerPage;
  const currentMembers = filteredMembers.slice(startIndex, startIndex + membersPerPage);

  const getRoleOptions = useCallback(() => {
    if (!userSession) return ["Member"];
    return userSession.isAdmin ? ["Member", "Officer", "Admin"] : ["Member"];
  }, [userSession]);

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      alert("Admin session expired. Please log in again.");
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to soft-delete the account for ${memberName}? \n\nThis will mark the account as 'Deleted' and remove it from the main list, but their historical data will be preserved and can be restored.`
      )
    )
      return;

    try {
      const memberRef = doc(db, "members", memberId);
      await updateDoc(memberRef, { status: "Deleted" });
      alert(`${memberName}'s account has been successfully marked as Deleted.`);
      fetchMembers();
    } catch (error) {
      console.error("Error soft-deleting member:", error);
      alert("Failed to soft-delete account. Check console and Firebase Security Rules. (Permissions Issue)");
    }
  };

  const handleRestoreMember = async (memberId: string, memberName: string) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      alert("Admin session expired. Please log in again.");
      return;
    }

    if (!window.confirm(`Are you sure you want to RESTORE the account for ${memberName}?`)) return;

    try {
      const memberRef = doc(db, "members", memberId);
      await updateDoc(memberRef, { status: "Active" });
      alert(`${memberName}'s account has been successfully Restored.`);
      fetchMembers();
      setCurrentPage(1);
      setViewMode("active");
    } catch (error) {
      console.error("Error restoring member:", error);
      alert("Failed to restore account. Check console and Firebase Security Rules. (Permissions Issue)");
    }
  };

  const handleEditClick = async (member: MemberData) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      return;
    }

    setForm({
      surname: member.surname || "",
      firstname: member.firstname || "",
      middlename: member.middlename || "",
      dob: member.dob || "",
      address: member.address || "",
      contact: member.contact || "",
      email: member.email || "",
      civilStatus: member.civilStatus || "Single",
      role: member.role || "Member",
      password: "",
      confirm: "",
      status: member.status,
    } as NewMemberForm);

    setCurrentMemberId(member.id);
    setIsEditing(true);
    setShowModal(true);
    setErrorMessage(null);
    setShowPasswordInfo(false);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsProcessing(true);

    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      setIsProcessing(false);
      return;
    }

    if (!currentMemberId) {
      setErrorMessage("Error: No member selected for update.");
      setIsProcessing(false);
      return;
    }

    const memberData = {
      surname: form.surname,
      firstname: form.firstname,
      middlename: form.middlename,
      dob: form.dob,
      address: form.address,
      contact: form.contact,
      email: form.email,
      civilStatus: form.civilStatus,
      role: form.role,
      status: form.status,
    };

    try {
      const memberRef = doc(db, "members", currentMemberId);
      await updateDoc(memberRef, memberData);

      const accNo = members.find((m) => m.id === currentMemberId)?.accNo;

      // Update role-specific collections
      if (form.role === "Admin") {
        await setDoc(doc(db, "admin", currentMemberId), { ...memberData, accNo }, { merge: true });
        // Remove from other role collections
        await updateDoc(doc(db, "elected_officials", currentMemberId), { role: "Member" });
      } else if (form.role === "Officer") {
        await setDoc(doc(db, "elected_officials", currentMemberId), { ...memberData, accNo }, { merge: true });
        // Remove from admin if demoted
        await updateDoc(doc(db, "admin", currentMemberId), { role: "Member" });
      } else {
        // Remove from role-specific collections if demoted to member
        await updateDoc(doc(db, "admin", currentMemberId), { role: "Member" });
        await updateDoc(doc(db, "elected_officials", currentMemberId), { role: "Member" });
      }

      alert(`Account for ${form.firstname} ${form.surname} updated successfully!`);
      setShowModal(false);
      setIsEditing(false);
      setCurrentMemberId(null);
      setForm(defaultForm);
      fetchMembers();
    } catch (err: any) {
      console.error("Error updating member:", err);
      setErrorMessage(err.message || "Failed to update account. Check console and Security Rules.");
    } finally {
      setIsProcessing(false);
    }
  };

  // 🔥 DELETE THE OLD handleCreateAccount FUNCTION AND REPLACE WITH THIS:

const handleCreateAccount = async (e: React.FormEvent) => {
  e.preventDefault();
  setErrorMessage(null);
  setIsProcessing(true);
  
  const isValidSession = await validateAdminSession();
  if (!isValidSession) {
    setErrorMessage("Admin session expired. Please log in again.");
    setIsProcessing(false);
    return;
  }
  
  if (form.password !== form.confirm) {
    setShowPasswordInfo(true);
    setErrorMessage("Passwords do not match! Please check and try again.");
    setIsProcessing(false);
    return;
  }
  if (!isStrongPassword(form.password)) {
    setShowPasswordInfo(true);
    setErrorMessage(
      "Password is not strong enough. It must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character."
    );
    setIsProcessing(false);
    return;
  }
  if (!isValidEmail(form.email)) {
    setErrorMessage("Please enter a valid and acceptable email address (e.g., user@domain.com).");
    setIsProcessing(false);
    return;
  }

  try {
    const newAccNo = await getNextAccNo();

    const memberData = {
      surname: form.surname,
      firstname: form.firstname,
      middlename: form.middlename,
      dob: form.dob,
      address: form.address,
      contact: form.contact,
      email: form.email,
      civilStatus: form.civilStatus,
      role: form.role,
      status: form.status || "New",
      accNo: newAccNo,
    };

    // 🔥 USE CLOUD FUNCTION - NO MORE SESSION CHANGE!
    const functions = getFunctions();
    const createUserAccount = httpsCallable(functions, 'createUserAccount');
    
    const result = await createUserAccount({
      userData: memberData,
      password: form.password
    });

    console.log("✅ User created via cloud function:", result.data);

    alert(`Account created successfully! Role: ${form.role} Account No: ${newAccNo} 🎉`);
    
    setShowModal(false);
    resetFormAndState();
    fetchMembers();
    
  } catch (err: any) {
    console.error("❌ Cloud function error:", err);
    let errorText = "An unknown error occurred.";
    
    if (err.code === 'permission-denied') {
      errorText = "Error: You don't have permission to create accounts. Admin access required.";
    } else if (err.code === 'unauthenticated') {
      errorText = "Error: Please log in again.";
    } else if (err.code === 'already-exists') {
      errorText = "Error: Email already in use.";
    } else if (err.message) {
      errorText = err.message;
    }
    
    setErrorMessage(errorText);
    setShowPasswordInfo(true);
  } finally {
    setIsProcessing(false);
  }
};

// 🔥 OPTIONAL: Add test function (ilagay sa loob ng AccReg component)
const testCloudFunction = async () => {
  try {
    const functions = getFunctions();
    const testFunction = httpsCallable(functions, 'testHoaFunction');
    const result = await testFunction({});
    console.log("✅ Cloud Function Result:", result.data);
    
    // Safe type access
    const resultData = result.data as { message?: string };
    alert("SUCCESS: " + (resultData.message || "Function working!"));
  } catch (error: unknown) {
    console.error("❌ Cloud Function Error:", error);
    
    // Safe error message access
    let errorMessage = "Unknown error occurred";
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as any).message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    alert("ERROR: " + errorMessage);
  }
};

  return (
    <div className="">
      {/* TOP HEADER - Account Registry Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        
        {/* Account Registry Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">Account Registry</h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <Share size={20} /> 
          </button>

          {/* User Info and Logout */}
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm font-medium">{userSession?.email}</p>
              <p className="text-xs text-gray-300">Role: {userSession?.role}</p>
            </div>
            
            {/* ADMIN BUTTON: Navigation Handler */}
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
              onClick={handleAdminClick} 
            >
              <UserCircle size={32} />
              <span className="text-sm font-medium hidden sm:inline">Admin</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Header and Search */}
      <div className="bg-teader h-20 flex justify-between items-center px-8">
        <h1 className="text-3xl font-bold text-white">
          Account Registry ({viewMode === "active" ? "Active Accounts" : "Deleted Accounts"})
        </h1>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-64 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-emerald-700"
            />
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <style>{`
            .bg-teader { background-color: #042f40; }
            .bg-object { background-color: #054a5c; }
            `}</style>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-600 
                        border border-emerald-700 rounded-full hover:bg-emerald-700"
            title="Export Data"
            disabled={filteredMembers.length === 0}
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-emerald-700 rounded-full hover:bg-emerald-800"
            disabled={isProcessing}
          >
            <Plus size={16} /> Create Acc.
          </button>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200 px-8">
        <button
          onClick={() => {
            setViewMode("active");
            setCurrentPage(1);
          }}
          className={`py-2 px-4 font-medium transition-colors ${
            viewMode === "active" ? "text-emerald-700 border-b-2 border-emerald-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Active Accounts ({activeCount})
        </button>
        <button
          onClick={() => {
            setViewMode("deleted");
            setCurrentPage(1);
          }}
          className={`py-2 px-4 font-medium transition-colors ${
            viewMode === "deleted" ? "text-emerald-700 border-b-2 border-emerald-700" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Deleted Accounts ({deletedCount})
        </button>
      </div>

      {/* Table */}
      <div className="px-8 ">
        <div id="members-table-container" className="overflow-x-auto bg-white rounded-lg shadow-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-[#383737] text-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Acc. No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Surname</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">First Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Middle Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Date of Birth</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Email Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Civil Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Role in HOA</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Password</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentMembers.length > 0 ? (
                currentMembers.map((member, index) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{startIndex + index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{member.accNo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.surname}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.firstname}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.middlename || "N/A"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.dob || "N/A"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.civilStatus || "N/A"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{member.role || "Member"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">********</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[member.status]}`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      {viewMode === "active" ? (
                        <div className="flex items-center justify-center space-x-2">
                          <button 
                            onClick={() => handleEditClick(member)} 
                            className="text-emerald-600 hover:text-emerald-900" 
                            title="Edit Account"
                            disabled={isProcessing}
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteMember(member.id, `${member.firstname} ${member.surname}`)}
                            className="text-red-600 hover:text-red-900"
                            title="Soft Delete Account"
                            disabled={isProcessing}
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRestoreMember(member.id, `${member.firstname} ${member.surname}`)}
                          className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                          title="Restore Account"
                          disabled={isProcessing}
                        >
                          <RotateCcw size={18} /> Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-6 py-4 text-center text-gray-500">
                    {viewMode === "active" ? "No active accounts found." : "No deleted accounts found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 px-8 pb-4">
        <span className="text-sm text-gray-700">
          Showing {filteredMembers.length === 0 ? 0 : Math.min(startIndex + 1, filteredMembers.length)} to{" "}
          {Math.min(startIndex + membersPerPage, filteredMembers.length)} of {filteredMembers.length} entries
        </span>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm font-medium text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || filteredMembers.length === 0}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
              {isEditing ? `Edit Account: ${form.firstname} ${form.surname}` : "Create New Account"}
            </h2>
            <form onSubmit={isEditing ? handleUpdateAccount : handleCreateAccount}>
              {errorMessage && <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">{errorMessage}</p>}
              <div className="grid grid-cols-2 gap-4">
                <FloatingInput 
                  id="surname" 
                  label="Surname" 
                  required 
                  value={form.surname} 
                  onChange={(v) => setForm({ ...form, surname: v })} 
                />
                <FloatingInput 
                  id="firstname" 
                  label="First Name" 
                  required 
                  value={form.firstname} 
                  onChange={(v) => setForm({ ...form, firstname: v })} 
                />
                <FloatingInput 
                  id="middlename" 
                  label="Middle Name" 
                  value={form.middlename} 
                  onChange={(v) => setForm({ ...form, middlename: v })} 
                />
                <FloatingInput 
                  id="dob" 
                  label="Date of Birth (YYYY-MM-DD)" 
                  value={form.dob} 
                  onChange={(v) => setForm({ ...form, dob: v })} 
                />
                <FloatingInput 
                  id="address" 
                  label="House Address" 
                  value={form.address} 
                  onChange={(v) => setForm({ ...form, address: v })} 
                />
                <FloatingInput 
                  id="contact" 
                  label="Contact No." 
                  value={form.contact} 
                  onChange={(v) => setForm({ ...form, contact: v })} 
                />
                
                {isEditing ? (
                  <FloatingInput 
                    id="email" 
                    label="Email Address" 
                    required 
                    value={form.email} 
                    onChange={() => {}} 
                    type="email" 
                    className="pointer-events-none bg-gray-100"
                  />
                ) : (
                  <FloatingInput 
                    id="email" 
                    label="Email Address" 
                    required 
                    value={form.email} 
                    onChange={(v) => setForm({ ...form, email: v })} 
                    type="email" 
                  />
                )}
                
                <FloatingSelect 
                  id="civilStatus" 
                  label="Civil Status" 
                  required 
                  value={form.civilStatus} 
                  onChange={(v) => setForm({ ...form, civilStatus: v })} 
                  options={["Single", "Married", "Divorced", "Widowed"]} 
                />
                
                <FloatingSelect 
                  id="role" 
                  label="Role in HOA" 
                  required 
                  value={form.role} 
                  onChange={(v) => setForm({ ...form, role: v })} 
                  options={getRoleOptions()} 
                />
                
                {isEditing && (
                  <FloatingSelect 
                    id="status" 
                    label="Status" 
                    required 
                    value={form.status} 
                    onChange={(v) => setForm({ ...form, status: v })} 
                    options={["Active", "Inactive", "New"]} 
                  />
                )}
                
                {!isEditing && (
                  <>
                    <FloatingInput 
                      id="password" 
                      label="Password" 
                      required 
                      value={form.password} 
                      onChange={(v) => setForm({ ...form, password: v })} 
                      type="password" 
                      onFocus={() => setShowPasswordInfo(true)} 
                      onBlur={() => setShowPasswordInfo(false)} 
                    />
                    <FloatingInput 
                      id="confirm" 
                      label="Confirm Password" 
                      required 
                      value={form.confirm} 
                      onChange={(v) => setForm({ ...form, confirm: v })} 
                      type="password" 
                    />
                  </>
                )}
              </div>

              {showPasswordInfo && !isEditing && (
                <p className="mt-3 text-xs text-gray-600 p-2 bg-yellow-50 rounded">Password must be 8+ chars, with an uppercase letter, a number, and a special character.</p>
              )}

              <div className="flex justify-end gap-3 mt-8">
                <button 
                  type="button" 
                  className="px-4 py-2 rounded-md text-sm hover:bg-gray-200" 
                  onClick={handleCloseModal}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 rounded-md text-sm bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : (isEditing ? "Update Account" : "Create Account")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Accounts Modal */}
      <ExportAccountsModal show={showExportModal} onClose={() => setShowExportModal(false)} data={filteredMembers} viewMode={viewMode} />
    </div>
  );
};

export default AccReg;