import React, { ReactNode, ButtonHTMLAttributes, useState, useRef, useEffect } from "react";
import {
  Download,
  File,
  MoreVertical,
  Search,
  Star,
  Trash2,
  Edit3,
} from "lucide-react";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../Firebase";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { format } from "date-fns";

// --- Utility Components ---
// Button component remains the same
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  children: ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className = "",
  children,
  ...props
}) => {
  const baseStyle = "px-3 py-1 rounded-md font-medium focus:outline-none";
  const variants: Record<string, string> = {
    ghost: "bg-transparent hover:bg-gray-200",
    outline: "border border-gray-400 hover:bg-gray-100",
    default: "bg-blue-600 text-white hover:bg-blue-700",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

// --- Main Component ---
interface FileDocument {
  id: string;
  name: string;
  url: string;
  size: number;
  lastAccess: string;
  location: string;
}

const FoldersPage: React.FC = () => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileDocument[]>([]);

  // Function to fetch files from Firestore
  const fetchFiles = async () => {
    try {
      const filesCollectionRef = collection(db, "admin_docs");
      const querySnapshot = await getDocs(filesCollectionRef);
      const fetchedFiles: FileDocument[] = querySnapshot.docs.map(doc => ({
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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const storage = getStorage();
    const fileRef = ref(storage, `admin_docs/${file.name}`);

    try {
      // Step 1: Upload the file to Firebase Storage
      const snapshot = await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Step 2: Add the file metadata to Firestore
      const newDoc = {
        name: file.name,
        url: downloadURL,
        size: file.size,
        lastAccess: format(new Date(), "MMMM dd, yyyy"),
        location: "Admin Docs Folder",
      };

      const docRef = await addDoc(collection(db, "admin_docs"), newDoc);
      console.log("File metadata saved to Firestore with ID:", docRef.id);
      
      // Update state to show the new file
      setFiles(prev => [...prev, { id: docRef.id, ...newDoc }]);

    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file. Please check Firebase Storage and Firestore rules.");
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (window.confirm("Are you sure you want to delete this file?")) {
      try {
        // Step 1: Delete the document from Firestore
        await deleteDoc(doc(db, "admin_docs", fileId));

        // Step 2: Delete the file from Firebase Storage
        const storage = getStorage();
        const fileRef = ref(storage, `admin_docs/${fileName}`);
        await deleteObject(fileRef);

        // Update state to remove the deleted file
        setFiles(prev => prev.filter(file => file.id !== fileId));
        console.log("File deleted successfully!");
      } catch (error) {
        console.error("Error deleting file:", error);
        alert("Error deleting file. Please check your permissions.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="bg-gray-100">
        {/* Top Bar */}
        <div className="bg-[#006C5E] p-6">
          <h1 className="text-2xl text-white font-semibold">Folders</h1>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Control Panel */}
          <div className="bg-white shadow rounded-md p-4">
            <div className="flex justify-between items-center mb-4">
              {/* Buttons */}
              <div className="flex gap-2">
                <Button onClick={handleAddClick}>+ Add</Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button variant="outline">Type</Button>
                <Button variant="outline">Recent</Button>
                <Button variant="outline">Sort by</Button>
              </div>
              
              {/* Search */}
              <div className="flex items-center border rounded px-2 bg-white">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Find a file"
                  className="ml-2 outline-none text-sm bg-transparent"
                />
              </div>
            </div>

            {/* Folder Row - kept as a placeholder */}
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="min-w-[200px] bg-gray-100 p-3 rounded border text-sm"
                >
                  <div className="font-medium">Folder no. {n}</div>
                  <div className="text-xs text-gray-500">June 20, 2025</div>
                  <div className="flex justify-end mt-2">
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              ))}
            </div>

            {/* File Table */}
            <div className="mt-6 border-t pt-4">
              <div className="grid grid-cols-4 font-semibold text-sm text-gray-700 border-b pb-2">
                <div>Name</div>
                <div>Last Access</div>
                <div>File size</div>
                <div className="text-right">Actions</div>
              </div>

              {files.length === 0 ? (
                <div className="py-4 text-center text-gray-500">
                  No files found.
                </div>
              ) : (
                files.map((file, i) => (
                  <div
                    key={file.id}
                    className="grid grid-cols-4 items-center text-sm text-gray-600 py-2 border-b"
                  >
                    <div className="flex items-center gap-2">
                      <File className="w-4 h-4 text-red-500" /> 
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">
                        {file.name}
                      </a>
                    </div>
                    <div>{file.lastAccess}</div>
                    <div>{(file.size / 1024).toFixed(2)} KB</div>
                    <div className="text-right flex items-center justify-end gap-2 relative">
                      <span className="text-gray-500">{file.location}</span>
                      <div ref={menuRef}>
                        <MoreVertical
                          className="w-4 h-4 cursor-pointer"
                          onClick={() => toggleMenu(i)}
                        />
                        {openMenuIndex === i && (
                          <div className="absolute top-full right-0 mt-2 bg-white border rounded shadow z-10 p-2">
                            <div className="flex items-center gap-4">
                              <span title="Download">
                                <a href={file.url} download>
                                  <Download className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                                </a>
                              </span>
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
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FoldersPage;