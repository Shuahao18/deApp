import React, { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '../../Firebase'; // Assuming your firebase config is here
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Plus, MoreVertical, Edit2, X } from 'lucide-react';

// --- INTERFACES ---
interface Official {
    id: string;
    name: string;
    position: string;
    contactNo?: string;
    email: string;
    termDuration?: string;
    photoURL?: string;
    authUid?: string; // Firebase Authentication UID
}

interface CommitteeMember {
    id: string;
    name: string;
    role: string; // e.g., "Committee Head", "Member"
    contactNo?: string;
    email?: string;
    dateElected?: string; // Specific to committee members
    termDuration?: string;
    photoURL?: string;
    authUid?: string;
}

interface EditModalProps {
    official: Official | null; // Allow null for adding new
    onClose: () => void;
    isAddingNew?: boolean; // New prop to explicitly indicate add mode
}

interface AddMemberModalProps {
    committeeName: string;
    collectionPath: string;
    onClose: () => void;
}

type TabKey = "Board of Directors" | "Executive officers" | "Committee officers";

interface HOABoardContentProps {
    officials: Official[];
    handleEditClick: (official: Official) => void;
    handleDeleteClick: (official: Official) => void;
    handleAddNewOfficial: () => void; // New prop for adding a new official
    openMenuIndex: number | null;
    setOpenMenuIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

interface CommitteeContentProps {
    committeeName: string;
    collectionPath: string;
}

interface TabContentProps extends HOABoardContentProps, CommitteeContentProps {
    tab: TabKey;
}

// --- CONSTANTS ---
const HOA_ROLES = ["President", "Vice President", "Secretary", "Treasurer"];

// --- GLOBAL HELPER FUNCTION (MOVED HERE TO FIX THE ERROR) ---

/**
 * Deletes a file from Firebase Storage using its download URL.
 * @param oldPhotoUrl The full URL of the photo to delete.
 */
const deleteOldPhoto = async (oldPhotoUrl?: string) => {
    if (!oldPhotoUrl || !oldPhotoUrl.includes('firebasestorage.googleapis.com')) return; // Only delete Firebase storage URLs

    try {
        // Firebase SDK can parse the ref from the URL
        const photoRef = ref(storage, oldPhotoUrl);
        await deleteObject(photoRef);
        console.log("Old photo deleted from storage:", oldPhotoUrl);
    } catch (error: any) {
        // Ignore if file not found, but log other errors
        if (error.code === 'storage/object-not-found') {
            console.warn("Old photo not found in storage, skipping deletion.");
        } else {
            console.error("Error deleting old photo:", error);
        }
    }
};

// --- MODAL COMPONENTS (Add/Edit) ---

// *********** EditOfficialModal ***********
const EditOfficialModal: React.FC<EditModalProps> = ({ official, onClose, isAddingNew = false }) => {
    const initialOfficial = official || {
        id: '', name: '', position: '', email: '',
        contactNo: '', termDuration: '', photoURL: '', authUid: undefined
    };

    const [formData, setFormData] = useState({
        name: initialOfficial.name || '',
        position: initialOfficial.position || '',
        contactNo: initialOfficial.contactNo || '',
        email: initialOfficial.email || '',
        termDuration: initialOfficial.termDuration || '',
        password: '',
        confirmPassword: '',
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(initialOfficial.photoURL || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasAuthAccount = !!initialOfficial.authUid;

    // Clean up preview URL on unmount
    useEffect(() => {
        return () => {
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [imagePreviewUrl]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
        setError(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(URL.createObjectURL(file));
            setError(null);
        } else {
            setSelectedFile(null);
            // Revert to current official photo if nothing selected
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(initialOfficial.photoURL || null);
        }
    };

    const handleClearPhoto = () => {
        setSelectedFile(null);
        if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreviewUrl);
        }
        setImagePreviewUrl(null); // Clear both preview and current photo (will trigger delete in save)
        setError(null);
    };

    const handleImageUpload = async (): Promise<string | undefined> => {
        if (!selectedFile) return imagePreviewUrl || undefined; // If no new file, return existing or undefined

        // Use the official's ID if editing, or a temporary ID if adding, plus a timestamp
        const officialId = initialOfficial.id || 'new';
        const storageRef = ref(storage, `hoa_officials_photos/${officialId}_${Date.now()}_${selectedFile.name}`);
        await uploadBytes(storageRef, selectedFile);
        return getDownloadURL(storageRef);
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);

        const { password, confirmPassword, ...dataToSave } = formData;
        let finalPayload: Partial<Official> = dataToSave;

        try {
            // --- VALIDATION ---
            if (!dataToSave.name || !dataToSave.position || !dataToSave.email) {
                setError("Name, Position, and Email are required fields.");
                setIsSaving(false);
                return;
            }

            // --- PHOTO UPLOAD & DELETION ---
            const newPhotoURL = await handleImageUpload();
            finalPayload.photoURL = newPhotoURL;

            // If an official had a photo previously, and a new one is uploaded or cleared
            if (!isAddingNew && initialOfficial.photoURL) {
                if (newPhotoURL && newPhotoURL !== initialOfficial.photoURL) { // New photo uploaded
                    await deleteOldPhoto(initialOfficial.photoURL);
                } else if (!newPhotoURL && initialOfficial.photoURL) { // Photo was explicitly cleared
                    await deleteOldPhoto(initialOfficial.photoURL);
                }
            }


            // --- SECURITY & ACCOUNT CREATION/LINKING LOGIC ---
            if (!hasAuthAccount && (password || confirmPassword)) {
                if (!password || !confirmPassword) {
                    setError("Password and Confirm Password are required to create a new account.");
                    setIsSaving(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setError("Password and Confirm Password do not match.");
                    setIsSaving(false);
                    return;
                }
                if (password.length < 6) {
                    setError("Password must be at least 6 characters long.");
                    setIsSaving(false);
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    formData.email,
                    password
                );
                finalPayload.authUid = userCredential.user.uid;
                alert(`Login account successfully created and linked to Firebase Auth for ${formData.name}.`);

            } else if (hasAuthAccount && (password || confirmPassword)) {
                setError("Security Alert: For existing accounts, use the 'Reset Password' button. Password fields are for initial setup only.");
                setIsSaving(false);
                return;
            }

            // --- FIRESTORE OPERATION LOGIC ---
            if (isAddingNew) {
                await addDoc(collection(db, "elected_officials"), finalPayload);
                alert("New official added successfully!");
            } else if (official && official.id) {
                const officialRef = doc(db, "elected_officials", official.id);
                await updateDoc(officialRef, finalPayload);
                alert("Official data updated successfully!");
            } else {
                setError("Invalid operation: Cannot add or update without proper context.");
                setIsSaving(false);
                return;
            }

            onClose();

        } catch (error: any) {
            console.error("Error processing operation/Auth:", error);

            let errorMessage = "Failed to process official data or manage account.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Error: The email is already registered to another account.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Error: Password is too weak (min 6 characters).";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Error: The email address is not valid.";
            } else if (error.code === 'permission-denied' || (error.message && error.message.includes('permission'))) {
                errorMessage = "FATAL ERROR: Missing or insufficient permissions. Check Firebase Security Rules and Admin login state.";
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!formData.email) {
            alert("Please provide the official's email address first to reset the password.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, formData.email);
            alert(`Password reset link sent to ${formData.email}. The official must check their email to complete the reset.`);
        } catch (error) {
            console.error("Error sending password reset email:", error);
            alert("Failed to send password reset email. Check if the email is correctly registered in Firebase Auth.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">
                    {isAddingNew ? "Add New HOA Official" : `Edit Official: ${initialOfficial.name}`}
                </h2>
                {error && (
                    <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Photo Upload Section */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Profile Photo</label>
                        <div className="mt-1 flex items-center space-x-4">
                            {imagePreviewUrl ? (
                                <div className="relative">
                                    <img src={imagePreviewUrl} alt="Preview" className="w-20 h-20 rounded-full object-cover border border-gray-300" />
                                    <button
                                        type="button"
                                        onClick={handleClearPhoto}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                                        aria-label="Clear photo"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">No Image</div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                            >
                                {imagePreviewUrl ? "Change Photo" : "Upload Photo"}
                            </button>
                        </div>
                    </div>


                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Position <span className="text-red-500">*</span></label>
                        <select name="position" value={formData.position} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select a position</option>
                            {HOA_ROLES.map(role => (
                                <option key={role} value={role}>{role}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                        <input type="text" name="contactNo" value={formData.contactNo} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email (Required for Login) <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Term Duration</label>
                        <input type="text" name="termDuration" value={formData.termDuration} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                        <p className="text-xs text-gray-500 mt-1">E.g., "2 years" or "until next election"</p>
                    </div>

                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold mb-2 flex justify-between items-center">
                            {hasAuthAccount ? "Account Status: Linked" : "Initial Account Setup"}
                            {hasAuthAccount && formData.email && (
                                <button
                                    type="button"
                                    onClick={handlePasswordReset}
                                    className="text-sm px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
                                >
                                    Reset Password
                                </button>
                            )}
                        </h3>

                        {!hasAuthAccount && (
                            <>
                                <p className="text-sm text-gray-600 mb-2">Fill in the password fields below to **create their login account**.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            required={!hasAuthAccount && isAddingNew}
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter initial password"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Confirm Password <span className="text-red-500">*</span></label>
                                        <input
                                            type="password"
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            required={!hasAuthAccount && isAddingNew}
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Confirm password"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                    </div>

                    <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving || !!error} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {isSaving ? "Saving..." : (isAddingNew ? "Add Official" : "Save Changes")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// *********** AddMemberModal (Secure Creation Flow) ***********
const AddMemberModal: React.FC<AddMemberModalProps> = ({ committeeName, onClose, collectionPath }) => {
    const formatCommitteeName = (name: string) =>
        name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
        password: "",
        confirmPassword: "",
    });
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [headExists, setHeadExists] = useState(false);

    useEffect(() => {
        return () => {
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [imagePreviewUrl]);

    useEffect(() => {
        if (!db || !collectionPath) return;

        const q = query(
            collection(db, collectionPath),
            where("role", "==", "Committee Head")
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            setHeadExists(!querySnapshot.empty);
        }, (e) => {
            console.error(`Error checking for Committee Head in ${collectionPath}:`, e);
            setHeadExists(false);
        });

        return () => unsubscribe();
    }, [collectionPath]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setError(null);

        const { name, value } = e.target;
        if (name === "role" && value === "Committee Head" && headExists) {
            setError("Only one 'Committee Head' is allowed per committee.");
            return;
        }

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);

            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(URL.createObjectURL(file));
            setError(null);
        } else {
            setSelectedFile(null);
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(null);
        }
    };

    const handleClearPhoto = () => {
        setSelectedFile(null);
        if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreviewUrl);
        }
        setImagePreviewUrl(null);
        setError(null);
    };

    const handleImageUpload = async (): Promise<string | undefined> => {
        if (!selectedFile) return undefined;

        const storageRef = ref(storage, `committee_members_photos/${collectionPath}/new_${Date.now()}_${selectedFile.name}`);
        await uploadBytes(storageRef, selectedFile);
        return getDownloadURL(storageRef);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsAdding(true);

        const { password, confirmPassword, ...dataToAdd } = formData;
        let finalPayload: Partial<CommitteeMember> = dataToAdd;

        try {
            // --- VALIDATION ---
            if (!dataToAdd.name || !dataToAdd.role || !dataToAdd.email) {
                setError("Name, Role, and Email are required fields.");
                setIsAdding(false);
                return;
            }
            if (dataToAdd.role === "Committee Head" && headExists) {
                setError("A 'Committee Head' already exists for this committee. Please select another role or edit the existing head.");
                setIsAdding(false);
                return;
            }
            if (!password || !confirmPassword) {
                setError("Password and Confirm Password are required to create the login account.");
                setIsAdding(false);
                return;
            }
            if (password !== confirmPassword) {
                setError("Password and Confirm Password do not match.");
                setIsAdding(false);
                return;
            }
            if (password.length < 6) {
                setError("Password must be at least 6 characters long.");
                setIsAdding(false);
                return;
            }

            // --- PHOTO UPLOAD ---
            if (selectedFile) {
                finalPayload.photoURL = await handleImageUpload();
            } else {
                finalPayload.photoURL = undefined;
            }

            // --- FIREBASE AUTH ACCOUNT CREATION ---
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                formData.email,
                password
            );
            finalPayload.authUid = userCredential.user.uid;
            alert(`Login account successfully created and linked to Firebase Auth for ${formData.name}.`);


            // --- FIRESTORE ADD LOGIC ---
            await addDoc(collection(db, collectionPath), finalPayload);

            alert(`${formData.name} added to ${formatCommitteeName(committeeName)} successfully!`);
            onClose();

        } catch (error: any) {
            console.error("Error adding member or creating Auth account:", error);

            let errorMessage = "Failed to add member or create account.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "Error: The email is already registered to another account.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Error: Password is too weak (min 6 characters).";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Error: The email address is not valid.";
            } else if (error.code === 'permission-denied' || (error.message && error.message.includes('permission'))) {
                errorMessage = "FATAL ERROR: Missing or insufficient permissions. Check Firebase Security Rules and Admin login state.";
            } else if (error.message) {
                errorMessage = error.message;
            }

            setError(errorMessage);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Add Member to {formatCommitteeName(committeeName)}</h2>
                {error && (
                    <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Photo Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Profile Photo</label>
                        <div className="mt-1 flex items-center space-x-4">
                            {imagePreviewUrl ? (
                                <div className="relative">
                                    <img src={imagePreviewUrl} alt="Preview" className="w-20 h-20 rounded-full object-cover border border-gray-300" />
                                    <button
                                        type="button"
                                        onClick={handleClearPhoto}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                                        aria-label="Clear photo"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">No Image</div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                            >
                                {selectedFile ? "Change Photo" : "Upload Photo"}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
                        <select name="role" value={formData.role} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">Select a role</option>
                            <option value="Committee Head" disabled={headExists && formData.role !== "Committee Head"}>Committee Head</option>
                            <option value="Member">Member</option>
                            <option value="Secretary">Secretary</option>
                            <option value="Treasurer">Treasurer</option>
                            {/* Add other specific roles if needed for committees */}
                        </select>
                        {headExists && formData.role !== "Committee Head" && (
                            <p className="text-xs text-red-500 mt-1">A Committee Head already exists. This member cannot be assigned the 'Committee Head' role.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                        <input type="text" name="contactNo" value={formData.contactNo} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email (Required for Login) <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Date Elected</label>
                        <input type="date" name="dateElected" value={formData.dateElected} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Term Duration</label>
                        <input type="text" name="termDuration" value={formData.termDuration} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500" />
                        <p className="text-xs text-gray-500 mt-1">E.g., "2 years" or "until next election"</p>
                    </div>

                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold mb-2">Login Account Setup <span className="text-red-500">*</span></h3>
                        <p className="text-sm text-gray-600 mb-2">Fill in the password fields below to **create their login account**.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Password</label>
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter initial password"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    required
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Confirm password"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
                            Cancel
                        </button>
                        <button type="submit" disabled={isAdding || !!error} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {isAdding ? "Adding..." : "Add Member"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// *********** EditCommitteeMemberModal ***********
interface EditCommitteeMemberModalProps {
    member: CommitteeMember;
    onClose: () => void;
    collectionPath: string; // Needed for updates and potential re-checking unique roles
}

const EditCommitteeMemberModal: React.FC<EditCommitteeMemberModalProps> = ({ member, onClose, collectionPath }) => {
    const [formData, setFormData] = useState({
        name: member.name,
        role: member.role,
        contactNo: member.contactNo || '',
        email: member.email || '',
        dateElected: member.dateElected || '',
        termDuration: member.termDuration || '',
        password: '', // For password reset, not direct change
        confirmPassword: '', // For password reset, not direct change
    });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(member.photoURL || null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasAuthAccount = !!member.authUid;

    useEffect(() => {
        return () => {
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
        };
    }, [imagePreviewUrl]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setError(null);
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(URL.createObjectURL(file));
            setError(null);
        } else {
            setSelectedFile(null);
            if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreviewUrl);
            }
            setImagePreviewUrl(member.photoURL || null); // Revert to current official photo if nothing selected
        }
    };

    const handleClearPhoto = () => {
        setSelectedFile(null);
        if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreviewUrl);
        }
        setImagePreviewUrl(null);
        setError(null);
    };

    const handleImageUpload = async (): Promise<string | undefined> => {
        if (!selectedFile) return imagePreviewUrl || undefined;

        const storageRef = ref(storage, `committee_members_photos/${collectionPath}/${member.id}_${Date.now()}_${selectedFile.name}`);
        await uploadBytes(storageRef, selectedFile);
        return getDownloadURL(storageRef);
    };


    const handlePasswordReset = async () => {
        if (!formData.email) {
            alert("Please provide the member's email address first to reset the password.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, formData.email);
            alert(`Password reset link sent to ${formData.email}. The member must check their email to complete the reset.`);
        } catch (error) {
            console.error("Error sending password reset email:", error);
            alert("Failed to send password reset email. Check if the email is correctly registered in Firebase Auth.");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        const { password, confirmPassword, ...dataToUpdate } = formData;
        let finalPayload: Partial<CommitteeMember> = dataToUpdate;

        try {
            const newPhotoURL = await handleImageUpload();
            finalPayload.photoURL = newPhotoURL;

            // If a new photo is uploaded or the photo is cleared
            if (member.photoURL) {
                if (newPhotoURL && newPhotoURL !== member.photoURL) {
                    await deleteOldPhoto(member.photoURL);
                } else if (!newPhotoURL && member.photoURL) {
                    await deleteOldPhoto(member.photoURL);
                }
            }

            // Update Firestore document
            const memberRef = doc(db, collectionPath, member.id);
            await updateDoc(memberRef, finalPayload);
            alert("Committee member updated successfully!");
            onClose();

        } catch (err: any) {
            console.error("Error updating committee member:", err);
            setError(err.message || "Failed to update member.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Edit Committee Member: {member.name}</h2>
                {error && (
                    <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Photo Upload Section */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Profile Photo</label>
                        <div className="mt-1 flex items-center space-x-4">
                            {imagePreviewUrl ? (
                                <div className="relative">
                                    <img src={imagePreviewUrl} alt="Preview" className="w-20 h-20 rounded-full object-cover border border-gray-300" />
                                    <button
                                        type="button"
                                        onClick={handleClearPhoto}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                                        aria-label="Clear photo"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">No Image</div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept="image/*"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                            >
                                {imagePreviewUrl ? "Change Photo" : "Upload Photo"}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
                        <select name="role" value={formData.role} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            <option value="">Select a role</option>
                            <option value="Committee Head">Committee Head</option>
                            <option value="Member">Member</option>
                            <option value="Secretary">Secretary</option>
                            <option value="Treasurer">Treasurer</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email (Required for Login) <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                        <input type="text" name="contactNo" value={formData.contactNo} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Term Duration</label>
                        <input type="text" name="termDuration" value={formData.termDuration} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>

                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold mb-2 flex justify-between items-center">
                            {hasAuthAccount ? "Account Status: Linked" : "No Login Account Linked"}
                            {hasAuthAccount && formData.email && (
                                <button
                                    type="button"
                                    onClick={handlePasswordReset}
                                    className="text-sm px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
                                >
                                    Reset Password
                                </button>
                            )}
                        </h3>
                        {!hasAuthAccount && (
                            <p className="text-sm text-gray-600">To create a login account, please input email and password. This feature might be better suited for adding new members only.</p>
                        )}
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


// *********** CommitteeContent ***********
const CommitteeContent: React.FC<CommitteeContentProps> = ({ committeeName, collectionPath }) => {
    const [members, setMembers] = useState<CommitteeMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [memberToEdit, setMemberToEdit] = useState<CommitteeMember | null>(null);
    const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

    useEffect(() => {
        if (!db || !collectionPath) return;

        const q = query(collection(db, collectionPath), orderBy("role", "desc"), orderBy("name"));

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
                        authUid: data.authUid || undefined,
                    } as CommitteeMember);
                });

                const sortedMembers = membersList.sort((a, b) => {
                    if (a.role === "Committee Head" && b.role !== "Committee Head") return -1;
                    if (a.role !== "Committee Head" && b.role === "Committee Head") return 1;
                    return a.name.localeCompare(b.name);
                });

                setMembers(sortedMembers);
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

    const formatCommitteeName = (name: string) =>
        name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    const handleDelete = async (member: CommitteeMember) => {
        if (window.confirm(`Are you sure you want to delete ${member.name} from the ${formatCommitteeName(committeeName)}? This cannot be undone.`)) {
            try {
                // --- TODO: Implement Firebase Auth User Deletion (Cloud Function Recommended) ---
                if (member.authUid) {
                    console.warn(`Attempting to delete Firebase Auth user with UID: ${member.authUid}.
                                 This should be done via a secure backend function for production.`);
                }
                // --- Delete photo from storage if member.photoURL exists (NOW FIXED) ---
                if (member.photoURL) {
                     await deleteOldPhoto(member.photoURL); // Calls the global helper
                }

                await deleteDoc(doc(db, collectionPath, member.id));
                alert(`${member.name} deleted successfully!`);
            } catch (error) {
                console.error("Error deleting member:", error);
                alert("Failed to delete member. Check console for details.");
            } finally {
                setOpenMenuIndex(null);
            }
        }
    };

    const handleEditMemberClick = (member: CommitteeMember) => {
        setMemberToEdit(member);
        setIsEditModalOpen(true);
        setOpenMenuIndex(null);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{formatCommitteeName(committeeName)} Members</h2>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-md"
                >
                    <Plus className="w-4 h-4 mr-1" /> Add Member
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    <p className="col-span-full p-4 text-gray-500">Loading members...</p>
                ) : members.length > 0 ? (
                    members.map((m, index) => (
                        <div key={m.id} className="bg-white shadow-lg rounded-xl overflow-hidden flex flex-col">
                            <div className="h-40 bg-gray-200 flex items-center justify-center">
                                {m.photoURL ? (
                                    <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-gray-600 font-medium">Profile Image</span>
                                )}
                            </div>
                            <div className={`p-4 relative flex-grow ${m.role === "Committee Head" ? 'bg-green-700 text-white' : 'bg-green-800 text-white'}`}>

                                {/* Dropdown Menu */}
                                <div className="absolute top-2 right-2">
                                    <button
                                        className="text-white hover:text-gray-300"
                                        onClick={(e) => { e.stopPropagation(); setOpenMenuIndex(openMenuIndex === index ? null : index); }}
                                    >
                                        <MoreVertical size={20} />
                                    </button>

                                    {openMenuIndex === index && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 text-gray-800">
                                            <button
                                                onClick={() => handleEditMemberClick(m)}
                                                className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100"
                                            >
                                                <Edit2 className="w-4 h-4 mr-2" /> Edit Member
                                            </button>
                                            <button
                                                onClick={() => handleDelete(m)}
                                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                            >
                                                <span className="w-4 h-4 mr-2">🗑️</span> Delete Member
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <p className="text-lg font-bold truncate">{m.name}</p>
                                <p className="font-semibold border-b border-green-500/50 pb-1 mb-2">{m.role}</p>
                                <p className="text-sm"><span className="font-medium">Contact:</span> {m.contactNo || 'N/A'}</p>
                                <p className="text-sm truncate"><span className="font-medium">Email:</span> {m.email || 'N/A'}</p>
                                <p className="text-sm"><span className="font-medium">Term:</span> {m.termDuration || 'N/A'}</p>
                                {m.authUid ? (
                                    <p className="text-xs font-semibold text-yellow-300 mt-1">✓ Login Account Linked</p>
                                ) : (
                                    <p className="text-xs font-semibold text-red-300 mt-1">✗ No Login Account</p>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="col-span-full p-4 text-gray-500">No members found for the {formatCommitteeName(committeeName)}. Click "Add Member" to add one.</p>
                )}
            </div>

            {isAddModalOpen && (
                <AddMemberModal
                    committeeName={committeeName}
                    collectionPath={collectionPath}
                    onClose={() => setIsAddModalOpen(false)}
                />
            )}
            {isEditModalOpen && memberToEdit && (
                <EditCommitteeMemberModal
                    member={memberToEdit}
                    onClose={() => { setIsEditModalOpen(false); setMemberToEdit(null); }}
                    collectionPath={collectionPath}
                />
            )}
        </div>
    );
};

// *********** HOABoardContent ***********
const HOABoardContent: React.FC<HOABoardContentProps> = ({ officials, handleEditClick, handleDeleteClick, handleAddNewOfficial, openMenuIndex, setOpenMenuIndex }) => {
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Elected HOA Board Officials</h2>
                <button
                    onClick={handleAddNewOfficial}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-md"
                >
                    <Plus className="w-4 h-4 mr-1" /> Add Board Member
                </button>
            </div>
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
                                        onClick={(e) => { e.stopPropagation(); setOpenMenuIndex(openMenuIndex === index ? null : index); }}
                                    >
                                        <MoreVertical />
                                    </button>

                                    {/* Menu Content */}
                                    {openMenuIndex === index && (
                                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 text-gray-800">
                                            <button
                                                onClick={() => handleEditClick(o)}
                                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                            >
                                                <Edit2 className="w-4 h-4 mr-2" /> Edit Official
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(o)}
                                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                            >
                                                <span className="w-4 h-4 mr-2">🗑️</span> Delete Official
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
                                {o.authUid ? (
                                    <p className="text-xs font-semibold text-yellow-300 mt-1">✓ Login Account Linked</p>
                                ) : (
                                    <p className="text-xs font-semibold text-red-300 mt-1">✗ No Login Account</p>
                                )}
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="p-4 text-gray-500">No elected officials found. Click "Add Board Member" to add one.</p>
                )}
            </div>
        </div>
    );
}

// *********** TabContent (Refactored with config map) ***********
const COMMITTEE_COLLECTIONS: Record<string, string> = {
     "Executive officers": "executive_officers", // BINAGO ITO
     "Committee officers": "committee_officers",
};

const TabContent: React.FC<TabContentProps> = (props) => {

    if (props.tab === "Board of Directors") {
        return <HOABoardContent {...props} />;
    }

    const collectionPath = COMMITTEE_COLLECTIONS[props.tab];

    if (!collectionPath) {
        return <p className="p-4 text-red-500">Invalid committee tab selected.</p>;
    }

    return <CommitteeContent committeeName={props.tab} collectionPath={collectionPath} />;
};


// --- MAIN COMPONENT ---
export default function OffHoa() {
    const [officials, setOfficials] = useState<Official[]>([]);
    const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
    const [officialToEdit, setOfficialToEdit] = useState<Official | null>(null);
    const [officialToAdd, setOfficialToAdd] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<TabKey>("Board of Directors");

    // --- Hook for HOA Boards of members ---
    useEffect(() => {
        if (!db) return;

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
                        authUid: data.authUid || undefined,
                    } as Official);
                });
                const sortedOfficials = officialsList.sort((a, b) => {
                    const roleOrder = ["President", "Vice President", "Secretary", "Treasurer"];
                    const aIndex = roleOrder.indexOf(a.position);
                    const bIndex = roleOrder.indexOf(b.position);

                    if (aIndex > -1 && bIndex > -1) return aIndex - bIndex;
                    if (aIndex > -1) return -1;
                    if (bIndex > -1) return 1;
                    return a.name.localeCompare(b.name);
                });
                setOfficials(sortedOfficials);
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
        setOfficialToAdd(false);
        setOpenMenuIndex(null);
    };

    const handleAddNewOfficial = () => {
        setOfficialToEdit(null);
        setOfficialToAdd(true);
        setOpenMenuIndex(null);
    };

    const handleDeleteClick = async (official: Official) => {
        if (window.confirm(`Are you sure you want to permanently delete the official: ${official.name} (${official.position})? This action cannot be undone.`)) {
            try {
                // --- TODO: Implement Firebase Auth User Deletion (Cloud Function Recommended) ---
                if (official.authUid) {
                    console.warn(`Attempting to delete Firebase Auth user with UID: ${official.authUid}.
                                 This should be done via a secure backend function for production.`);
                }
                // --- Delete photo from storage if official.photoURL exists (NOW FIXED) ---
                if (official.photoURL) {
                    await deleteOldPhoto(official.photoURL); // Calls the global helper
                }

                await deleteDoc(doc(db, "elected_officials", official.id));
                alert(`${official.name} deleted successfully!`);
            } catch (error) {
                console.error("Error deleting official:", error);
                alert("Failed to delete official. Check console for details.");
            }
        }
        setOpenMenuIndex(null);
    };

    const tabs: TabKey[] = ["Board of Directors", "Executive officers", "Committee officers"];

    return (
        <div className="bg-gray-50 min-h-screen">
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
                    handleDeleteClick={handleDeleteClick}
                    handleAddNewOfficial={handleAddNewOfficial}
                    openMenuIndex={openMenuIndex}
                    setOpenMenuIndex={setOpenMenuIndex}
                    committeeName={activeTab === "Board of Directors" ? "" : activeTab}
                    collectionPath={activeTab === "Board of Directors" ? "" : (COMMITTEE_COLLECTIONS[activeTab] || "")}
                />
            </div>

            {/* Modals for HOA Board Officials */}
            {(officialToEdit || officialToAdd) && (
                <EditOfficialModal
                    official={officialToEdit}
                    isAddingNew={officialToAdd}
                    onClose={() => {
                        setOfficialToEdit(null);
                        setOfficialToAdd(false);
                    }}
                />
            )}
        </div>
    );
}