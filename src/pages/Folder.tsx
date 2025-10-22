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
  UserCircle,
  Share,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
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
  writeBatch
} from "firebase/firestore";
import { db } from "../Firebase"; 
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { format } from "date-fns";
import { useNavigate } from 'react-router-dom';

// --- Dropdown Component ---
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
        <div className="absolute left-0 mt-1 bg-white border rounded shadow-lg w-40 z-20" onClick={() => setOpen(false)}>
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
}> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange }) => {
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
        if (startPage > 2) pages.push('...');
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pages.push('...');
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
              onClick={() => typeof page === 'number' && onPageChange(page)}
              disabled={page === '...'}
              className={`min-w-[32px] h-8 px-2 text-sm rounded border ${
                page === currentPage
                  ? 'bg-blue-600 text-white border-blue-600'
                  : page === '...'
                  ? 'border-transparent cursor-default'
                  : 'border-gray-300 hover:bg-gray-50'
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

// --- Interfaces ---
interface FileDocument {
  id: string;
  name: string;
  url: string;
  size: number;
  lastAccess: string;
  location: string;
  storagePath: string;
}

interface FolderDocument {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
}

// --- Create Folder Modal ---
const CreateFolderModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => void;
}> = ({ isOpen, onClose, onCreate }) => {
  const [folderName, setFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim()) {
      onCreate(folderName.trim());
      setFolderName("");
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Create New Folder</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Enter folder name"
            className="w-full p-2 border border-gray-300 rounded mb-4"
            maxLength={50}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFolderName("");
                onClose();
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setFolderName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderName.trim() && folderName.trim() !== currentName) {
      onRename(folderName.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Rename Folder</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Enter folder name"
            className="w-full p-2 border border-gray-300 rounded mb-4"
            maxLength={50}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

type SortKey = "name" | "lastAccess" | "size";
type SortDirection = "asc" | "desc";
type FileExtension = "all" | "pdf" | "doc" | "img" | "other";

const FoldersPage: React.FC = () => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [folderMenuIndex, setFolderMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileDocument[]>([]);
  const [folders, setFolders] = useState<FolderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Modal states
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<FolderDocument | null>(null);

  // Start with 'All Docs' for a general view
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");

  // Filters & Sorting State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileExtension>("all");
  const [sortBy, setSortBy] = useState<SortKey>("lastAccess");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate('/EditModal');
  };

  const handleDashboardClick = () => {
    navigate('/Dashboard');
  };

  // --- Utility Functions ---
  const getFileExtension = (filename: string): FileExtension => {
    const extension = filename.split(".").pop()?.toLowerCase() || "";
    if (["pdf"].includes(extension)) return "pdf";
    if (["doc", "docx", "txt", "rtf"].includes(extension)) return "doc";
    if (["jpg", "jpeg", "png", "gif", "svg"].includes(extension)) return "img";
    return "other";
  };

  const getFileIconColor = (filename: string): string => {
      const type = getFileExtension(filename);
      switch(type) {
          case 'pdf': return 'text-red-500'; 
          case 'doc': return 'text-blue-500'; 
          case 'img': return 'text-green-500'; 
          default: return 'text-gray-500'; 
      }
  };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} Bytes`;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i === 1) return (bytes / k).toFixed(2) + " KB";
    const sizes = ['KB', 'MB', 'GB'];
    if (i > sizes.length) return 'Very Large';
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i - 1];
  };

  // --- Get files from folder subcollection ---
  const getFilesFromFolder = async (folderId: string): Promise<FileDocument[]> => {
    try {
      const filesCollectionRef = collection(db, "folders", folderId, "files");
      const querySnapshot = await getDocs(filesCollectionRef);
      const fetchedFiles: FileDocument[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as FileDocument[];
      return fetchedFiles;
    } catch (error) {
      console.error(`Error fetching files from folder ${folderId}:`, error);
      return [];
    }
  };

  // --- Get all files (for "All Docs" view) ---
  const getAllFiles = async (): Promise<FileDocument[]> => {
    try {
      const allFiles: FileDocument[] = [];
      
      // Get all folders first
      const foldersSnapshot = await getDocs(collection(db, "folders"));
      
      // Get files from each folder's subcollection
      for (const folderDoc of foldersSnapshot.docs) {
        const folderFiles = await getFilesFromFolder(folderDoc.id);
        // Add folder location to each file
        const filesWithLocation = folderFiles.map(file => ({
          ...file,
          location: folderDoc.id
        }));
        allFiles.push(...filesWithLocation);
      }
      
      return allFiles;
    } catch (error) {
      console.error("Error fetching all files:", error);
      return [];
    }
  };

  // --- Fetch Folders ---
  const fetchFolders = async () => {
    try {
      setLoading(true);
      const foldersCollectionRef = collection(db, "folders");
      const querySnapshot = await getDocs(foldersCollectionRef);
      const fetchedFolders: FolderDocument[] = [];
      
      for (const doc of querySnapshot.docs) {
        const folderData = doc.data();
        // Validate folder data structure
        if (folderData && typeof folderData === 'object') {
          const filesInFolder = await getFilesFromFolder(doc.id);
          
          fetchedFolders.push({
            id: doc.id,
            name: folderData.name || 'Unnamed Folder',
            createdAt: folderData.createdAt || format(new Date(), "MMMM dd, yyyy"),
            fileCount: filesInFolder.length
          });
        }
      }
      
      // Add "All Docs" folder at the beginning
      const allFiles = await getAllFiles();
      const allDocsFolder: FolderDocument = {
        id: "all",
        name: "All Docs",
        createdAt: format(new Date(), "MMMM dd, yyyy"),
        fileCount: allFiles.length
      };
      
      setFolders([allDocsFolder, ...fetchedFolders]);
      setFiles(allFiles);
    } catch (error) {
      console.error("Error fetching folders: ", error);
      // Set default folders if fetch fails
      const defaultFolders: FolderDocument[] = [{
        id: "all",
        name: "All Docs",
        createdAt: format(new Date(), "MMMM dd, yyyy"),
        fileCount: 0
      }];
      setFolders(defaultFolders);
    } finally {
      setLoading(false);
    }
  };

  // Update folder file counts when files change
  useEffect(() => {
    if (folders.length > 0) {
      const updatedFolders = folders.map(folder => {
        if (folder.id === "all") {
          return { ...folder, fileCount: files.length };
        }
        const folderFileCount = files.filter(file => file.location === folder.id).length;
        return { ...folder, fileCount: folderFileCount };
      });
      setFolders(updatedFolders);
    }
  }, [files]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFolderId, searchQuery, fileTypeFilter, sortBy, sortDirection]);

  // --- Menu Toggle ---
  const toggleMenu = (index: number) => {
    setOpenMenuIndex(openMenuIndex === index ? null : index);
  };

  const toggleFolderMenu = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderMenuIndex(folderMenuIndex === index ? null : index);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuIndex(null);
      }
      if (folderMenuRef.current && !folderMenuRef.current.contains(event.target as Node)) {
        setFolderMenuIndex(null);
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
        fileCount: 0
      };

      const docRef = await addDoc(collection(db, "folders"), newFolder);
      const createdFolder: FolderDocument = { 
        id: docRef.id, 
        ...newFolder 
      };
      
      setFolders(prev => [prev[0], createdFolder, ...prev.slice(1)]); // Keep "All Docs" first
    } catch (error) {
      console.error("Error creating folder:", error);
      alert("Error creating folder. Please check Firebase setup and permissions.");
    }
  };

  const handleRenameFolder = async (newName: string) => {
    if (!folderToRename) return;

    try {
      const folderRef = doc(db, "folders", folderToRename.id);
      await updateDoc(folderRef, { name: newName });

      // Update folders state
      setFolders(prev => 
        prev.map(folder => 
          folder.id === folderToRename.id 
            ? { ...folder, name: newName }
            : folder
        )
      );

      setFolderToRename(null);
    } catch (error) {
      console.error("Error renaming folder:", error);
      alert("Error renaming folder. Please check permissions.");
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (window.confirm(`Are you sure you want to delete the folder "${folderName}"? ALL FILES IN THIS FOLDER WILL BE PERMANENTLY DELETED.`)) {
      try {
        // Get all files from the folder subcollection first
        const folderFiles = await getFilesFromFolder(folderId);
        
        // Delete all files from storage
        const storage = getStorage();
        for (const file of folderFiles) {
          try {
            if (file.storagePath) {
              const fileRef = ref(storage, file.storagePath);
              await deleteObject(fileRef);
            }
          } catch (storageError) {
            console.warn(`Could not delete file from storage: ${file.name}`, storageError);
          }
        }

        // Delete the folder document
        await deleteDoc(doc(db, "folders", folderId));

        // Update local state
        setFolders(prev => prev.filter(folder => folder.id !== folderId));
        setFiles(prev => prev.filter(file => file.location !== folderId));

        // If the deleted folder was selected, switch to "All Docs"
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }

        setFolderMenuIndex(null);
      } catch (error) {
        console.error("Error deleting folder:", error);
        alert("Error deleting folder. Please check permissions.");
      }
    }
  };

  // --- Add File Logic ---
  const handleAddClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (selectedFolderId === "all") {
        alert("Please select a specific folder before adding a file.");
        event.target.value = ''; 
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
      setFolders(prev => 
        prev.map(folder => 
          folder.id === selectedFolderId 
            ? { ...folder, fileCount: (folder.fileCount || 0) + 1 }
            : folder.id === "all"
            ? { ...folder, fileCount: (folder.fileCount || 0) + 1 }
            : folder
        )
      );

      event.target.value = ''; 
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file. Please check Firebase setup and permissions.");
    }
  };

  // --- Delete File Logic ---
  const handleDeleteFile = async (fileId: string, fileName: string, fileLocation: string, storagePath: string) => {
    if (window.confirm(`Are you sure you want to delete the file: ${fileName}?`)) {
      try {
        // Delete from the folder's subcollection
        await deleteDoc(doc(db, "folders", fileLocation, "files", fileId));

        // Delete from storage
        const storage = getStorage();
        try {
          const fileRef = ref(storage, storagePath);
          await deleteObject(fileRef);
        } catch(storageError) {
          console.warn(`Storage deletion warning for ${fileName}:`, storageError);
        }

        // Update local state
        setFiles((prev) => prev.filter((file) => file.id !== fileId));
        
        // Update folder file counts
        setFolders(prev => 
          prev.map(folder => 
            folder.id === fileLocation 
              ? { ...folder, fileCount: Math.max(0, (folder.fileCount || 0) - 1) }
              : folder.id === "all"
              ? { ...folder, fileCount: Math.max(0, (folder.fileCount || 0) - 1) }
              : folder
          )
        );

        setOpenMenuIndex(null); 
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
    if (selectedFolderId !== "all") {
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
        const dateA = new Date(a.lastAccess);
        const dateB = new Date(b.lastAccess);
        comparison = dateA.getTime() - dateB.getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [files, selectedFolderId, searchQuery, fileTypeFilter, sortBy, sortDirection]);

  // --- Pagination Logic ---
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedFiles.slice(startIndex, endIndex);
  }, [filteredAndSortedFiles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedFiles.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of file table
    window.scrollTo({ top: 600, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Function to toggle sort direction if the key is the same, or set new key/direction
  const handleTableSortClick = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDirection(key === "name" ? "asc" : "desc"); 
    }
  };

  // --- Toolbar UI ---
  const Toolbar = () => (
    <div className="bg-object text-white px-4 py-2 flex items-center justify-between rounded-md">
      <div className="flex items-center gap-2">
        {/* Add Button */}
        <button
          onClick={handleAddClick}
          disabled={selectedFolderId === "all"}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-gray-700 transition disabled:opacity-50"
          title={selectedFolderId === "all" ? "Select a specific folder to add files" : "+ Add"}
        >
          <Plus className="w-4 h-4" /> Add File
        </button>

        {/* Create Folder Button */}
        <button
          onClick={() => setIsCreateFolderModalOpen(true)}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded hover:bg-gray-700 transition"
        >
          <Folder className="w-4 h-4" /> Create Folder
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
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">Folders</h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <Share size={20} /> 
          </button>

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
            <div className="flex justify-center items-center py-8">
              <div className="text-gray-500">Loading folders...</div>
            </div>
          ) : (
            <>
              {/* Folder Row */}
              <div className="flex gap-4 overflow-x-auto pb-2 border-b border-gray-200 mt-4">
                {folders.map((folder, index) => (
                  <div
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`min-w-[200px] p-3 rounded border text-sm cursor-pointer transition-colors relative ${
                      selectedFolderId === folder.id
                        ? "bg-gray-100 border-gray-400 shadow-inner"
                        : "bg-gray-100 border-gray-200 hover:bg-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium flex items-center gap-2">
                        {folder.id === "all" ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                        {folder.name}
                      </div>
                      {folder.id !== "all" && (
                        <div ref={folderMenuIndex === index ? folderMenuRef : null}>
                          <MoreVertical
                            className="w-4 h-4 cursor-pointer hover:text-gray-700"
                            onClick={(e) => toggleFolderMenu(index, e)}
                          />
                          {folderMenuIndex === index && (
                            <div className="absolute top-8 right-2 bg-white border rounded shadow-lg z-10 p-2 min-w-[120px]">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-gray-800 flex items-center gap-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFolderToRename(folder);
                                  setIsRenameFolderModalOpen(true);
                                  setFolderMenuIndex(null);
                                }}
                              >
                                <Edit3 className="w-4 h-4" /> Rename
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(folder.id, folder.name);
                                }}
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{folder.createdAt}</div>
                    <div className="flex justify-end mt-2">
                      <span className="text-xs text-gray-600 font-bold">
                        {folder.fileCount || 0} files
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* File Count and Pagination Info */}
              <div className="flex justify-between items-center mt-6">
                <div className="text-sm text-gray-600">
                  Showing {paginatedFiles.length} of {filteredAndSortedFiles.length} files
                  {searchQuery && ` for "${searchQuery}"`}
                  {fileTypeFilter !== "all" && ` (${fileTypeFilter.toUpperCase()})`}
                </div>
              </div>

              {/* File Table */}
              <div className="mt-4 pt-4">
                <div className="grid grid-cols-5 font-semibold text-sm text-gray-700 border-b pb-2">
                  <div
                    onClick={() => handleTableSortClick("name")}
                    className="col-span-2 cursor-pointer hover:text-blue-600 flex items-center"
                  >
                    Name {sortBy === "name" && (sortDirection === "asc" ? '↑' : '↓')}
                  </div>
                  <div
                    onClick={() => handleTableSortClick("lastAccess")}
                    className="cursor-pointer hover:text-blue-600 flex items-center"
                  >
                    Last Access {sortBy === "lastAccess" && (sortDirection === "asc" ? '↑' : '↓')}
                  </div>
                  <div
                    onClick={() => handleTableSortClick("size")}
                    className="cursor-pointer hover:text-blue-600 flex items-center"
                  >
                    File Size {sortBy === "size" && (sortDirection === "asc" ? '↑' : '↓')}
                  </div>
                  <div className="text-right">Actions</div>
                </div>

                {paginatedFiles.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-lg">
                    📂 No files found.
                  </div>
                ) : (
                  paginatedFiles.map((file, i) => (
                    <div key={file.id} className="grid grid-cols-5 items-center text-sm text-gray-600 py-2 border-b">
                      <div className="col-span-2 flex items-center gap-2">
                        <File className={`w-4 h-4 ${getFileIconColor(file.name)}`} />
                        
                        {/* Download link with download attribute */}
                        <a
                          href={file.url}
                          download
                          className="hover:underline text-blue-600 truncate max-w-[90%]"
                          title={`Click to download: ${file.name}`}
                        >
                          {file.name}
                        </a>
                      </div>
                      <div>{file.lastAccess}</div>
                      <div>{formatFileSize(file.size)}</div>
                      <div className="text-right flex items-center justify-end gap-2 relative">
                        <span className="text-gray-500 text-xs mr-2">
                          {selectedFolderId === "all" && 
                              (folders.find((f) => f.id === file.location)?.name || "Unknown")}
                        </span>

                        <div ref={openMenuIndex === i ? menuRef : null}>
                          <MoreVertical
                            className="w-4 h-4 cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleMenu(i);
                            }}
                          />
                          {openMenuIndex === i && (
                            <div className="absolute top-full right-0 mt-2 bg-white border rounded shadow-lg z-10 p-2 min-w-[150px] flex gap-2">
                              <a href={file.url} download title="Download">
                                <Download className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                              </a>
                              <span title="Star" onClick={() => alert(`Star clicked for ${file.name}`)}>
                                <Star className="w-5 h-5 cursor-pointer hover:text-yellow-500" />
                              </span>
                              <span title="Edit" onClick={() => alert(`Edit clicked for ${file.name}`)}>
                                <Edit3 className="w-5 h-5 cursor-pointer hover:text-green-500" />
                              </span>
                              <span title="Delete" onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file.id, file.name, file.location, file.storagePath);
                              }}>
                                <Trash2 className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700" />
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
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
    </div>
  );
};

export default FoldersPage;