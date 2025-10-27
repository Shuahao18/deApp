import React, {
  ReactNode,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  Download,
  File,
  MoreVertical,
  Search,
  Star,
  Trash2,
  Edit3,
  Plus,
  Clock,
  ListFilter,
  ChevronDown,
  UserCircle,
  Share,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
} from "firebase/firestore";
import { db } from "../Firebase";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

// --- Performance Optimization Constants ---
const DEBOUNCE_DELAY = 300; // ms for search debounce
const INITIAL_LOAD_LIMIT = 50; // Initial files to load
const BATCH_SIZE = 25; // Files to load per batch

// --- Custom Alert Component for Electron ---
const CustomAlert: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onClose: () => void;
}> = ({ show, title, message, onClose }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
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

// --- Custom Confirm Component for Electron ---
const CustomConfirm: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
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

// --- Custom hooks for alert/confirm replacement ---
const useCustomAlert = () => {
  const [alertState, setAlertState] = useState({
    show: false,
    title: "",
    message: "",
  });

  const showAlert = (title: string, message: string) => {
    setAlertState({ show: true, title, message });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({ ...prev, show: false }));
  };

  return {
    showAlert,
    hideAlert,
    alertState,
  };
};

const useCustomConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showConfirm = (
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
  };

  const hideConfirm = () => {
    setConfirmState((prev) => ({ ...prev, show: false }));
  };

  const handleConfirm = () => {
    confirmState.onConfirm();
    hideConfirm();
  };

  const handleCancel = () => {
    confirmState.onCancel();
    hideConfirm();
  };

  return {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  };
};

// --- Custom Hook for Debounced Search ---
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// --- Loading Spinner Component ---
const LoadingSpinner: React.FC<{ size?: number; text?: string }> = ({
  size = 8,
  text = "Loading...",
}) => (
  <div className="flex flex-col items-center justify-center py-8">
    <Loader2 className={`w-${size} h-${size} text-blue-600 animate-spin`} />
    <p className="mt-2 text-gray-600">{text}</p>
  </div>
);

// --- Error Display Component ---
const ErrorDisplay: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-8 text-red-600">
    <AlertCircle className="w-12 h-12 mb-4" />
    <p className="text-lg font-medium mb-2">Error Loading Data</p>
    <p className="text-sm text-gray-600 mb-4 text-center">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);

// --- Interfaces ---
interface FileDocument {
  id: string;
  name: string;
  url: string;
  size: number;
  lastAccess: string;
  location: string;
  storagePath: string;
  description?: string;
  accNo?: string;
  memberName?: string;
}

interface FolderDocument {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
}

// --- Dropdown Component ---
const Dropdown: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition"
      >
        {label}
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute left-0 mt-1 bg-white border rounded shadow-lg w-40 z-20"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// --- Pagination Component ---
const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
}> = ({
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
  onItemsPerPageChange,
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

      if (startPage > 1) {
        pages.push(1);
        if (startPage > 2) pages.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-4 py-3 bg-white border rounded-lg">
      {/* Items per page selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Show</span>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-600">items per page</span>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1 rounded border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex gap-1">
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === "number" && onPageChange(page)}
              disabled={page === "..."}
              className={`min-w-[32px] h-8 px-2 text-sm rounded border ${
                page === currentPage
                  ? "bg-blue-600 text-white border-blue-600"
                  : page === "..."
                    ? "border-transparent cursor-default"
                    : "border-gray-300 hover:bg-gray-50"
              } disabled:cursor-default`}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1 rounded border disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Page info */}
      <div className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
};

// --- Create Folder Modal ---
const CreateFolderModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => void;
}> = ({ isOpen, onClose, onCreate }) => {
  const [folderName, setFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      setIsCreating(true);
      try {
        await onCreate(folderName.trim());
        setFolderName("");
        showAlert("Success", "Folder created successfully!");
        onClose();
      } catch (error) {
        showAlert("Error", "Failed to create folder. Please try again.");
      } finally {
        setIsCreating(false);
      }
    } else {
      showAlert("Error", "Please enter a folder name.");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 w-96">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Create New Folder</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              disabled={isCreating}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Enter folder name"
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={50}
              disabled={isCreating}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFolderName("");
                  onClose();
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!folderName.trim() || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// --- Rename Folder Modal ---
const RenameFolderModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
}> = ({ isOpen, onClose, onRename, currentName }) => {
  const [folderName, setFolderName] = useState(currentName);
  const [isRenaming, setIsRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setFolderName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim() && folderName.trim() !== currentName) {
      setIsRenaming(true);
      try {
        await onRename(folderName.trim());
        showAlert("Success", "Folder renamed successfully!");
        onClose();
      } catch (error) {
        showAlert("Error", "Failed to rename folder. Please try again.");
      } finally {
        setIsRenaming(false);
      }
    } else if (folderName.trim() === currentName) {
      showAlert("Info", "No changes were made.");
    } else {
      showAlert("Error", "Please enter a valid folder name.");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 w-96">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Rename Folder</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              disabled={isRenaming}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Enter folder name"
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={50}
              disabled={isRenaming}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isRenaming}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !folderName.trim() ||
                  folderName.trim() === currentName ||
                  isRenaming
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isRenaming && <Loader2 className="w-4 h-4 animate-spin" />}
                {isRenaming ? "Renaming..." : "Rename"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// --- Send to Member Modal ---
const SendToMemberModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSend: (
    file: File,
    description: string,
    accNo: string,
    memberName: string
  ) => void;
}> = ({ isOpen, onClose, onSend }) => {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [accNo, setAccNo] = useState("");
  const [memberName, setMemberName] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [memberError, setMemberError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setDescription("");
      setAccNo("");
      setMemberName("");
      setMemberError("");
    }
  }, [isOpen]);

  const fetchMemberDetails = async (accNo: string) => {
    if (accNo.trim().length === 0) {
      setMemberName("");
      setMemberError("");
      return;
    }

    setIsSearching(true);
    setMemberError("");
    try {
      const membersRef = collection(db, "members");
      const q = query(
        membersRef,
        where("accNo", "==", accNo.trim()),
        where("status", "!=", "Deleted")
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setMemberError(
          `Account No. ${accNo} not found or is inactive/deleted.`
        );
        setMemberName("");
      } else {
        const memberData = querySnapshot.docs[0].data();
        const fullName = [
          memberData.surname,
          memberData.firstName,
          memberData.middleName,
        ]
          .filter(Boolean)
          .join(" ");
        setMemberName(fullName || "N/A");
        setMemberError("");
      }
    } catch (error) {
      console.error("Error searching member:", error);
      setMemberError("An error occurred during lookup.");
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced member search
  const debouncedAccNo = useDebounce(accNo, 500);

  useEffect(() => {
    if (debouncedAccNo.trim().length > 0) {
      fetchMemberDetails(debouncedAccNo);
    } else {
      setMemberName("");
      setMemberError("");
    }
  }, [debouncedAccNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      showAlert("Error", "Please select a file to send.");
      return;
    }
    if (memberError || !memberName || isSearching) {
      showAlert(
        "Error",
        "Please enter a valid Account No. and ensure the Member Name is found."
      );
      return;
    }
    if (!description.trim()) {
      showAlert("Error", "Please enter a description for the document.");
      return;
    }

    setIsSending(true);
    try {
      await onSend(file, description, accNo, memberName);
      showAlert(
        "Success",
        `Document successfully sent to ${memberName} (${accNo})`
      );
      onClose();
    } catch (error) {
      showAlert("Error", "Failed to send document. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Send Document to Member</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              disabled={isSending}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Account Number *
                </label>
                <input
                  type="text"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter member's account number"
                  required
                  disabled={isSending}
                />
                {memberError && (
                  <p className="text-xs text-red-600 mt-1">{memberError}</p>
                )}
                {isSearching && (
                  <p className="text-xs text-blue-600 mt-1">
                    Searching for member...
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Member Name
                </label>
                <input
                  type="text"
                  value={memberName}
                  readOnly
                  className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={memberName || "Member name will appear here"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Document Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter document description"
                  rows={3}
                  required
                  disabled={isSending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Select File
                </label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onClick={() => !isSending && fileInputRef.current?.click()}
                >
                  {file ? (
                    <p className="text-sm text-green-600">
                      Selected: {file.name}
                    </p>
                  ) : (
                    <p className="text-gray-500">
                      Click to select file or drag and drop
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,.jfif"
                    disabled={isSending}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !file ||
                  !description.trim() ||
                  !memberName ||
                  !!memberError ||
                  isSearching ||
                  isSending
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSending ? "Sending..." : "Send Document"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// --- Send Multiple Files to Member Modal ---
const SendMultipleFilesModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSend: (
    selectedFiles: FileDocument[],
    description: string,
    accNo: string,
    memberName: string
  ) => void;
  availableFiles: FileDocument[];
}> = ({ isOpen, onClose, onSend, availableFiles }) => {
  const [selectedFiles, setSelectedFiles] = useState<FileDocument[]>([]);
  const [description, setDescription] = useState("");
  const [accNo, setAccNo] = useState("");
  const [memberName, setMemberName] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [fileSearchTerm, setFileSearchTerm] = useState("");

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  // Debounced search for files
  const debouncedFileSearch = useDebounce(fileSearchTerm, 300);

  // Filter files based on search - OPTIMIZED: Memoized with debounced search
  const filteredFiles = useMemo(() => {
    if (!debouncedFileSearch.trim()) return availableFiles;

    const lowerSearch = debouncedFileSearch.toLowerCase().trim();
    return availableFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(lowerSearch) ||
        file.description?.toLowerCase().includes(lowerSearch) ||
        (file.memberName &&
          file.memberName.toLowerCase().includes(lowerSearch)) ||
        (file.accNo && file.accNo.toLowerCase().includes(lowerSearch))
    );
  }, [availableFiles, debouncedFileSearch]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    if (bytes < k) return `${bytes} Bytes`;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i === 1) return (bytes / k).toFixed(2) + " KB";
    const sizes = ["KB", "MB", "GB"];
    if (i > sizes.length) return "Very Large";
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i - 1];
  };

  const getFileIconColor = (filename: string): string => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(extension)) return "text-red-500";
    if (["doc", "docx", "txt", "rtf"].includes(extension))
      return "text-blue-500";
    if (["jpg", "jpeg", "png", "gif", "svg", "jfif"].includes(extension))
      return "text-green-500";
    return "text-gray-500";
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedFiles([]);
      setDescription("");
      setAccNo("");
      setMemberName("");
      setMemberError("");
      setFileSearchTerm("");
    }
  }, [isOpen]);

  const fetchMemberDetails = async (accNo: string) => {
    if (accNo.trim().length === 0) {
      setMemberName("");
      setMemberError("");
      return;
    }

    setIsSearching(true);
    setMemberError("");
    try {
      const membersRef = collection(db, "members");
      const q = query(
        membersRef,
        where("accNo", "==", accNo.trim()),
        where("status", "!=", "Deleted")
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setMemberError(
          `Account No. ${accNo} not found or is inactive/deleted.`
        );
        setMemberName("");
      } else {
        const memberData = querySnapshot.docs[0].data();
        const fullName = [
          memberData.surname,
          memberData.firstName,
          memberData.middleName,
        ]
          .filter(Boolean)
          .join(" ");
        setMemberName(fullName || "N/A");
        setMemberError("");
      }
    } catch (error) {
      console.error("Error searching member:", error);
      setMemberError("An error occurred during lookup.");
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced member search
  const debouncedAccNo = useDebounce(accNo, 500);

  useEffect(() => {
    if (debouncedAccNo.trim().length > 0) {
      fetchMemberDetails(debouncedAccNo);
    } else {
      setMemberName("");
      setMemberError("");
    }
  }, [debouncedAccNo]);

  const toggleFileSelection = (file: FileDocument) => {
    setSelectedFiles((prev) => {
      const isSelected = prev.some((f) => f.id === file.id);
      if (isSelected) {
        return prev.filter((f) => f.id !== file.id);
      } else {
        return [...prev, file];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      showAlert("Error", "Please select at least one file to send.");
      return;
    }
    if (memberError || !memberName || isSearching) {
      showAlert(
        "Error",
        "Please enter a valid Account No. and ensure the Member Name is found."
      );
      return;
    }
    if (!description.trim()) {
      showAlert("Error", "Please enter a description for the documents.");
      return;
    }

    setIsSending(true);
    try {
      await onSend(selectedFiles, description, accNo, memberName);
      if (selectedFiles.length === 1) {
        showAlert(
          "Success",
          `Document successfully sent to ${memberName} (${accNo})`
        );
      } else {
        showAlert(
          "Success",
          `Successfully sent ${selectedFiles.length} files to ${memberName} (${accNo})`
        );
      }
      onClose();
    } catch (error) {
      showAlert("Error", "Failed to send files. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Send to Member</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              disabled={isSending}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Member Information */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    value={accNo}
                    onChange={(e) => setAccNo(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter member's account number"
                    required
                    disabled={isSending}
                  />
                  {memberError && (
                    <p className="text-xs text-red-600 mt-1">{memberError}</p>
                  )}
                  {isSearching && (
                    <p className="text-xs text-blue-600 mt-1">
                      Searching for member...
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Member Name
                  </label>
                  <input
                    type="text"
                    value={memberName}
                    readOnly
                    className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={memberName || "Member name will appear here"}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Document Description *
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter description for all selected documents"
                    rows={4}
                    required
                    disabled={isSending}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This description will be applied to all selected documents.
                  </p>
                </div>

                {/* Selected Files Summary */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-medium mb-2">Selected Files Summary</h3>
                  {selectedFiles.length === 0 ? (
                    <p className="text-sm text-gray-500">No files selected</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-medium">
                          {selectedFiles.length}
                        </span>{" "}
                        file(s) selected
                      </p>
                      <p className="text-sm">
                        Total size:{" "}
                        <span className="font-medium">
                          {formatFileSize(totalSize)}
                        </span>
                      </p>
                      <div className="max-h-32 overflow-y-auto">
                        {selectedFiles.map((file, index) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between text-xs py-1"
                          >
                            <span className="truncate flex-1">{file.name}</span>
                            <span className="text-gray-500 ml-2">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - File Selection */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Select Files to Send ({availableFiles.length} files
                    available)
                  </label>

                  {/* Search Files - OPTIMIZED: Debounced search */}
                  <div className="mb-3">
                    <input
                      type="text"
                      value={fileSearchTerm}
                      onChange={(e) => setFileSearchTerm(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Search files by name, description, member, or account number..."
                      disabled={isSending}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {filteredFiles.length} files match your search.
                    </p>
                  </div>

                  {/* Files List */}
                  <div className="border rounded-lg max-h-96 overflow-y-auto">
                    {filteredFiles.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        {fileSearchTerm
                          ? "No files match your search"
                          : "No files available"}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredFiles.map((file) => {
                          const isSelected = selectedFiles.some(
                            (f) => f.id === file.id
                          );
                          return (
                            <div
                              key={file.id}
                              className={`p-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-blue-50 border-blue-200"
                                  : "hover:bg-gray-50"
                              }`}
                              onClick={() =>
                                !isSending && toggleFileSelection(file)
                              }
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() =>
                                    !isSending && toggleFileSelection(file)
                                  }
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={isSending}
                                />
                                <File
                                  className={`w-4 h-4 ${getFileIconColor(file.name)}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {formatFileSize(file.size)} •{" "}
                                    {file.lastAccess}
                                  </p>
                                  {file.description && (
                                    <p className="text-xs text-gray-600 mt-1 truncate">
                                      {file.description}
                                    </p>
                                  )}
                                  {(file.memberName || file.accNo) && (
                                    <p className="text-xs text-blue-600 mt-1">
                                      {file.memberName}{" "}
                                      {file.accNo && `(${file.accNo})`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selection Actions */}
                  {filteredFiles.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          !isSending && setSelectedFiles(filteredFiles)
                        }
                        className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        disabled={isSending}
                      >
                        Select All ({filteredFiles.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => !isSending && setSelectedFiles([])}
                        className="text-xs px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        disabled={isSending}
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  selectedFiles.length === 0 ||
                  !description.trim() ||
                  !memberName ||
                  !!memberError ||
                  isSearching ||
                  isSending
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send {selectedFiles.length} File
                {selectedFiles.length !== 1 ? "s" : ""}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

type SortKey = "name" | "createdAt" | "fileCount";
type FileSortKey = "name" | "lastAccess" | "size";
type SortDirection = "asc" | "desc";
type FileExtension = "all" | "pdf" | "doc" | "img" | "other";

const FoldersPage: React.FC = () => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [fileMenuIndex, setFileMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileDocument[]>([]);
  const [folders, setFolders] = useState<FolderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [hasMoreFiles, setHasMoreFiles] = useState(true);
  const [filesLastDoc, setFilesLastDoc] = useState<any>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal states
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);
  const [isSendToMemberModalOpen, setIsSendToMemberModalOpen] = useState(false);
  const [isSendMultipleModalOpen, setIsSendMultipleModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<FolderDocument | null>(
    null
  );
  const [filesForSending, setFilesForSending] = useState<FileDocument[]>([]);

  // Custom hooks for alerts and confirms
  const { showAlert, hideAlert, alertState } = useCustomAlert();
  const {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  } = useCustomConfirm();

  // Start with 'All Folder' for a general view
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"folders" | "files">("folders");

  // Filters & Sorting State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileExtension>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [fileSortBy, setFileSortBy] = useState<FileSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [fileSortDirection, setFileSortDirection] =
    useState<SortDirection>("asc");

  // Debounced search for better performance
  const debouncedSearchQuery = useDebounce(searchQuery, DEBOUNCE_DELAY);

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  // --- Utility Functions ---
  const getFileExtension = (filename: string): FileExtension => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(extension)) return "pdf";
    if (["doc", "docx", "txt", "rtf"].includes(extension)) return "doc";
    if (["jpg", "jpeg", "png", "gif", "svg", "jfif"].includes(extension))
      return "img";
    return "other";
  };

  const getFileIconColor = (filename: string): string => {
    const type = getFileExtension(filename);
    switch (type) {
      case "pdf":
        return "text-red-500";
      case "doc":
        return "text-blue-500";
      case "img":
        return "text-green-500";
      default:
        return "text-gray-500";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    if (bytes < k) return `${bytes} Bytes`;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i === 1) return (bytes / k).toFixed(2) + " KB";
    const sizes = ["KB", "MB", "GB"];
    if (i > sizes.length) return "Very Large";
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i - 1];
  };

  // --- File Download Handler ---
  const handleFileDownload = (file: FileDocument) => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.name;
    link.target = "_blank"; // Open in new tab to prevent app replacement
    link.rel = "noopener noreferrer";

    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Get files from folder subcollection with pagination ---
  const getFilesFromFolder = async (
    folderId: string,
    loadMore = false
  ): Promise<{ files: FileDocument[]; lastDoc: any }> => {
    try {
      const filesCollectionRef = collection(db, "folders", folderId, "files");
      let q = query(
        filesCollectionRef,
        orderBy("name"),
        limit(loadMore ? BATCH_SIZE : INITIAL_LOAD_LIMIT)
      );

      if (loadMore && filesLastDoc) {
        q = query(
          filesCollectionRef,
          orderBy("name"),
          filesLastDoc,
          limit(BATCH_SIZE)
        );
      }

      const querySnapshot = await getDocs(q);
      const fetchedFiles: FileDocument[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FileDocument[];

      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      setHasMoreFiles(querySnapshot.docs.length === BATCH_SIZE);

      return { files: fetchedFiles, lastDoc };
    } catch (error) {
      console.error(`Error fetching files from folder ${folderId}:`, error);
      return { files: [], lastDoc: null };
    }
  };

  // --- Load more files handler ---
  const handleLoadMoreFiles = async () => {
    if (selectedFolderId === "all" || !hasMoreFiles || loadMoreLoading) return;

    setLoadMoreLoading(true);
    try {
      const { files: newFiles, lastDoc } = await getFilesFromFolder(
        selectedFolderId,
        true
      );
      setFiles((prev) => [...prev, ...newFiles]);
      setFilesLastDoc(lastDoc);
    } catch (error) {
      console.error("Error loading more files:", error);
      showAlert("Error", "Failed to load more files. Please try again.");
    } finally {
      setLoadMoreLoading(false);
    }
  };

  // --- Get all files (for "All Folder" view) with optimization ---
  const getAllFiles = async (): Promise<FileDocument[]> => {
    try {
      const allFiles: FileDocument[] = [];

      // Get all folders first with count only for initial load
      const foldersSnapshot = await getDocs(collection(db, "folders"));

      // Get files from each folder's subcollection with limits
      for (const folderDoc of foldersSnapshot.docs) {
        const { files: folderFiles } = await getFilesFromFolder(folderDoc.id);
        // Add folder location to each file
        const filesWithLocation = folderFiles.map((file) => ({
          ...file,
          location: folderDoc.id,
        }));
        allFiles.push(...filesWithLocation);

        // Early exit if we have enough files for initial display
        if (allFiles.length >= INITIAL_LOAD_LIMIT) {
          break;
        }
      }

      return allFiles;
    } catch (error) {
      console.error("Error fetching all files:", error);
      return [];
    }
  };

  // --- Fetch Folders with optimization ---
  const fetchFolders = async () => {
    try {
      setLoading(true);
      setError(null);
      const foldersCollectionRef = collection(db, "folders");
      const querySnapshot = await getDocs(foldersCollectionRef);
      const fetchedFolders: FolderDocument[] = [];

      // Use Promise.all for parallel folder file count fetching
      const folderPromises = querySnapshot.docs.map(async (doc) => {
        const folderData = doc.data();
        if (folderData && typeof folderData === "object") {
          // Get file count without loading all files
          const filesCollectionRef = collection(db, "folders", doc.id, "files");
          const countSnapshot = await getCountFromServer(filesCollectionRef);
          const fileCount = countSnapshot.data().count;

          return {
            id: doc.id,
            name: folderData.name || "Unnamed Folder",
            createdAt:
              folderData.createdAt || format(new Date(), "MMMM dd, yyyy"),
            fileCount,
          };
        }
        return null;
      });

      const folderResults = await Promise.allSettled(folderPromises);

      folderResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          fetchedFolders.push(result.value);
        }
      });

      // Add "All Folder" folder at the beginning
      const allFilesCount = fetchedFolders.reduce(
        (total, folder) => total + folder.fileCount,
        0
      );
      const allFolder: FolderDocument = {
        id: "all",
        name: "All Folder",
        createdAt: format(new Date(), "MMMM dd, yyyy"),
        fileCount: allFilesCount,
      };

      setFolders([allFolder, ...fetchedFolders]);

      // Load initial files for "All Folder" view
      const initialFiles = await getAllFiles();
      setFiles(initialFiles);
    } catch (error) {
      console.error("Error fetching folders: ", error);
      setError(
        "Failed to load folders. Please check your connection and try again."
      );
      // Set default folders if fetch fails
      const defaultFolders: FolderDocument[] = [
        {
          id: "all",
          name: "All Folder",
          createdAt: format(new Date(), "MMMM dd, yyyy"),
          fileCount: 0,
        },
      ];
      setFolders(defaultFolders);
    } finally {
      setLoading(false);
    }
  };

  // Update folder file counts when files change
  useEffect(() => {
    if (folders.length > 0) {
      const updatedFolders = folders.map((folder) => {
        if (folder.id === "all") {
          return { ...folder, fileCount: files.length };
        }
        const folderFileCount = files.filter(
          (file) => file.location === folder.id
        ).length;
        return { ...folder, fileCount: folderFileCount };
      });
      setFolders(updatedFolders);
    }
  }, [files]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedFolderId,
    debouncedSearchQuery,
    fileTypeFilter,
    sortBy,
    sortDirection,
    fileSortBy,
    fileSortDirection,
  ]);

  // --- Menu Toggle ---
  const toggleMenu = (index: number) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
  };

  const toggleFileMenu = (index: number) => {
    setFileMenuIndex(fileMenuIndex === index ? null : index);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuIndex(null);
      }
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(event.target as Node)
      ) {
        setFileMenuIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Folder Management ---
  const handleCreateFolder = async (folderName: string) => {
    try {
      const newFolder = {
        name: folderName,
        createdAt: format(new Date(), "MMMM dd, yyyy"),
        fileCount: 0,
      };

      const docRef = await addDoc(collection(db, "folders"), newFolder);
      const createdFolder: FolderDocument = {
        id: docRef.id,
        ...newFolder,
      };

      setFolders((prev) => [prev[0], createdFolder, ...prev.slice(1)]); // Keep "All Folder" first
    } catch (error) {
      console.error("Error creating folder:", error);
      throw error;
    }
  };

  const handleRenameFolder = async (newName: string) => {
    if (!folderToRename) return;

    try {
      const folderRef = doc(db, "folders", folderToRename.id);
      await updateDoc(folderRef, { name: newName });

      // Update folders state
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === folderToRename.id
            ? { ...folder, name: newName }
            : folder
        )
      );

      setFolderToRename(null);
    } catch (error) {
      console.error("Error renaming folder:", error);
      throw error;
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    showConfirm(
      "Confirm Folder Deletion",
      `Are you sure you want to delete the folder "${folderName}"?\n\nALL FILES IN THIS FOLDER WILL BE PERMANENTLY DELETED.\n\nThis action cannot be undone.`,
      async () => {
        try {
          // Get all files from the folder subcollection first
          const folderFiles = await getFilesFromFolder(folderId);

          // Delete all files from storage
          const storage = getStorage();
          for (const file of folderFiles.files) {
            try {
              if (file.storagePath) {
                const fileRef = ref(storage, file.storagePath);
                await deleteObject(fileRef);
              }
            } catch (storageError) {
              console.warn(
                `Could not delete file from storage: ${file.name}`,
                storageError
              );
            }
          }

          // Delete the folder document
          await deleteDoc(doc(db, "folders", folderId));

          // Update local state
          setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
          setFiles((prev) => prev.filter((file) => file.location !== folderId));

          // If the deleted folder was selected, switch to "All Folder"
          if (selectedFolderId === folderId) {
            setSelectedFolderId("all");
            setViewMode("folders");
          }

          setOpenMenuIndex(null);
          showAlert("Success", `Folder "${folderName}" deleted successfully!`);
        } catch (error) {
          console.error("Error deleting folder:", error);
          showAlert(
            "Error",
            "Error deleting folder. Please check permissions."
          );
        }
      }
    );
  };

  // --- Folder Click Handler ---
  const handleFolderClick = async (folderId: string) => {
    setSelectedFolderId(folderId);
    setViewMode("files");
    setCurrentPage(1);
    setFilesLastDoc(null);
    setHasMoreFiles(true);

    // Load files for the selected folder
    if (folderId !== "all") {
      setLoadMoreLoading(true);
      try {
        const { files: folderFiles, lastDoc } =
          await getFilesFromFolder(folderId);
        setFiles(folderFiles);
        setFilesLastDoc(lastDoc);
      } catch (error) {
        console.error("Error loading folder files:", error);
        showAlert("Error", "Failed to load folder contents.");
      } finally {
        setLoadMoreLoading(false);
      }
    }
  };

  // --- Back to Folders ---
  const handleBackToFolders = () => {
    setViewMode("folders");
    setSelectedFolderId("all");
    setCurrentPage(1);
    // Reload all files for "All Folder" view
    fetchFolders();
  };

  // --- Send Document to Member ---
  const handleSendToMember = async (
    file: File,
    description: string,
    accNo: string,
    memberName: string
  ) => {
    try {
      const storage = getStorage();
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storagePath = `member-documents/${accNo}/${uniqueFileName}`;
      const fileRef = ref(storage, storagePath);

      // Upload file to storage
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Create document record in Firestore
      const newDoc = {
        name: file.name,
        url: downloadURL,
        size: file.size,
        lastAccess: format(new Date(), "MMMM dd, yyyy"),
        location: "member-docs", // Special folder for member documents
        storagePath: storagePath,
        description: description,
        accNo: accNo,
        memberName: memberName,
        sentAt: format(new Date(), "MMMM dd, yyyy HH:mm"),
      };

      // Add to the member documents collection
      const docRef = await addDoc(collection(db, "member-documents"), newDoc);

      const newFile: FileDocument = { id: docRef.id, ...newDoc };
      setFiles((prev) => [...prev, newFile]);

      // Update folder file counts
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === "all"
            ? { ...folder, fileCount: (folder.fileCount || 0) + 1 }
            : folder
        )
      );
    } catch (error) {
      console.error("Error sending document to member:", error);
      throw error;
    }
  };

  // --- Send Multiple Files to Member ---
  const handleSendMultipleFiles = async (
    selectedFiles: FileDocument[],
    description: string,
    accNo: string,
    memberName: string
  ) => {
    try {
      let successCount = 0;
      let errorCount = 0;

      // Process each file
      for (const file of selectedFiles) {
        try {
          // Create a copy of the file in member-documents collection
          const newDoc = {
            name: file.name,
            url: file.url,
            size: file.size,
            lastAccess: format(new Date(), "MMMM dd, yyyy"),
            location: "member-docs",
            storagePath: file.storagePath,
            description: description,
            accNo: accNo,
            memberName: memberName,
            sentAt: format(new Date(), "MMMM dd, yyyy HH:mm"),
            originalFileId: file.id, // Keep reference to original file
          };

          await addDoc(collection(db, "member-documents"), newDoc);
          successCount++;
        } catch (fileError) {
          console.error(`Error sending file ${file.name}:`, fileError);
          errorCount++;
        }
      }

      // Update local state for the new files (optional - you might want to refresh from server)
      const newFiles: FileDocument[] = selectedFiles.map((file) => ({
        ...file,
        id: `temp-${Date.now()}-${file.id}`, // Temporary ID for local state
        description: description,
        accNo: accNo,
        memberName: memberName,
        location: "member-docs",
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Update folder file counts
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === "all"
            ? { ...folder, fileCount: (folder.fileCount || 0) + successCount }
            : folder
        )
      );
    } catch (error) {
      console.error("Error sending multiple files:", error);
      throw error;
    }
  };

  // --- Send Multiple Files Handler - FIXED: Only shows files from current folder ---
  const handleSendMultipleClick = () => {
    // Get available files from the CURRENT FOLDER only
    let availableFiles: FileDocument[];

    if (viewMode === "files" && selectedFolderId !== "all") {
      // If we're in files view and a specific folder is selected, only show files from that folder
      availableFiles = files.filter(
        (file) =>
          file.location === selectedFolderId && file.location !== "member-docs"
      );
    } else {
      // If we're in folders view or "All Folder", show all files except member-docs
      availableFiles = files.filter((file) => file.location !== "member-docs");
    }

    if (availableFiles.length === 0) {
      showAlert("Info", "No files available to send in the current folder.");
      return;
    }

    setFilesForSending(availableFiles);
    setIsSendMultipleModalOpen(true);
  };

  // --- Add File Logic ---
  const handleAddClick = () => {
    if (selectedFolderId === "all") {
      showAlert(
        "Info",
        "Please select a specific folder before adding a file."
      );
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (selectedFolderId === "all") {
      showAlert(
        "Error",
        "Please select a specific folder before adding a file."
      );
      event.target.value = "";
      return;
    }

    const storage = getStorage();
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storagePath = `folders/${selectedFolderId}/${uniqueFileName}`;
    const fileRef = ref(storage, storagePath);

    try {
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newDoc = {
        name: file.name,
        url: downloadURL,
        size: file.size,
        lastAccess: format(new Date(), "MMMM dd, yyyy"),
        location: selectedFolderId,
        storagePath: storagePath,
      };

      // Add to the folder's subcollection
      const docRef = await addDoc(
        collection(db, "folders", selectedFolderId, "files"),
        newDoc
      );

      const newFile: FileDocument = { id: docRef.id, ...newDoc };
      setFiles((prev) => [...prev, newFile]);

      // Update folder file count
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === selectedFolderId
            ? { ...folder, fileCount: (folder.fileCount || 0) + 1 }
            : folder.id === "all"
              ? { ...folder, fileCount: (folder.fileCount || 0) + 1 }
              : folder
        )
      );

      showAlert("Success", `File "${file.name}" uploaded successfully!`);
      event.target.value = "";
    } catch (error) {
      console.error("Error uploading file:", error);
      showAlert(
        "Error",
        "Error uploading file. Please check Firebase setup and permissions."
      );
    }
  };

  // --- Delete File Logic ---
  const handleDeleteFile = async (
    fileId: string,
    fileName: string,
    fileLocation: string,
    storagePath: string
  ) => {
    showConfirm(
      "Confirm File Deletion",
      `Are you sure you want to delete the file: "${fileName}"?\n\nThis action cannot be undone.`,
      async () => {
        try {
          // Delete from the appropriate collection
          if (fileLocation === "member-docs") {
            await deleteDoc(doc(db, "member-documents", fileId));
          } else {
            await deleteDoc(doc(db, "folders", fileLocation, "files", fileId));
          }

          // Delete from storage
          const storage = getStorage();
          try {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef);
          } catch (storageError) {
            console.warn(
              `Storage deletion warning for ${fileName}:`,
              storageError
            );
          }

          // Update local state
          setFiles((prev) => prev.filter((file) => file.id !== fileId));

          // Update folder file counts
          setFolders((prev) =>
            prev.map((folder) =>
              folder.id === fileLocation
                ? {
                    ...folder,
                    fileCount: Math.max(0, (folder.fileCount || 0) - 1),
                  }
                : folder.id === "all"
                  ? {
                      ...folder,
                      fileCount: Math.max(0, (folder.fileCount || 0) - 1),
                    }
                  : folder
            )
          );

          setFileMenuIndex(null);
          showAlert("Success", `File "${fileName}" deleted successfully!`);
        } catch (error) {
          console.error("Error deleting file:", error);
          showAlert("Error", "Error deleting file. Please check permissions.");
        }
      }
    );
  };

  // --- Filtering and Sorting Logic for FOLDERS - OPTIMIZED ---
  const filteredAndSortedFolders = useMemo(() => {
    let result = folders.filter((folder) => folder.id !== "all");

    // Filter by Search Query - OPTIMIZED: Uses debounced search
    if (debouncedSearchQuery.trim()) {
      const lower = debouncedSearchQuery.toLowerCase().trim();
      result = result.filter((folder) =>
        folder.name.toLowerCase().includes(lower)
      );
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "createdAt") {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        comparison = dateA.getTime() - dateB.getTime();
      } else if (sortBy === "fileCount") {
        comparison = a.fileCount - b.fileCount;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [folders, debouncedSearchQuery, sortBy, sortDirection]);

  // --- Filtering and Sorting Logic for FILES - OPTIMIZED ---
  const filteredAndSortedFiles = useMemo(() => {
    let result = files;

    // 1. Filter by Selected Folder
    if (selectedFolderId !== "all") {
      result = result.filter((file) => file.location === selectedFolderId);
    }

    // 2. Filter by Search Query - OPTIMIZED: Uses debounced search
    if (debouncedSearchQuery.trim()) {
      const lower = debouncedSearchQuery.toLowerCase().trim();
      result = result.filter(
        (file) =>
          file.name.toLowerCase().includes(lower) ||
          file.description?.toLowerCase().includes(lower) ||
          (file.memberName && file.memberName.toLowerCase().includes(lower)) ||
          (file.accNo && file.accNo.toLowerCase().includes(lower))
      );
    }

    // 3. Filter by File Type
    if (fileTypeFilter !== "all") {
      result = result.filter(
        (file) => getFileExtension(file.name) === fileTypeFilter
      );
    }

    // 4. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (fileSortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (fileSortBy === "size") {
        comparison = a.size - b.size;
      } else if (fileSortBy === "lastAccess") {
        const dateA = new Date(a.lastAccess);
        const dateB = new Date(b.lastAccess);
        comparison = dateA.getTime() - dateB.getTime();
      }

      return fileSortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [
    files,
    selectedFolderId,
    debouncedSearchQuery,
    fileTypeFilter,
    fileSortBy,
    fileSortDirection,
  ]);

  // --- Pagination Logic ---
  const paginatedFolders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedFolders.slice(startIndex, endIndex);
  }, [filteredAndSortedFolders, currentPage, itemsPerPage]);

  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedFiles.slice(startIndex, endIndex);
  }, [filteredAndSortedFiles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(
    viewMode === "folders"
      ? filteredAndSortedFolders.length / itemsPerPage
      : filteredAndSortedFiles.length / itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 600, behavior: "smooth" });
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
  };

  // Function to toggle sort direction for folders
  const handleTableSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDirection(key === "name" ? "asc" : "desc");
    }
  };

  // Function to toggle sort direction for files
  const handleFileTableSortClick = (key: FileSortKey) => {
    if (fileSortBy === key) {
      setFileSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setFileSortBy(key);
      setFileSortDirection(key === "name" ? "asc" : "desc");
    }
  };

  // --- Toolbar UI ---
  const Toolbar = () => (
    <div className="bg-object text-white px-4 py-2 flex items-center justify-between rounded-md">
      <div className="flex items-center gap-2">
        {/* Add Button */}
        <button
          onClick={handleAddClick}
          disabled={selectedFolderId === "all" || viewMode === "folders"}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition disabled:opacity-50"
          title={
            selectedFolderId === "all"
              ? "Select a specific folder to add files"
              : "+ Add"
          }
        >
          <Plus className="w-4 h-4" /> Add File
        </button>

        {/* Send to Member Button */}
        <button
          onClick={() => setIsSendToMemberModalOpen(true)}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition"
        >
          <Share className="w-4 h-4" /> Send from storage
        </button>

        {/* Send Multiple Files Button */}
        <button
          onClick={handleSendMultipleClick}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition"
          disabled={
            viewMode === "files" && selectedFolderId !== "all"
              ? files.filter(
                  (f) =>
                    f.location === selectedFolderId &&
                    f.location !== "member-docs"
                ).length === 0
              : files.filter((f) => f.location !== "member-docs").length === 0
          }
        >
          <Share className="w-4 h-4" /> Send Files
        </button>

        {/* Create Folder Button */}
        <button
          onClick={() => setIsCreateFolderModalOpen(true)}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition"
        >
          <Folder className="w-4 h-4" /> Create Folder
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* File Type Dropdown (only in files view) */}
        {viewMode === "files" && (
          <Dropdown
            label={
              <>
                <File className="w-4 h-4" /> Type
              </>
            }
          >
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
              onClick={() => setFileTypeFilter("all")}
            >
              All
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
              onClick={() => setFileTypeFilter("pdf")}
            >
              PDF
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
              onClick={() => setFileTypeFilter("doc")}
            >
              Word Docs
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
              onClick={() => setFileTypeFilter("img")}
            >
              Images
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
              onClick={() => setFileTypeFilter("other")}
            >
              Other
            </button>
          </Dropdown>
        )}

        {/* Recent Button */}
        <button
          onClick={() => {
            if (viewMode === "folders") {
              setSortBy("createdAt");
              setSortDirection("desc");
            } else {
              setFileSortBy("lastAccess");
              setFileSortDirection("desc");
            }
          }}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-green-800 transition"
        >
          <Clock className="w-4 h-4" /> Recent
        </button>

        {/* Sort Dropdown */}
        <Dropdown
          label={
            <>
              <ListFilter className="w-4 h-4 hover:bg-green-800" /> Sort by
            </>
          }
        >
          {viewMode === "folders" ? (
            <>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
                onClick={() => {
                  setSortBy("name");
                  setSortDirection("asc");
                }}
              >
                Name (A-Z)
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
                onClick={() => {
                  setSortBy("createdAt");
                  setSortDirection("desc");
                }}
              >
                Date Created (Newest)
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-400 text-gray-800"
                onClick={() => {
                  setSortBy("fileCount");
                  setSortDirection("desc");
                }}
              >
                File Count (Most)
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800"
                onClick={() => {
                  setFileSortBy("name");
                  setFileSortDirection("asc");
                }}
              >
                Name (A-Z)
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800"
                onClick={() => {
                  setFileSortBy("lastAccess");
                  setFileSortDirection("desc");
                }}
              >
                Last Access (Newest)
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800"
                onClick={() => {
                  setFileSortBy("size");
                  setFileSortDirection("desc");
                }}
              >
                File Size (Largest)
              </button>
            </>
          )}
        </Dropdown>
      </div>

      {/* Search Input - FIXED: Now works with multiple letters and full words with debouncing */}
      <div className="flex items-center bg-white rounded px-2">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder={
            viewMode === "folders"
              ? "Find a folder"
              : "Find a file, member, or description"
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ml-2 text-sm p-1 outline-none text-black bg-transparent w-64"
        />
        {/* Clear search button */}
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="ml-1 text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  // --- Initial Data Fetch ---
  useEffect(() => {
    fetchFolders();
  }, []);

  // --- Page Render ---
  return (
    <div className="min-h-screen bg-white">
      {/* TOP HEADER - Folders Header */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        {/* Folders Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">
            Folders
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

      <main className="bg-gray-100">
        <div className="p-6 space-y-6">
          {/* Toolbar */}
          <Toolbar />

          {/* Loading State */}
          {loading ? (
            <LoadingSpinner size={12} text="Loading folders and files..." />
          ) : error ? (
            <ErrorDisplay message={error} onRetry={fetchFolders} />
          ) : (
            <>
              {/* Current Folder Info */}
              <div className="bg-white p-4 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  {viewMode === "files" && (
                    <button
                      onClick={handleBackToFolders}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Folders
                    </button>
                  )}
                  {viewMode === "folders" ? (
                    <FolderOpen className="w-6 h-6 text-blue-600" />
                  ) : (
                    <Folder className="w-6 h-6 text-blue-600" />
                  )}
                  <h2 className="text-lg font-semibold">
                    {viewMode === "folders"
                      ? "All Folders"
                      : folders.find((f) => f.id === selectedFolderId)?.name ||
                        "Folder"}
                  </h2>
                </div>
                <p className="text-sm text-gray-600">
                  {viewMode === "folders"
                    ? `Contains ${folders.filter((f) => f.id !== "all").length} folders with ${files.length} total files`
                    : `Contains ${filteredAndSortedFiles.length} files`}
                  {debouncedSearchQuery &&
                    ` • Filtered by "${debouncedSearchQuery}"`}
                </p>
              </div>

              {/* Count and Pagination Info */}
              <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-600">
                  {viewMode === "folders"
                    ? `Showing ${paginatedFolders.length} of ${filteredAndSortedFolders.length} folders`
                    : `Showing ${paginatedFiles.length} of ${filteredAndSortedFiles.length} files`}
                  {debouncedSearchQuery && ` for "${debouncedSearchQuery}"`}
                  {viewMode === "files" &&
                    fileTypeFilter !== "all" &&
                    ` (${fileTypeFilter.toUpperCase()})`}
                </div>
              </div>

              {/* FOLDERS Table */}
              {viewMode === "folders" && (
                <div className="mt-4 pt-4">
                  <div className="grid grid-cols-4 font-semibold text-sm text-gray-700 border-b pb-2">
                    <div
                      onClick={() => handleTableSortClick("name")}
                      className="col-span-2 cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      Folder Name{" "}
                      {sortBy === "name" &&
                        (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleTableSortClick("createdAt")}
                      className="cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      Date Created{" "}
                      {sortBy === "createdAt" &&
                        (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleTableSortClick("fileCount")}
                      className="cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      Files{" "}
                      {sortBy === "fileCount" &&
                        (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                  </div>

                  {paginatedFolders.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 text-lg">
                      {debouncedSearchQuery
                        ? "📂 No folders match your search"
                        : "📂 No folders found. Create your first folder to get started!"}
                    </div>
                  ) : (
                    paginatedFolders.map((folder, i) => (
                      <div
                        key={folder.id}
                        className="grid grid-cols-4 items-center text-sm text-gray-600 py-3 border-b hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleFolderClick(folder.id)}
                      >
                        <div className="col-span-2">
                          <div className="flex items-center gap-3">
                            <Folder className="w-5 h-5 text-blue-600" />
                            <div>
                              <div className="font-medium text-gray-900">
                                {folder.name}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                Click to view files in this folder
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-gray-600">{folder.createdAt}</div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {folder.fileCount || 0} files
                          </span>
                          <div
                            ref={openMenuIndex === i ? menuRef : null}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical
                              className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMenu(i);
                              }}
                            />
                            {openMenuIndex === i && (
                              <div className="absolute right-0 mt-2 bg-white border rounded shadow-lg z-10 p-2 min-w-[150px]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderToRename(folder);
                                    setIsRenameFolderModalOpen(true);
                                    setOpenMenuIndex(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800 flex items-center gap-2"
                                >
                                  <Edit3 className="w-4 h-4" /> Rename
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(folder.id, folder.name);
                                    setOpenMenuIndex(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Pagination */}
                  {filteredAndSortedFolders.length > 0 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                      itemsPerPage={itemsPerPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  )}
                </div>
              )}

              {/* FILES Table */}
              {viewMode === "files" && (
                <div className="mt-4 pt-4">
                  <div className="grid grid-cols-5 font-semibold text-sm text-gray-700 border-b pb-2">
                    <div
                      onClick={() => handleFileTableSortClick("name")}
                      className="col-span-2 cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      Name{" "}
                      {fileSortBy === "name" &&
                        (fileSortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleFileTableSortClick("lastAccess")}
                      className="cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      Last Access{" "}
                      {fileSortBy === "lastAccess" &&
                        (fileSortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleFileTableSortClick("size")}
                      className="cursor-pointer hover:text-blue-600 flex items-center"
                    >
                      File Size{" "}
                      {fileSortBy === "size" &&
                        (fileSortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div className="text-right">Actions</div>
                  </div>

                  {loadMoreLoading && paginatedFiles.length === 0 ? (
                    <LoadingSpinner text="Loading files..." />
                  ) : paginatedFiles.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 text-lg">
                      {debouncedSearchQuery || fileTypeFilter !== "all"
                        ? "📄 No files match your search criteria"
                        : "📄 No files found in this folder."}
                    </div>
                  ) : (
                    <>
                      {paginatedFiles.map((file, i) => (
                        <div
                          key={file.id}
                          className="grid grid-cols-5 items-center text-sm text-gray-600 py-2 border-b"
                        >
                          <div className="col-span-2">
                            <div className="flex items-center gap-2">
                              <File
                                className={`w-4 h-4 ${getFileIconColor(file.name)}`}
                              />

                              {/* Fixed Download Button - Prevents app from disappearing */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleFileDownload(file);
                                }}
                                className="hover:underline text-blue-600 truncate max-w-[90%] text-left"
                                title={`Click to download: ${file.name}`}
                              >
                                {file.name}
                              </button>
                            </div>
                            {/* Display description and member info if available */}
                            {(file.description || file.memberName) && (
                              <div className="text-xs text-gray-500 mt-1 ml-6">
                                {file.description && (
                                  <div>{file.description}</div>
                                )}
                                {file.memberName && (
                                  <div className="flex gap-2">
                                    <span>To: {file.memberName}</span>
                                    {file.accNo && <span>({file.accNo})</span>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div>{file.lastAccess}</div>
                          <div>{formatFileSize(file.size)}</div>
                          <div className="text-right flex items-center justify-end gap-2 relative">
                            <div ref={fileMenuIndex === i ? fileMenuRef : null}>
                              <MoreVertical
                                className="w-4 h-4 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFileMenu(i);
                                }}
                              />
                              {fileMenuIndex === i && (
                                <div className="absolute top-full right-0 mt-2 bg-white border rounded shadow-lg z-10 p-2 min-w-[150px]">
                                  {/* Single file actions */}
                                  <div className="flex gap-2 mb-2 pb-2 border-b">
                                    <span
                                      title="Download"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleFileDownload(file);
                                        setFileMenuIndex(null);
                                      }}
                                    >
                                      <Download className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                                    </span>
                                    <span
                                      title="Star"
                                      onClick={() =>
                                        showAlert(
                                          "Info",
                                          "Star feature coming soon!"
                                        )
                                      }
                                    >
                                      <Star className="w-5 h-5 cursor-pointer hover:text-yellow-500" />
                                    </span>
                                    <span
                                      title="Edit"
                                      onClick={() =>
                                        showAlert(
                                          "Info",
                                          "Edit feature coming soon!"
                                        )
                                      }
                                    >
                                      <Edit3 className="w-5 h-5 cursor-pointer hover:text-green-500" />
                                    </span>
                                    <span
                                      title="Send to Member"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // For single file sending, use the existing modal
                                        setFilesForSending([file]);
                                        setIsSendMultipleModalOpen(true);
                                        setFileMenuIndex(null);
                                      }}
                                    >
                                      <Share className="w-5 h-5 cursor-pointer hover:text-green-600" />
                                    </span>
                                    <span
                                      title="Delete"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteFile(
                                          file.id,
                                          file.name,
                                          file.location,
                                          file.storagePath
                                        );
                                      }}
                                    >
                                      <Trash2 className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700" />
                                    </span>
                                  </div>

                                  {/* Bulk actions section */}
                                  <div className="text-xs text-gray-500 px-2 mb-1">
                                    Bulk Actions
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSendMultipleClick();
                                      setFileMenuIndex(null);
                                    }}
                                    className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 text-gray-800 flex items-center gap-2 mb-1"
                                  >
                                    <Share className="w-4 h-4" />
                                    Send Multiple Files...
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Load More Button for Files */}
                      {hasMoreFiles && selectedFolderId !== "all" && (
                        <div className="flex justify-center mt-4">
                          <button
                            onClick={handleLoadMoreFiles}
                            disabled={loadMoreLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            {loadMoreLoading && (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            )}
                            {loadMoreLoading ? "Loading..." : "Load More Files"}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Pagination */}
                  {filteredAndSortedFiles.length > 0 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={handlePageChange}
                      itemsPerPage={itemsPerPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setIsCreateFolderModalOpen(false)}
        onCreate={handleCreateFolder}
      />

      <RenameFolderModal
        isOpen={isRenameFolderModalOpen}
        onClose={() => {
          setIsRenameFolderModalOpen(false);
          setFolderToRename(null);
        }}
        onRename={handleRenameFolder}
        currentName={folderToRename?.name || ""}
      />

      <SendToMemberModal
        isOpen={isSendToMemberModalOpen}
        onClose={() => setIsSendToMemberModalOpen(false)}
        onSend={handleSendToMember}
      />

      <SendMultipleFilesModal
        isOpen={isSendMultipleModalOpen}
        onClose={() => setIsSendMultipleModalOpen(false)}
        onSend={handleSendMultipleFiles}
        availableFiles={filesForSending}
      />

      {/* Global Alert and Confirm Components */}
      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />

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

export default FoldersPage;
