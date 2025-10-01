import React, { ReactNode, ButtonHTMLAttributes, useState, useRef, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../Firebase";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { format } from "date-fns";

// --- Dropdown Component (From Original UI) ---
const Dropdown: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => {
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
        className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-gray-700 transition"
      >
        {label}
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 bg-white border rounded shadow-lg w-40 z-20">
          {children}
        </div>
      )}
    </div>
  );
};

// --- File Interface ---
interface FileDocument {
  id: string;
  name: string;
  url: string;
  size: number;
  lastAccess: string; // Stored as "MMMM dd, yyyy"
  location: string; // Folder ID
}

// --- Folder Options ---
const FOLDER_OPTIONS = [
  { id: "Folder no. 1", name: "Folder no. 1", date: "June 20, 2025" },
  { id: "Folder no. 2", name: "Folder no. 2", date: "June 20, 2025" },
  { id: "Folder no. 3", name: "Folder no. 3", date: "June 20, 2025" },
  { id: "Folder no. 4", name: "Folder no. 4", date: "June 20, 2025" },
  { id: "Admin Docs Folder", name: "All Docs", date: "June 20, 2025" },
];

type SortKey = "name" | "lastAccess" | "size";
type SortDirection = "asc" | "desc";
type FileExtension = "all" | "pdf" | "doc" | "img" | "other";

const FoldersPage: React.FC = () => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileDocument[]>([]);
  // Start with 'All Docs' for a general view, or FOLDER_OPTIONS[0].id for first folder
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    FOLDER_OPTIONS[FOLDER_OPTIONS.length - 1].id
  );

  // Filters & Sorting State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileExtension>("all");
  const [sortBy, setSortBy] = useState<SortKey>("lastAccess");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // --- Utility Functions ---
  const getFileExtension = (filename: string): FileExtension => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(extension)) return "pdf";
    if (["doc", "docx", "txt"].includes(extension)) return "doc";
    if (["jpg", "jpeg", "png", "gif"].includes(extension)) return "img";
    return "other";
  };
  
  const formatFileSize = (bytes: number): string => {
    return (bytes / 1024).toFixed(2) + " KB";
  };

  // --- Fetch Files ---
  const fetchFiles = async () => {
    try {
      const filesCollectionRef = collection(db, "admin_docs");
      const querySnapshot = await getDocs(filesCollectionRef);
      const fetchedFiles: FileDocument[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FileDocument[];
      setFiles(fetchedFiles);
    } catch (error) {
      console.error("Error fetching documents: ", error);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // --- Menu Toggle ---
  const toggleMenu = (index: number) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Add File Logic ---
  const handleAddClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // The logic to add a file is DISABLED if 'All Docs' is selected, but
    // we should also ensure the selectedFolderId isn't "Admin Docs Folder" before proceeding with DB operations.
    if (selectedFolderId === "Admin Docs Folder") {
        alert("Please select a specific folder before adding a file.");
        return;
    }

    const storage = getStorage();
    const fileRef = ref(storage, `admin_docs/${file.name}`);

    try {
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newDoc = {
        name: file.name,
        url: downloadURL,
        size: file.size,
        lastAccess: format(new Date(), "MMMM dd, yyyy"),
        location: selectedFolderId, // Use the currently selected folder
      };

      const docRef = await addDoc(collection(db, "admin_docs"), newDoc);
      setFiles((prev) => [...prev, { id: docRef.id, ...newDoc }]);
      // Clear file input after upload
      event.target.value = ''; 
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file. Please check Firebase setup and permissions.");
    }
  };

  // --- Delete File Logic ---
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      try {
        // 1. Delete from Firestore
        await deleteDoc(doc(db, "admin_docs", fileId));

        // 2. Delete from Storage
        const storage = getStorage();
        const fileRef = ref(storage, `admin_docs/${fileName}`);
        await deleteObject(fileRef);

        // 3. Update local state
        setFiles((prev) => prev.filter((file) => file.id !== fileId));
      } catch (error) {
        console.error("Error deleting file:", error);
        alert("Error deleting file. Please check permissions.");
      }
    }
  };

  // --- Filtering and Sorting Logic ---
  const filteredAndSortedFiles = useMemo(() => {
    let result = files;

    // 1. Filter by Folder
    if (selectedFolderId !== "Admin Docs Folder") {
      result = result.filter((file) => file.location === selectedFolderId);
    }

    // 2. Filter by Search Query (Name)
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter((file) => file.name.toLowerCase().includes(lower));
    }

    // 3. Filter by File Type
    if (fileTypeFilter !== "all") {
      result = result.filter((file) => getFileExtension(file.name) === fileTypeFilter);
    }

    // 4. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "size") {
        comparison = a.size - b.size;
      } else if (sortBy === "lastAccess") {
        // Convert "MMMM dd, yyyy" string to Date for comparison
        const dateA = new Date(a.lastAccess);
        const dateB = new Date(b.lastAccess);
        comparison = dateA.getTime() - dateB.getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [files, selectedFolderId, searchQuery, fileTypeFilter, sortBy, sortDirection]);

  // Function to toggle sort direction if the key is the same, or set new key/direction
  const handleTableSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDirection("asc"); // Default to ascending when switching field
    }
  };

  // --- Toolbar UI (Re-integrated from original structure) ---
  const Toolbar = () => (
    <div className="bg-object text-white px-4 py-2 flex items-center justify-between rounded-md">
      <div className="flex items-center gap-2">
        {/* Add Button */}
        <button
          onClick={handleAddClick}
          disabled={selectedFolderId === "Admin Docs Folder"}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-gray-700 transition disabled:opacity-50"
          title={selectedFolderId === "Admin Docs Folder" ? "Select a specific folder to add files" : "+ Add"}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

        {/* Type Dropdown */}
        <Dropdown label={<><File className="w-4 h-4" /> Type</>}>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => setFileTypeFilter("all")}>All</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => setFileTypeFilter("pdf")}>PDF</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => setFileTypeFilter("doc")}>Word Docs</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => setFileTypeFilter("img")}>Images</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => setFileTypeFilter("other")}>Other</button>
        </Dropdown>

        {/* Recent Button */}
        <button
          onClick={() => {
            setFileTypeFilter("all");
            setSortBy("lastAccess");
            setSortDirection("desc");
          }}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-gray-700 transition"
        >
          <Clock className="w-4 h-4" /> Recent
        </button>

        {/* Sort Dropdown */}
        <Dropdown label={<><ListFilter className="w-4 h-4" /> Sort by</>}>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => { setSortBy("name"); setSortDirection("asc"); }}>Name (A-Z)</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => { setSortBy("lastAccess"); setSortDirection("desc"); }}>Last Access (Newest)</button>
          <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800" onClick={() => { setSortBy("size"); setSortDirection("desc"); }}>File Size (Largest)</button>
        </Dropdown>
      </div>

      {/* Search Input */}
      <div className="flex items-center bg-white rounded px-2">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Find a file"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ml-2 text-sm p-1 outline-none text-black bg-transparent"
        />
      </div>
    </div>
  );

  // --- Page Render ---
  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gray-100">
        {/* Header */}
        <div className="bg-teader p-6">
          <h1 className="text-2xl text-white font-semibold">Folders</h1>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Toolbar */}
          <Toolbar />

          {/* Folder Row */}
          <div className="flex gap-4 overflow-x-auto pb-2 border-b border-gray-200 mt-4">
            {FOLDER_OPTIONS.map((folder) => (
              <div
                key={folder.id}
                onClick={() => setSelectedFolderId(folder.id)}
                className={`min-w-[200px] p-3 rounded border text-sm cursor-pointer transition-colors ${
                  selectedFolderId === folder.id
                    ? "bg-gray-100 border-gray-400 shadow-inner"
                    : "bg-gray-100 border-gray-200 hover:bg-gray-200"
                }`}
              >
                <div className="font-medium">{folder.name}</div>
                <div className="text-xs text-gray-500">{folder.date}</div>
                <div className="flex justify-end mt-2">
                  <span className="text-xs text-gray-600 font-bold">
                    {/* Count files belonging to this specific folder */}
                    {files.filter((f) => f.location === folder.id).length} files
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* File Table */}
          <div className="mt-6 pt-4">
            <div className="grid grid-cols-4 font-semibold text-sm text-gray-700 border-b pb-2">
              <div
                onClick={() => handleTableSortClick("name")}
                className="cursor-pointer hover:text-blue-600"
              >
                Name {sortBy === "name" && (sortDirection === "asc" ? '↑' : '↓')}
              </div>
              <div
                onClick={() => handleTableSortClick("lastAccess")}
                className="cursor-pointer hover:text-blue-600"
              >
                Last Access {sortBy === "lastAccess" && (sortDirection === "asc" ? '↑' : '↓')}
              </div>
              <div
                onClick={() => handleTableSortClick("size")}
                className="cursor-pointer hover:text-blue-600"
              >
                File Size {sortBy === "size" && (sortDirection === "asc" ? '↑' : '↓')}
              </div>
              <div className="text-right">Location</div>
            </div>

            {filteredAndSortedFiles.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-lg">
                📂 No files found.
              </div>
            ) : (
              filteredAndSortedFiles.map((file, i) => (
                <div key={file.id} className="grid grid-cols-4 items-center text-sm text-gray-600 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <File className={`w-4 h-4 ${getFileExtension(file.name) === 'pdf' ? 'text-red-500' : getFileExtension(file.name) === 'img' ? 'text-green-500' : 'text-gray-500'}`} />
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-blue-600 truncate max-w-[200px]"
                    >
                      {file.name}
                    </a>
                  </div>
                  <div>{file.lastAccess}</div>
                  <div>{formatFileSize(file.size)}</div>
                  <div className="text-right flex items-center justify-end gap-2 relative">
                    <span className="text-gray-500">
                        {/* Find the folder name using the file.location ID */}
                      {FOLDER_OPTIONS.find((f) => f.id === file.location)?.name || "Unknown"}
                    </span>
                    <div ref={menuRef}>
                      <MoreVertical
                        className="w-4 h-4 cursor-pointer"
                        onClick={() => toggleMenu(i)}
                      />
                      {openMenuIndex === i && (
                        <div className="absolute top-full right-0 mt-2 bg-white border rounded shadow-lg z-10 p-2 min-w-[150px] flex gap-2">
                          <a href={file.url} download title="Download">
                            <Download className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                          </a>
                          <span title="Star">
                             <Star className="w-5 h-5 cursor-pointer hover:text-yellow-500" />
                          </span>
                          <span title="Edit">
                             <Edit3 className="w-5 h-5 cursor-pointer hover:text-green-500" />
                          </span>
                          <span title="Delete" onClick={() => handleDeleteFile(file.id, file.name)}>
                            <Trash2 className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700" />
                          </span>
                        </div>
                      )}
                    </div>
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

export default FoldersPage;