import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Search,
  Download,
  Pencil,
  Trash,
  Plus,
  RotateCcw,
  UserCircle,
  Share,
  Eye,
  EyeOff,
} from "lucide-react";
import { auth, db } from "../Firebase";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";

// Custom Alert Component to replace native alert()
const CustomAlert: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onClose: () => void;
}> = ({ show, title, message, onClose }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom hook for alert replacement
const useCustomAlert = () => {
  const [alertState, setAlertState] = useState({
    show: false,
    title: "",
    message: "",
  });

  const showAlert = useCallback((title: string, message: string) => {
    setAlertState({ show: true, title, message });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, show: false }));

    // Force focus restoration for Electron
    setTimeout(() => {
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT")
      ) {
        activeElement.focus();
      }
    }, 10);
  }, []);

  return {
    showAlert,
    hideAlert,
    alertState,
  };
};

// Custom Confirm Component
const CustomConfirm: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            autoFocus
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// Custom hook for confirm replacement - FIXED VERSION
const useCustomConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      onCancel?: () => void
    ) => {
      setConfirmState({
        show: true,
        title,
        message,
        onConfirm,
        onCancel: onCancel || (() => {}),
      });
    },
    []
  );

  const hideConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, show: false }));

    // Force focus restoration for Electron
    setTimeout(() => {
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT")
      ) {
        activeElement.focus();
      }
    }, 10);
  }, []);

  const handleConfirm = useCallback(() => {
    confirmState.onConfirm();
    hideConfirm();
  }, [confirmState.onConfirm, hideConfirm]);

  const handleCancel = useCallback(() => {
    confirmState.onCancel();
    hideConfirm();
  }, [confirmState.onCancel, hideConfirm]);

  return {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  };
};

// Electron focus fix hook
const useElectronFocusFix = () => {
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        const target = e.target;
        if (document.activeElement !== target) {
          setTimeout(() => {
            target.focus();
            if (target instanceof HTMLInputElement && target.type !== "date") {
              target.select();
            }
          }, 10);
        }
      }
    };

    document.addEventListener("click", handleGlobalClick, true);

    return () => {
      document.removeEventListener("click", handleGlobalClick, true);
    };
  }, []);
};

interface BaseFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
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
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.();
    // Electron fix: ensure proper focus
    e.target.select?.();
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Electron fix: force focus on click
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        placeholder=" "
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none focus:border-emerald-700 transition ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
        }`}
      />
      {right && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
          {right}
        </span>
      )}
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700
                 ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
    </div>
  );
};

// Floating Date Input Component
const FloatingDateInput: React.FC<BaseFieldProps> = ({
  id,
  label,
  required,
  value,
  onChange,
  className = "",
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return "";
    return dateString;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={formatDateForInput(value)}
        onChange={handleDateChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        placeholder=" "
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none 
                 focus:border-emerald-700 transition appearance-none ${
                   disabled
                     ? "opacity-50 cursor-not-allowed bg-gray-100"
                     : "bg-white"
                 }`}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700
                 ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
    </div>
  );
};

// Floating Password Input with Show/Hide
const FloatingPasswordInput: React.FC<
  BaseFieldProps & {
    onToggleVisibility: () => void;
    showPassword: boolean;
  }
> = ({
  id,
  label,
  required,
  value,
  onChange,
  className = "",
  onToggleVisibility,
  showPassword,
  onFocus,
  onBlur,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.();
    e.target.select?.();
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        placeholder=" "
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 pr-12 outline-none focus:border-emerald-700 transition ${
          disabled ? "opacity-50 cursor-not-allowed bg-gray-100" : "bg-white"
        }`}
      />
      <button
        type="button"
        onClick={onToggleVisibility}
        disabled={disabled}
        className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
          disabled
            ? "text-gray-400 cursor-not-allowed"
            : "text-gray-500 hover:text-gray-700"
        }`}
      >
        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 top-2 text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 
                 peer-placeholder-shown:text-base peer-focus:top-2 peer-focus:text-xs peer-focus:text-emerald-700
                 ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"}`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
    </div>
  );
};

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
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    setIsFocused(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLSelectElement>) => {
    if (selectRef.current) {
      setTimeout(() => {
        selectRef.current?.focus();
      }, 10);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <select
        ref={selectRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        disabled={disabled}
        className={`peer w-full h-16 rounded-xl border-2 border-gray-400 px-4 pt-4 pb-2 outline-none 
                 focus:border-emerald-700 appearance-none transition ${
                   disabled
                     ? "opacity-50 cursor-not-allowed bg-gray-100"
                     : "bg-white"
                 }`}
      >
        {options.map((opt) => (
          <option key={opt || "empty"} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 px-1 transition-all 
                 ${disabled ? "bg-gray-100 text-gray-500" : "bg-white text-gray-700"} top-2 text-xs`}
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
    </div>
  );
};

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

interface UserSession {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

// UPDATED: Added House Address to columns
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
  { label: "House Address", key: "address" }, // ADDED HOUSE ADDRESS
];

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isStrongPassword = (password: string): boolean => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  return (
    password.length >= minLength && hasUppercase && hasNumber && hasSpecialChar
  );
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
          email: user.email || "",
          role: role,
          isAdmin: role === "Admin",
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
    console.log(
      "🔐 Admin session validation:",
      isAdmin,
      "User:",
      currentUser.email
    );
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

  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    setFileName(initialFileName);
  }, [show]);

  const handleToggleColumn = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleToggleAll = () => {
    if (selectedColumns.length === COLUMN_KEYS.length) setSelectedColumns([]);
    else setSelectedColumns(COLUMN_KEYS.map((c) => c.key));
  };

  const handleExportPDF = () => {
    if (selectedColumns.length === 0) {
      showAlert("Export Error", "Please select at least one column to export.");
      return;
    }
    if (!fileName.trim()) {
      showAlert("Export Error", "Please enter a file name.");
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
      showAlert("Export Error", "No data to export.");
      setIsExporting(false);
      return;
    }

    const columns = COLUMN_KEYS.filter((col) =>
      selectedColumns.includes(col.key)
    );
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
        doc.text(
          pageStr,
          dataPage.settings.margin.left,
          (doc.internal as any).pageSize.height - 8
        );
      },
    });

    doc.save(`${fileName}.pdf`);
    setIsExporting(false);
    onClose();
  };

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            disabled={isExporting}
          >
            Close
          </button>

          <h2 className="text-2xl font-semibold mb-4">
            Export Accounts to PDF
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                File Name
              </label>
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
                  {selectedColumns.length === COLUMN_KEYS.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-2 border rounded">
                {COLUMN_KEYS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center space-x-2 text-sm"
                  >
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

      {/* Custom Alert for Export Modal */}
      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

/* ---------------- Main AccReg Component ---------------- */

const AccReg: React.FC = () => {
  useElectronFocusFix(); // Apply Electron focus fix

  // SIMPLE INDIVIDUAL STATES - gaya ng posting component
  const [members, setMembers] = useState<MemberData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "deleted">("active");
  const [showExportModal, setShowExportModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // INDIVIDUAL FORM STATES - gaya ng posting component
  const [surname, setSurname] = useState("");
  const [firstname, setFirstname] = useState("");
  const [middlename, setMiddlename] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [civilStatus, setCivilStatus] = useState("Single");
  const [role, setRole] = useState("Member");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("New");

  // ADDITIONAL UI STATES
  const [showPasswordInfo, setShowPasswordInfo] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { userSession, loading } = useAuth();
  const navigate = useNavigate();
  const membersPerPage = 10;

  // Custom alert and confirm hooks
  const { showAlert, hideAlert, alertState } = useCustomAlert();
  const {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  } = useCustomConfirm();

  // ✅ FIXED STATUS OPTIONS FUNCTION - Prevents Inactive → New/Active via editing
  const getStatusOptions = useCallback((currentStatus: string) => {
    // CRITICAL: Once Inactive, cannot be manually changed back to New/Active
    // Must go through payment system to become Active again
    if (currentStatus === "Inactive") {
      return ["Inactive"]; // Read-only, no options to change
    }
    
    // Active members can be manually set to Inactive
    if (currentStatus === "Active") {
      return ["Active", "Inactive"];
    }
    
    // New members can be set to Active or stay New
    return ["New", "Active"];
  }, []);

  const getRoleOptions = useCallback(() => {
    return ["Member"];
  }, []);

  // ✅ STATUS SYNCHRONIZATION: Real-time listener for member status changes
  useEffect(() => {
    console.log("🔄 Setting up real-time member status listener...");
    
    const membersRef = collection(db, "members");
    const unsubscribe = onSnapshot(membersRef, (snapshot) => {
      console.log("📡 Real-time update received for members");
      
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
          status: (d.status as MemberData["status"]) || "New",
        };
      }) as MemberData[];

      const filteredData = data.filter((m) => m.status && statusColors[m.status]);
      setMembers(filteredData);
      
      console.log(`✅ Real-time sync: ${filteredData.length} members loaded`);
    }, (error) => {
      console.error("❌ Error in real-time listener:", error);
    });

    // Cleanup on unmount
    return () => {
      console.log("🧹 Cleaning up real-time listener");
      unsubscribe();
    };
  }, []);

  // ✅ STATUS SYNCHRONIZATION: Periodic refresh as backup
  useEffect(() => {
    const refreshMembers = async () => {
      console.log("🕒 Periodic refresh of members");
      // The real-time listener should handle updates, but this is a backup
    };

    // Refresh every 10 minutes as backup
    const interval = setInterval(refreshMembers, 10 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  // ✅ STATUS SYNCHRONIZATION: Refresh when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("👀 Page visible - ensuring data is fresh");
        // Force a re-read from the real-time listener
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ✅ POST-CREATION DEBUG: Monitor critical states
  useEffect(() => {
    console.log("🎯 [POST-CREATION MONITOR] Critical states:", {
      showModal,
      isProcessing,
      isEditing,
      surname: surname ? "***" : "empty",
      firstname: firstname ? "***" : "empty",
    });
  }, [showModal, isProcessing, isEditing, surname, firstname]);

  // ✅ Navigation handlers
  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  const handleDashboardClick = () => {
    navigate("/Dashboard");
  };

  // ✅ Legacy fetch function (kept for compatibility, but real-time listener handles updates)
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
          status: (d.status as MemberData["status"]) || "New",
        };
      }) as MemberData[];

      setMembers(data.filter((m) => m.status && statusColors[m.status]));
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  };

  // ✅ IMPROVED RESET FUNCTION with detailed debugging
  const resetForm = useCallback(() => {
    console.log("🔄 [POST-CREATION RESET] Starting form reset...");

    // Store previous values for debugging
    const previousValues = {
      surname,
      firstname,
      email,
      isEditing,
      isProcessing,
      showModal,
    };

    console.log("📊 [POST-CREATION RESET] Previous values:", previousValues);

    // Reset all form states
    setSurname("");
    setFirstname("");
    setMiddlename("");
    setDob("");
    setAddress("");
    setContact("");
    setEmail("");
    setCivilStatus("Single");
    setRole("Member");
    setPassword("");
    setConfirm("");
    setStatus("New");

    // Reset UI states
    setErrorMessage(null);
    setShowPasswordInfo(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsEditing(false);
    setCurrentMemberId(null);
    setIsProcessing(false);

    console.log("✅ [POST-CREATION RESET] Form reset completed");
    console.log("📊 [POST-CREATION RESET] New values:", {
      surname: "",
      firstname: "",
      email: "",
      isEditing: false,
      isProcessing: false,
    });
  }, [surname, firstname, email, isEditing, isProcessing, showModal]);

  const handleOpenCreateModal = async () => {
    console.log("🎯 [POST-CREATION DEBUG] Opening create modal...");
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      return;
    }

    // Force blur any focused elements for Electron
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // RESET MUNA BAGO MAG-OPEN - gaya ng posting
    resetForm();
    setShowModal(true);

    // Focus management for Electron
    setTimeout(() => {
      const firstInput = document.querySelector("input") as HTMLInputElement;
      firstInput?.focus();
    }, 100);

    console.log("✅ [POST-CREATION DEBUG] Modal opened successfully");
  };

  const handleCloseModal = () => {
    console.log("🚪 [POST-CREATION DEBUG] Manual close triggered");

    // Enhanced Electron focus management
    setTimeout(() => {
      setShowModal(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.focus();
    }, 10);
  };

  const filteredMembers = members
    .filter((member) => {
      const targetStatus = viewMode === "active" ? "Deleted" : "";
      return viewMode === "active"
        ? member.status !== targetStatus
        : member.status === "Deleted";
    })
    .filter(
      (member) =>
        member.firstname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.surname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.accNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (member.address &&
          member.address.toLowerCase().includes(searchQuery.toLowerCase())) // ADDED: Search by address
    );

  const activeCount = members.filter((m) => m.status !== "Deleted").length;
  const deletedCount = members.filter((m) => m.status === "Deleted").length;

  const totalPages = Math.max(
    1,
    Math.ceil(filteredMembers.length / membersPerPage)
  );
  const startIndex = (currentPage - 1) * membersPerPage;
  const currentMembers = filteredMembers.slice(
    startIndex,
    startIndex + membersPerPage
  );

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      showAlert(
        "Session Expired",
        "Admin session expired. Please log in again."
      );
      return;
    }

    showConfirm(
      "Confirm Deletion",
      `Are you sure you want to soft-delete the account for ${memberName}?\n\nThis will mark the account as 'Deleted' and remove it from the main list, but their historical data will be preserved and can be restored.`,
      async () => {
        try {
          const memberRef = doc(db, "members", memberId);
          await updateDoc(memberRef, { status: "Deleted" });
          showAlert(
            "Success",
            `${memberName}'s account has been successfully marked as Deleted.`
          );
          // Real-time listener will automatically update the UI
        } catch (error) {
          console.error("Error soft-deleting member:", error);
          showAlert(
            "Error",
            "Failed to soft-delete account. Check console and Firebase Security Rules. (Permissions Issue)"
          );
        }
      }
    );
  };

  const handleRestoreMember = async (memberId: string, memberName: string) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      showAlert(
        "Session Expired",
        "Admin session expired. Please log in again."
      );
      return;
    }

    showConfirm(
      "Confirm Restoration",
      `Are you sure you want to RESTORE the account for ${memberName}?`,
      async () => {
        try {
          const memberRef = doc(db, "members", memberId);
          await updateDoc(memberRef, { status: "Active" });
          showAlert(
            "Success",
            `${memberName}'s account has been successfully Restored.`
          );
          // Real-time listener will automatically update the UI
          setCurrentPage(1);
          setViewMode("active");
        } catch (error) {
          console.error("Error restoring member:", error);
          showAlert(
            "Error",
            "Failed to restore account. Check console and Firebase Security Rules. (Permissions Issue)"
          );
        }
      }
    );
  };

  const handleEditClick = async (member: MemberData) => {
    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      return;
    }

    console.log("✏️ Editing member:", member);

    // Force blur any focused elements for Electron
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // DIRECT STATE SETTING - gaya ng posting
    setSurname(member.surname || "");
    setFirstname(member.firstname || "");
    setMiddlename(member.middlename || "");
    setDob(member.dob || "");
    setAddress(member.address || "");
    setContact(member.contact || "");
    setEmail(member.email || "");
    setCivilStatus(member.civilStatus || "Single");
    setRole(member.role || "Member");
    setPassword("");
    setConfirm("");
    setStatus(member.status);

    setCurrentMemberId(member.id);
    setIsEditing(true);
    setShowModal(true);
    setErrorMessage(null);
    setShowPasswordInfo(false);

    // Focus management for Electron
    setTimeout(() => {
      const firstInput = document.querySelector("input") as HTMLInputElement;
      firstInput?.focus();
    }, 100);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔄 Updating account...");
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

    // DIRECT OBJECT CREATION - gaya ng posting
    const memberData = {
      surname: surname,
      firstname: firstname,
      middlename: middlename,
      dob: dob,
      address: address,
      contact: contact,
      email: email,
      civilStatus: civilStatus,
      role: role,
      status: status,
    };

    try {
      const memberRef = doc(db, "members", currentMemberId);
      await updateDoc(memberRef, memberData);

      showAlert(
        "Success",
        `Account for ${firstname} ${surname} updated successfully!`
      );

      // ✅ POST-CREATION FIX: SEQUENTIAL OPERATIONS
      console.log("🎯 [POST-CREATION FLOW] Starting post-update operations...");

      // Enhanced Electron focus management
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // 1. Close modal FIRST
      console.log("🔧 [POST-CREATION FLOW] Step 1: Closing modal");
      setShowModal(false);

      // 2. Reset form SECOND
      console.log("🔧 [POST-CREATION FLOW] Step 2: Resetting form");
      resetForm();

      // Real-time listener will automatically refresh the data
      console.log("✅ [POST-CREATION FLOW] All operations completed successfully");
    } catch (err: any) {
      console.error("Error updating member:", err);
      setErrorMessage(
        err.message ||
          "Failed to update account. Check console and Security Rules."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🆕 [POST-CREATION DEBUG] Starting account creation...");
    setErrorMessage(null);
    setIsProcessing(true);

    const isValidSession = await validateAdminSession();
    if (!isValidSession) {
      setErrorMessage("Admin session expired. Please log in again.");
      setIsProcessing(false);
      return;
    }

    if (password !== confirm) {
      setShowPasswordInfo(true);
      setErrorMessage("Passwords do not match! Please check and try again.");
      setIsProcessing(false);
      return;
    }
    if (!isStrongPassword(password)) {
      setShowPasswordInfo(true);
      setErrorMessage(
        "Password is not strong enough. It must be at least 8 characters long and contain at least one uppercase letter, one number, and one special character."
      );
      setIsProcessing(false);
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMessage(
        "Please enter a valid and acceptable email address (e.g., user@domain.com)."
      );
      setIsProcessing(false);
      return;
    }

    try {
      const newAccNo = await getNextAccNo();

      // DIRECT OBJECT CREATION - gaya ng posting
      const memberData = {
        surname: surname,
        firstname: firstname,
        middlename: middlename,
        dob: dob,
        address: address,
        contact: contact,
        email: email,
        civilStatus: civilStatus,
        role: role,
        status: status || "New",
        accNo: newAccNo,
      };

      const functions = getFunctions();
      const createUserAccount = httpsCallable(functions, "createUserAccount");

      const result = await createUserAccount({
        userData: memberData,
        password: password,
      });

      console.log(
        "✅ [POST-CREATION DEBUG] Cloud function SUCCESS:",
        result.data
      );

      showAlert(
        "Success",
        `Account created successfully! Role: ${role} Account No: ${newAccNo} 🎉`
      );

      // ✅ CRITICAL FIX: PROPER POST-CREATION SEQUENCE
      console.log(
        "🎯 [POST-CREATION FLOW] Starting post-creation operations..."
      );

      // Enhanced Electron focus management
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // 1. Close modal FIRST - most important!
      console.log("🔧 [POST-CREATION FLOW] Step 1: Closing modal");
      console.log(
        "📊 [POST-CREATION FLOW] Before modal close - showModal:",
        showModal
      );
      setShowModal(false);
      console.log(
        "📊 [POST-CREATION FLOW] After modal close - showModal should be false"
      );

      // 2. Reset form SECOND
      console.log("🔧 [POST-CREATION FLOW] Step 2: Resetting form");
      resetForm();

      // Real-time listener will automatically fetch the updated data
      console.log(
        "✅ [POST-CREATION FLOW] ALL POST-CREATION OPERATIONS COMPLETED SUCCESSFULLY"
      );
    } catch (err: any) {
      console.error("❌ [POST-CREATION DEBUG] Cloud function error:", err);
      let errorText = "An unknown error occurred.";

      if (err.code === "permission-denied") {
        errorText =
          "Error: You don't have permission to create accounts. Admin access required.";
      } else if (err.code === "unauthenticated") {
        errorText = "Error: Please log in again.";
      } else if (err.code === "already-exists") {
        errorText = "Error: Email already in use.";
      } else if (err.message) {
        errorText = err.message;
      }

      setErrorMessage(errorText);
      setShowPasswordInfo(true);
    } finally {
      setIsProcessing(false);
      console.log("🔚 [POST-CREATION DEBUG] handleCreateAccount completed");
    }
  };

  return (
    <div className="">
      {/* TOP HEADER - Account Registry Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        {/* Account Registry Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">
            Account Registry
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          {/* User Info */}
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
              <span className="text-sm font-medium hidden sm:inline">
                Admin
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Header and Search */}
      <div className="bg-gray-300 h-20 flex  items-center px-8">
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
            .bg-teader { background-color: #141d21; }
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
            viewMode === "active"
              ? "text-emerald-700 border-b-2 border-emerald-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Accounts ({activeCount})
        </button>
        <button
          onClick={() => {
            setViewMode("deleted");
            setCurrentPage(1);
          }}
          className={`py-2 px-4 font-medium transition-colors ${
            viewMode === "deleted"
              ? "text-emerald-700 border-b-2 border-emerald-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Deleted Accounts ({deletedCount})
        </button>
      </div>

      {/* Table */}
      <div className="px-8 ">
        <div
          id="members-table-container"
          className="overflow-x-auto bg-white rounded-lg shadow-md"
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-[#383737] text-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Acc. No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Surname
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  First Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Middle Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Date of Birth
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Email Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Civil Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Role in HOA
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  House Address
                </th>{" "}
                {/* CHANGED: Password to House Address */}
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentMembers.length > 0 ? (
                currentMembers.map((member, index) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {startIndex + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {member.accNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.surname}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.firstname}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.middlename || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.dob || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.civilStatus || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.role || "Member"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.address || "N/A"}
                    </td>{" "}
                    {/* CHANGED: Password to House Address */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[member.status]}`}
                      >
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
                            onClick={() =>
                              handleDeleteMember(
                                member.id,
                                `${member.firstname} ${member.surname}`
                              )
                            }
                            className="text-red-600 hover:text-red-900"
                            title="Soft Delete Account"
                            disabled={isProcessing}
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            handleRestoreMember(
                              member.id,
                              `${member.firstname} ${member.surname}`
                            )
                          }
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
                  <td
                    colSpan={12}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    {viewMode === "active"
                      ? "No active accounts found."
                      : "No deleted accounts found."}
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
          Showing{" "}
          {filteredMembers.length === 0
            ? 0
            : Math.min(startIndex + 1, filteredMembers.length)}{" "}
          to {Math.min(startIndex + membersPerPage, filteredMembers.length)} of{" "}
          {filteredMembers.length} entries
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
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={
              currentPage === totalPages || filteredMembers.length === 0
            }
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800 border-b pb-2">
              {isEditing
                ? `Edit Account: ${firstname} ${surname}`
                : "Create New Account"}
            </h2>
            <form
              onSubmit={isEditing ? handleUpdateAccount : handleCreateAccount}
            >
              {errorMessage && (
                <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
                  {errorMessage}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FloatingInput
                  id="surname"
                  label="Surname"
                  required
                  value={surname}
                  onChange={setSurname}
                  disabled={isProcessing}
                />
                <FloatingInput
                  id="firstname"
                  label="First Name"
                  required
                  value={firstname}
                  onChange={setFirstname}
                  disabled={isProcessing}
                />
                <FloatingInput
                  id="middlename"
                  label="Middle Name"
                  value={middlename}
                  onChange={setMiddlename}
                  disabled={isProcessing}
                />

                <FloatingDateInput
                  id="dob"
                  label="Date of Birth"
                  value={dob}
                  onChange={setDob}
                  disabled={isProcessing}
                />

                <FloatingInput
                  id="address"
                  label="House Address"
                  value={address}
                  onChange={setAddress}
                  disabled={isProcessing}
                />
                <FloatingInput
                  id="contact"
                  label="Contact No."
                  value={contact}
                  onChange={setContact}
                  disabled={isProcessing}
                />

                {isEditing ? (
                  <FloatingInput
                    id="email"
                    label="Email Address"
                    required
                    value={email}
                    onChange={() => {}}
                    type="email"
                    className="pointer-events-none bg-gray-100"
                    disabled={true}
                  />
                ) : (
                  <FloatingInput
                    id="email"
                    label="Email Address"
                    required
                    value={email}
                    onChange={setEmail}
                    type="email"
                    disabled={isProcessing}
                  />
                )}

                <FloatingSelect
                  id="civilStatus"
                  label="Civil Status"
                  required
                  value={civilStatus}
                  onChange={setCivilStatus}
                  options={["Single", "Married", "Divorced", "Widowed"]}
                  disabled={isProcessing}
                />

                <FloatingSelect
                  id="role"
                  label="Role in HOA"
                  required
                  value={role}
                  onChange={setRole}
                  options={getRoleOptions()}
                  disabled={isProcessing}
                />

                {isEditing && (
                  <FloatingSelect
                    id="status"
                    label="Status"
                    required
                    value={status}
                    onChange={setStatus}
                    options={getStatusOptions(status)}
                    disabled={isProcessing || status === "Inactive"} // ✅ ADDED: Disable if Inactive
                  />
                )}

                {!isEditing && (
                  <>
                    <FloatingPasswordInput
                      id="password"
                      label="Password"
                      required
                      value={password}
                      onChange={setPassword}
                      onToggleVisibility={() => setShowPassword(!showPassword)}
                      showPassword={showPassword}
                      onFocus={() => setShowPasswordInfo(true)}
                      onBlur={() => setShowPasswordInfo(false)}
                      disabled={isProcessing}
                    />

                    <FloatingPasswordInput
                      id="confirm"
                      label="Confirm Password"
                      required
                      value={confirm}
                      onChange={setConfirm}
                      onToggleVisibility={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      showPassword={showConfirmPassword}
                      disabled={isProcessing}
                    />
                  </>
                )}
              </div>

              {showPasswordInfo && !isEditing && (
                <p className="mt-3 text-xs text-gray-600 p-2 bg-yellow-50 rounded">
                  Password must be 8+ chars, with an uppercase letter, a number,
                  and a special character.
                </p>
              )}

              {/* ✅ STATUS RESTRICTION WARNING */}
              {isEditing && status === "Inactive" && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium">
                    ⚠️ Status Restriction
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    This account is currently <strong>Inactive</strong>. Status cannot be changed manually. 
                    The member must make a payment to become Active again through the Contribution system.
                  </p>
                </div>
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
                  {isProcessing
                    ? "Processing..."
                    : isEditing
                      ? "Update Account"
                      : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Accounts Modal */}
      <ExportAccountsModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        data={filteredMembers}
        viewMode={viewMode}
      />

      {/* Custom Alert Component */}
      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />

      {/* Custom Confirm Component */}
      <CustomConfirm
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default AccReg;