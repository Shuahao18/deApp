import { useState, useEffect, useRef } from "react";
import { MoreVertical, Edit2, Plus } from "lucide-react";
// Assuming 'db' and 'storage' are correctly initialized elsewhere and imported
import { db } from "../../Firebase";
import { storage } from "../../Firebase"; 
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"; 

import {
    collection,
    onSnapshot,
    query,
    orderBy,
    doc,
    updateDoc,
    addDoc,
    where,
} from "firebase/firestore";

// --- INTERFACES ---

interface Official {
    id: string;
    name: string;
    position: string;
    contactNo: string;
    email: string;
    termDuration: string;
    photoURL?: string;
}

interface CommitteeMember {
    id: string;
    name: string;
    role: string;
    contactNo: string;
    email: string;
    termDuration: string;
    dateElected: string;
    photoURL?: string;
}

type TabKey = "HOA Boards of members" | "Sport committee" | "Waste management" | "Security Committee";

interface HOABoardContentProps {
    officials: Official[]; 
    handleEditClick: (official: Official) => void;
    openMenuIndex: number | null;
    setOpenMenuIndex: (index: number | null) => void;
}


// =========================================================
// --- 1. EditOfficialModal (Modal for HOA Board) ---
// =========================================================

interface EditModalProps {
    official: Official;
    onClose: () => void;
}

const EditOfficialModal: React.FC<EditModalProps> = ({ official, onClose }) => {
    const [formData, setFormData] = useState({
        name: official.name || '',
        position: official.position || '',
        contactNo: official.contactNo || '',
        email: official.email || '',
        termDuration: official.termDuration || '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        
        try {
            const officialRef = doc(db, "elected_officials", official.id);
            await updateDoc(officialRef, formData);

            alert("Official data updated successfully!");
            onClose();
        } catch (error) {
            console.error("Error updating official:", error);
            alert("Failed to update official data. Check console for details (check Firestore Rules).");
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Edit Official: {official.name}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Position <span className="text-red-500">*</span></label>
                        <input type="text" name="position" value={formData.position} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                        <input type="text" name="contactNo" value={formData.contactNo} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Term Duration</label>
                        <input type="text" name="termDuration" value={formData.termDuration} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                        <p className="text-xs text-gray-500 mt-1">E.g., "2 years" or "until next election"</p>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// =========================================================
// --- 2. AddMemberModal (Modal for Committees) ---
// =========================================================

interface AddMemberModalProps {
    committeeName: string;
    onClose: () => void;
    collectionPath: string; 
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({ committeeName, onClose, collectionPath }) => {
    // Helper function to capitalize the first letter for display
    const formatCommitteeName = (name: string) => 
        name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');


    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    // State to hold the temporary blob URL for preview (Fixes CSP error)
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [formData, setFormData] = useState({
        name: "",
        role: "",
        contactNo: "",
        email: "",
        dateElected: "",
        termDuration: "",
        photoURL: undefined as string | undefined,
    });
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [headExists, setHeadExists] = useState(false); 

    // Cleanup for the blob URL to prevent memory leaks and fix blob-related errors
    useEffect(() => {
        return () => {
            if (imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [imagePreviewUrl]);

    // 1. Check for existing Committee Head on load (Fixes Firebase permission error on line 188)
    useEffect(() => {
        if (!db || !collectionPath) return;

        const q = query(
            collection(db, collectionPath), // Use the specific collection
            where("role", "==", "Committee Head") // Only needs index on 'role' within this collection
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            setHeadExists(!querySnapshot.empty);
        }, (e) => {
            // Error handling for permission issues (e.g., FirebaseError: Missing or insufficient permissions)
            console.error(`Error checking for Committee Head in ${collectionPath}:`, e);
            // We set headExists to false to allow the user to proceed if the error is temporary, 
            // but the Firestore rules MUST be corrected for this to work properly.
            setHeadExists(false); 
        });

        return () => unsubscribe();
    }, [collectionPath]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setError(null); 

        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };
    
    // File and Image Handlers 
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            
            // Clean up previous blob URL
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

            // Create new blob URL for preview (Requires CSP 'blob:' fix)
            setImagePreviewUrl(URL.createObjectURL(file));
        } else {
            setSelectedFile(null);
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
            setImagePreviewUrl(null);
        }
    };

    // Upload function (Addresses 403 Forbidden and storage/unauthorized errors)
    const uploadImage = async (file: File): Promise<string> => {
        if (!storage) {
            throw new Error("Firebase Storage is not initialized.");
        }
        
        // Use the collection path as the storage folder for organization
        const storagePath = `${collectionPath}/${Date.now()}_${file.name}`;
        const imageRef = ref(storage, storagePath);

        const snapshot = await uploadBytes(imageRef, file);

        const downloadURL = await getDownloadURL(snapshot.ref);
        
        return downloadURL;
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Role Conflict Check
        if (formData.role === "Committee Head" && headExists) {
            setError("Conflict: A Committee Head already exists for this committee.");
            return;
        }
        
        if (!formData.name.trim() || !formData.role) {
            setError("Please fill in all required fields (Name and Role).");
            return;
        }

        setIsAdding(true);

        try {
            let finalPhotoURL: string | undefined = undefined;

            if (selectedFile) {
                finalPhotoURL = await uploadImage(selectedFile); 
            }
            
            // Prepare data for Firestore
            const memberData = {
                ...formData,
                photoURL: finalPhotoURL, // Use the uploaded URL or undefined
            };
            
            // Use collectionPath here for the correct destination
            await addDoc(collection(db, collectionPath), memberData);

            alert(`${formData.name} successfully added to ${formatCommitteeName(committeeName)}!`);
            onClose();
        } catch (error) {
            // This catches the FirebaseError on line 268 (storage/unauthorized)
            console.error("Error adding committee member or uploading image:", error);
            setError(`Failed to process request. Check console for details (check Firebase rules for ${collectionPath} in Firestore and Storage).`);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-2xl">
                <h2 className="text-xl font-bold mb-4">Add Member to {formatCommitteeName(committeeName)}</h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {/* Main Content: Two Columns for Image and Form Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* Left Column: Image Input/Preview (col-span-1) */}
                        <div className="md:col-span-1">
                            {/* Hidden file input, connected via ref */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                                style={{ display: 'none' }}
                                disabled={isAdding} // Disable while adding/uploading
                            />
                            
                            <div 
                                className={`bg-gray-100 border border-gray-300 rounded-lg flex items-center justify-center h-full min-h-[300px] cursor-pointer hover:bg-gray-200 transition-colors relative ${isAdding ? 'opacity-70 cursor-wait' : ''}`}
                                onClick={() => !isAdding && fileInputRef.current?.click()} // Open file dialog on click
                            >
                                {imagePreviewUrl ? (
                                    <img 
                                        src={imagePreviewUrl} 
                                        alt="Selected Preview" 
                                        className="w-full h-full object-cover rounded-lg"
                                    />
                                ) : (
                                    <div className="text-center text-gray-500">
                                        <Plus className="w-8 h-8 mx-auto mb-2" />
                                        <p className="font-medium">Add Image</p>
                                    </div>
                                )}
                            </div>
                            {selectedFile && !isAdding && (
                                <button 
                                    type="button" 
                                    onClick={() => handleFileChange({ target: { files: null } } as React.ChangeEvent<HTMLInputElement>)}
                                    className="mt-2 text-sm text-red-600 hover:text-red-800"
                                >
                                    Remove Image
                                </button>
                            )}
                        </div>

                        {/* Right Columns: Form Fields (col-span-2) */}
                        <div className="md:col-span-2 space-y-4">
                            {/* Name Field (Required) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    name="name" 
                                    value={formData.name} 
                                    onChange={handleChange} 
                                    required 
                                    disabled={isAdding}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50" 
                                />
                            </div>

                            {/* Role in HOA Dropdown (Required) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Role in HOA <span className="text-red-500">*</span>
                                </label>
                                <select 
                                    name="role" 
                                    value={formData.role} 
                                    onChange={handleChange} 
                                    required 
                                    disabled={isAdding}
                                    className={`mt-1 block w-full border rounded-md shadow-sm p-2 bg-white ${
                                        formData.role === "Committee Head" && headExists 
                                            ? "border-red-500 focus:ring-red-500 focus:border-red-500" 
                                            : "border-gray-300 focus:ring-green-500 focus:border-green-500"
                                    } disabled:bg-gray-50`}
                                >
                                    <option value="">-- Select Role --</option>
                                    {!headExists && <option value="Committee Head">Committee Head</option>}
                                    <option value="Member">Member</option>
                                </select>
                                {formData.role === "Committee Head" && headExists && (
                                    <p className="mt-1 text-sm text-red-500">Conflict on Assigning role is accured (Head already exists)</p>
                                )}
                            </div>
                            
                            {/* Contact No. */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact No.</label>
                                <input 
                                    type="text" 
                                    name="contactNo" 
                                    value={formData.contactNo} 
                                    onChange={handleChange} 
                                    disabled={isAdding}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50" 
                                />
                            </div>

                            {/* Email Address */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                                <input 
                                    type="email" 
                                    name="email" 
                                    value={formData.email} 
                                    onChange={handleChange} 
                                    disabled={isAdding}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50" 
                                />
                            </div>
                            
                            {/* Date Elected/Appointed */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date Elected/Appointed</label>
                                <input 
                                    type="date"
                                    name="dateElected" 
                                    value={formData.dateElected} 
                                    onChange={handleChange} 
                                    disabled={isAdding}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50" 
                                />
                            </div>

                            {/* Term Duration */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Term Duration</label>
                                <input 
                                    type="text" 
                                    name="termDuration" 
                                    value={formData.termDuration} 
                                    onChange={handleChange} 
                                    disabled={isAdding}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50" 
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Global Error Message */}
                    {error && error !== "Conflict: A Committee Head already exists for this committee." && (
                        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md mt-4">
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}


                    {/* Action Buttons (Cancel and Add member button) */}
                    <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={isAdding}
                            className="px-5 py-2 text-gray-800 rounded-md hover:bg-gray-100 transition-colors border border-gray-300 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isAdding || (formData.role === "Committee Head" && headExists)} 
                            className="px-5 py-2 flex items-center bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAdding ? "Adding..." : <><Plus className="w-4 h-4 mr-1" /> Add member</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// =========================================================
// --- 3. CommitteeContent (Renders Committee Members) ---
// =========================================================

interface CommitteeContentProps {
    committeeName: string;
    collectionPath: string; // New prop for collection path
}

const CommitteeContent: React.FC<CommitteeContentProps> = ({ committeeName, collectionPath }) => {
    const [members, setMembers] = useState<CommitteeMember[]>([]); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- FETCH LOGIC: Direct Collection Query ---
    useEffect(() => {
        if (!db || !collectionPath) return;
        
        setIsLoading(true);

        // Query the specific collection path and order by role
        // Ordering by 'role' helps to put the 'Committee Head' (alphabetically first) at the top
        const q = query(collection(db, collectionPath), orderBy("role")); 

        const unsubscribe = onSnapshot(
            q,
            (querySnapshot) => {
                const membersList: CommitteeMember[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    membersList.push({
                        id: doc.id,
                        name: data.name || '',
                        role: data.role || '',
                        contactNo: data.contactNo || '',
                        email: data.email || '',
                        termDuration: data.termDuration || '',
                        dateElected: data.dateElected || '',
                        photoURL: data.photoURL,
                    } as CommitteeMember);
                });
                setMembers(membersList);
                setIsLoading(false);
            },
            (error) => {
                console.error(`Error fetching members from ${collectionPath}:`, error);
                setMembers([]);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [collectionPath]);
    
    // Helper function to capitalize the first letter for display
    const formatCommitteeName = (name: string) => 
        name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');


    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{formatCommitteeName(committeeName)} Members</h2>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-md"
                >
                    <Plus className="w-4 h-4 mr-1" /> Add Member
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    <p className="col-span-full p-4 text-gray-500">Loading members...</p>
                ) : members.length > 0 ? (
                    members.map((m) => (
                        <div key={m.id} className="bg-white shadow-lg rounded-xl overflow-hidden flex flex-col">
                            <div className="h-40 bg-gray-200 flex items-center justify-center">
                                {m.photoURL ? (
                                    <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" />
                                ) : (
                                    // Default image placeholder
                                    <span className="text-gray-600 font-medium">Profile Image</span>
                                )}
                            </div>
                            <div className={`p-4 relative flex-grow ${m.role === "Committee Head" ? 'bg-green-700 text-white' : 'bg-green-800 text-white'}`}>
                                <button className="absolute top-2 right-2 text-white"><MoreVertical size={20} /></button>
                                <p className="text-lg font-bold truncate">{m.name}</p>
                                <p className="font-semibold border-b border-green-500/50 pb-1 mb-2">{m.role}</p>
                                <p className="text-sm"><span className="font-medium">Contact:</span> {m.contactNo || 'N/A'}</p>
                                <p className="text-sm truncate"><span className="font-medium">Email:</span> {m.email || 'N/A'}</p>
                                <p className="text-sm"><span className="font-medium">Term:</span> {m.termDuration || 'N/A'}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="col-span-full p-4 text-gray-500">No members found for the {formatCommitteeName(committeeName)}. Click "Add Member" to add one.</p>
                )}
            </div>

            {isModalOpen && (
                // Pass both committeeName for display and collectionPath for Firebase ops
                <AddMemberModal 
                    committeeName={committeeName} 
                    collectionPath={collectionPath} 
                    onClose={() => setIsModalOpen(false)} 
                />
            )}
        </div>
    );
};

// =========================================================
// --- 4. HOABoardContent (Renders Elected Officials) ---
// =========================================================

const HOABoardContent: React.FC<HOABoardContentProps> = ({ officials, handleEditClick, openMenuIndex, setOpenMenuIndex }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {officials.length > 0 ? (
                officials.map((o, index) => (
                    <div key={o.id} className="flex items-center bg-white shadow-md rounded-xl overflow-hidden">
                        <div className="w-1/3 bg-gray-200 h-40 flex items-center justify-center">
                            {o.photoURL ? (
                                <img src={o.photoURL} alt={o.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-gray-600 font-medium text-xs text-center">No Image</span>
                            )}
                        </div>
                        <div className="w-2/3 bg-green-800 text-white p-4 relative">
                            {/* Dropdown Menu */}
                            <div className="absolute top-2 right-2">
                                <button 
                                    className="text-white hover:text-gray-300"
                                    onClick={() => setOpenMenuIndex(openMenuIndex === index ? null : index)}
                                >
                                    <MoreVertical />
                                </button>
                                
                                {/* Menu Content */}
                                {openMenuIndex === index && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
                                        <button
                                            onClick={() => handleEditClick(o)} // Open Edit Modal
                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                        >
                                            <Edit2 className="w-4 h-4 mr-2" /> Edit Official
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {/* Official Details */}
                            <p className="text-lg font-bold truncate">{o.name}</p>
                            <p className="font-semibold border-b border-green-500/50 pb-1 mb-2">{o.position}</p>
                            <p className="text-sm"><span className="font-medium">Contact:</span> {o.contactNo || 'N/A'}</p>
                            <p className="text-sm truncate"><span className="font-medium">Email:</span> {o.email || 'N/A'}</p>
                            <p className="text-sm"><span className="font-medium">Term:</span> {o.termDuration || 'N/A'}</p>
                        </div>
                    </div>
                ))
            ) : (
                <p className="p-4 text-gray-500">No elected officials found. Please run an election or add them manually.</p>
            )}
        </div>
    );
}

// Interface for the overall TabContent props
interface TabContentProps extends HOABoardContentProps {
    tab: TabKey;
}

const TabContent: React.FC<TabContentProps> = (props) => {
    
    if (props.tab === "HOA Boards of members") {
        // Render the main HOA Board content
        return <HOABoardContent {...props} />;
    }
    
    // Logic to determine the specific collection path based on the committee tab name
    let collectionPath: string;
    
    switch (props.tab) {
        case "Sport committee":
            collectionPath = "sport_committee_members";
            break;
        case "Waste management":
            collectionPath = "waste_committee_members";
            break;
        case "Security Committee":
            collectionPath = "security_committee_members";
            break;
        default:
            return <p className="p-4 text-red-500">Invalid committee tab selected.</p>;
    }
    
    // Render the generic committee content
    return <CommitteeContent committeeName={props.tab} collectionPath={collectionPath} />;
}


// =========================================================
// --- 5. Main Component: OffHoa (Completed) ---
// =========================================================

export default function OffHoa() {
    const [officials, setOfficials] = useState<Official[]>([]);
    const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
    const [officialToEdit, setOfficialToEdit] = useState<Official | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("HOA Boards of members");
    
    // --- Hook for HOA Boards of members ---
    useEffect(() => {
        if (!db) return;
        
        // Query the main elected_officials collection
        const q = query(collection(db, "elected_officials"), orderBy("position")); 
        
        const unsubscribe = onSnapshot(
            q,
            (querySnapshot) => {
                const officialsList: Official[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    officialsList.push({
                        id: doc.id,
                        name: data.name || '',
                        position: data.position || '',
                        contactNo: data.contactNo || '',
                        email: data.email || '',
                        termDuration: data.termDuration || '',
                        photoURL: data.photoURL,
                    } as Official);
                });
                setOfficials(officialsList);
            },
            (error) => {
                console.error("Error fetching elected officials:", error);
                setOfficials([]);
            }
        );

        return () => unsubscribe();
    }, []);

    const handleEditClick = (official: Official) => {
        setOfficialToEdit(official);
        setOpenMenuIndex(null); // Close menu when modal opens
    };

    const tabs: TabKey[] = ["HOA Boards of members", "Sport committee", "Waste management", "Security Committee"];

    return (
        <div className=" bg-gray-50 min-h-screen">
           <div className="bg-teader p-6"> 
          <h1 className="text-2xl text-white font-semibold">HOA Officials</h1>
        </div>
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 mb-6 ">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                                ${
                                    activeTab === tab
                                        ? "border-green-600 text-green-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }
                            `}
                        >
                            {tab}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content Area */}
            <div className="bg-white p-6 shadow-xl rounded-lg">
                <TabContent 
                    tab={activeTab} 
                    officials={officials}
                    handleEditClick={handleEditClick}
                    openMenuIndex={openMenuIndex}
                    setOpenMenuIndex={setOpenMenuIndex}
                />
            </div>

            {/* Modals */}
            {officialToEdit && (
                <EditOfficialModal 
                    official={officialToEdit} 
                    onClose={() => setOfficialToEdit(null)} 
                />
            )}
            
            {/* AddMemberModal is rendered conditionally inside CommitteeContent */}
            
        </div>
    );
}