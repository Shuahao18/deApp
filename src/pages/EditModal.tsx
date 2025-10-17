import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; 

// Import Firebase services at Storage functions
import { db, auth, storage } from "../Firebase"; 
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore'; 
import { updatePassword, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Define ang structure ng Official Data
interface OfficialProfileData {
    username: string;
    address: string;
    email: string;
    contact: string;
    dateOBirth: string; 
    civilStatus: string;
    pin: string;
    photoURL: string | null;
    role: string; // Idinagdag para sa role (President, Vice President, etc.)
}

const defaultProfile: OfficialProfileData = {
    username: '',
    address: '',
    email: '',
    contact: '',
    dateOBirth: '',
    civilStatus: '',
    pin: '********', 
    photoURL: null,
    role: '',
};

const OfficialProfile: React.FC = () => {
    const navigate = useNavigate(); 
    
    const [profile, setProfile] = useState<OfficialProfileData>(defaultProfile);
    const [originalProfile, setOriginalProfile] = useState<OfficialProfileData>(defaultProfile); 
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false); 
    const [userType, setUserType] = useState<'admin' | 'official'>('admin'); // Para malaman kung admin o official

    const fileInputRef = useRef<HTMLInputElement>(null); 
    const userId = auth.currentUser?.uid;

    // --- Data Fetching (useEffect) ---
    useEffect(() => {
        if (!userId) {
            setError("User is not logged in.");
            setIsLoading(false);
            return;
        }

        const fetchProfile = async () => {
            try {
                // Unang subukan kunin ang data bilang Admin
                const adminRef = doc(db, 'admin', userId);
                const adminDoc = await getDoc(adminRef);

                if (adminDoc.exists()) {
                    const data = adminDoc.data() as { 
                        firstname: string; 
                        surname: string; 
                        address: string;
                        email: string;
                        contact: string;
                        dob: string; 
                        civilStatus: string;
                        photoURL?: string | null;
                    };
                    
                    const newProfile: OfficialProfileData = {
                        username: `${data.firstname || ''} ${data.surname || ''}`.trim(),
                        address: data.address || '',
                        email: data.email || '',
                        contact: data.contact || '',
                        dateOBirth: data.dob || '', 
                        civilStatus: data.civilStatus || '',
                        pin: '********', 
                        photoURL: data.photoURL || null,
                        role: 'Admin',
                    };

                    setProfile(newProfile);
                    setOriginalProfile(newProfile);
                    setUserType('admin');
                } else {
                    // Kung hindi admin, hanapin sa elected_officials
                    const officialsQuery = query(
                        collection(db, "elected_officials"),
                        where("authUid", "==", userId)
                    );
                    const officialsSnapshot = await getDocs(officialsQuery);

                    if (!officialsSnapshot.empty) {
                        const officialData = officialsSnapshot.docs[0].data();
                        const newProfile: OfficialProfileData = {
                            username: officialData.name || '',
                            address: officialData.address || '',
                            email: officialData.email || '',
                            contact: officialData.contactNo || '',
                            dateOBirth: officialData.dateOfBirth || '',
                            civilStatus: officialData.civilStatus || '',
                            pin: '********',
                            photoURL: officialData.photoURL || null,
                            role: officialData.role || 'Official',
                        };

                        setProfile(newProfile);
                        setOriginalProfile(newProfile);
                        setUserType('official');
                    } else {
                        setError("User profile not found in admin or elected officials.");
                    }
                }
            } catch (err) {
                console.error("Error fetching profile:", err);
                setError("Failed to load profile data.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [userId]);

    // --- Handlers ---

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!userId) {
            setError("User not logged in.");
            return;
        }

        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File size must be 2MB or less.");
            return;
        }

        setIsSaving(true);
        setError(null);
        
        try {
            const storageRef = ref(storage, `${userType}_photos/${userId}/${file.name}`);
            const uploadResult = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(uploadResult.ref);
            
            // I-update ang tamang collection base sa user type
            if (userType === 'admin') {
                const adminRef = doc(db, 'admin', userId);
                await updateDoc(adminRef, { photoURL: url });
            } else {
                const officialsQuery = query(
                    collection(db, "elected_officials"),
                    where("authUid", "==", userId)
                );
                const officialsSnapshot = await getDocs(officialsQuery);
                
                if (!officialsSnapshot.empty) {
                    const officialDoc = officialsSnapshot.docs[0];
                    const officialRef = doc(db, 'elected_officials', officialDoc.id);
                    await updateDoc(officialRef, { photoURL: url });
                }
            }

            const updatedProfile = { ...profile, photoURL: url };
            setProfile(updatedProfile);
            setOriginalProfile(updatedProfile);
            setIsDirty(false);

            alert('Profile picture successfully updated!');

        } catch (err) {
            console.error("Photo upload failed:", err);
            setError("Failed to upload photo. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        
        const updatedProfile = { ...profile, [id]: value };
        setProfile(updatedProfile);
        
        const hasChanges = (
            updatedProfile.username !== originalProfile.username ||
            updatedProfile.address !== originalProfile.address ||
            updatedProfile.contact !== originalProfile.contact ||
            updatedProfile.dateOBirth !== originalProfile.dateOBirth ||
            updatedProfile.civilStatus !== originalProfile.civilStatus
        );

        setIsDirty(hasChanges);
        setError(null);
    };

    const handleSave = async () => {
        if (!userId || isSaving || !isDirty) return;

        setIsSaving(true);
        setError(null);

        try {
            if (userType === 'admin') {
                // Admin update logic
                const nameParts = profile.username.trim().split(/\s+/);
                if (nameParts.length === 0) {
                    setError("Full Name cannot be empty.");
                    setIsSaving(false);
                    return;
                }

                const firstNameUpdate = nameParts[0];
                const surNameUpdate = nameParts.slice(1).join(' ');

                const fieldsToUpdate = {
                    firstname: firstNameUpdate,
                    surname: surNameUpdate,
                    address: profile.address,
                    contact: profile.contact, 
                    dob: profile.dateOBirth, 
                    civilStatus: profile.civilStatus,
                };

                const adminRef = doc(db, 'admin', userId);
                await updateDoc(adminRef, fieldsToUpdate);
                
            } else {
                // Official update logic
                const officialsQuery = query(
                    collection(db, "elected_officials"),
                    where("authUid", "==", userId)
                );
                const officialsSnapshot = await getDocs(officialsQuery);
                
                if (!officialsSnapshot.empty) {
                    const officialDoc = officialsSnapshot.docs[0];
                    const officialRef = doc(db, 'elected_officials', officialDoc.id);
                    
                    const fieldsToUpdate = {
                        name: profile.username,
                        address: profile.address,
                        contactNo: profile.contact,
                        dateOfBirth: profile.dateOBirth,
                        civilStatus: profile.civilStatus,
                    };

                    await updateDoc(officialRef, fieldsToUpdate);
                } else {
                    throw new Error("Official profile not found.");
                }
            }

            alert('Profile saved successfully!');
            const updatedOriginal = { ...profile };
            setOriginalProfile(updatedOriginal);
            setProfile(updatedOriginal);
            setIsDirty(false);

        } catch (err) {
            console.error("Error saving profile:", err);
            setError("Failed to save profile. Check network and permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setProfile(originalProfile);
        setIsDirty(false);
        setError(null);
    };

    // --- Render Loading/Error State ---
    if (isLoading) {
        return <div className="p-8 text-center text-gray-600">Loading profile...</div>;
    }

    if (error && !userId) {
        return <div className="p-8 text-center text-red-600 font-bold">{error}</div>;
    }

    // --- JSX ---
    return (
        <div className="p-6 md:p-10 max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
            <header className="flex items-center justify-between border-b pb-4 mb-6">
                <button 
                    onClick={() => navigate('/dashboard')} 
                    className="text-gray-600 hover:text-gray-900 transition duration-150 flex items-center"
                >
                    <ChevronLeft size={24} className="mr-2" />
                    <span className="text-xl font-semibold">Back to Dashboard</span>
                </button>
                <h1 className="text-2xl font-bold text-gray-800">
                    {userType === 'admin' ? 'Admin Profile' : 'Official Profile'}
                </h1>
                
                {/* REMOVED: Logout Button */}
            </header>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Left Panel (Profile Picture and Static Info) */}
                <div className="flex flex-col items-center p-6 bg-gray-50 rounded-lg md:w-1/3">
                    
                    {/* Profile Image/Uploader */}
                    <div className="relative w-28 h-28 mb-4">
                        <div className="w-full h-full bg-blue-200 rounded-full flex items-center justify-center border-4 border-blue-500 overflow-hidden">
                            {profile.photoURL ? (
                                <img 
                                    src={profile.photoURL} 
                                    alt="Profile" 
                                    className="w-full h-full object-cover" 
                                />
                            ) : (
                                <div className="text-4xl font-bold text-blue-800">
                                    {profile.username ? profile.username[0].toUpperCase() : 'U'}
                                </div>
                            )}
                        </div>
                        
                        <button 
                            type="button" 
                            onClick={triggerFileInput} 
                            disabled={isSaving}
                            className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded-full text-white shadow-md hover:bg-blue-700 transition"
                        >
                            {isSaving ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <Camera size={16} />
                            )}
                        </button>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handlePhotoChange}
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={isSaving}
                    />

                    <h2 className="text-xl font-bold text-gray-800">{profile.username}</h2>
                    <p className="text-sm text-blue-600">{profile.role}</p>
                    <p className="text-xs text-gray-500 mt-1">ID: {userId ? userId.substring(0, 8) : 'N/A'}</p>
                    
                    {/* REMOVED: Change Password Button */}
                </div>

                {/* Right Panel (Form Fields) */}
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="md:w-2/3 space-y-4">
                    
                    {/* Row 1: Full Name */}
                    <div className="w-full">
                        <label htmlFor="username" className="text-sm font-medium text-gray-700">Full Name</label>
                        <input
                            id="username"
                            type="text"
                            value={profile.username}
                            onChange={handleChange} 
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Ex: Juan Dela Cruz"
                        />
                    </div>
                    
                    {/* Row 2: Address */}
                    <div className="w-full">
                        <label htmlFor="address" className="text-sm font-medium text-gray-700">Address</label>
                        <input
                            id="address"
                            type="text"
                            value={profile.address}
                            onChange={handleChange}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    
                    {/* Row 3: Email (Read-only) */}
                    <div className="w-full">
                        <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={profile.email}
                            readOnly 
                            className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 focus:outline-none"
                        />
                    </div>

                    {/* Row 4: Contact Number */}
                    <div className="w-full">
                        <label htmlFor="contact" className="text-sm font-medium text-gray-700">Contact Number</label>
                        <input
                            id="contact" 
                            type="text"
                            value={profile.contact}
                            onChange={handleChange}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Row 5: Date of Birth & Civil Status */}
                    <div className="flex gap-4">
                        <div className="w-1/2">
                            <label htmlFor="dateOBirth" className="text-sm font-medium text-gray-700">Date of Birth</label>
                            <input
                                id="dateOBirth" 
                                type="date" 
                                value={profile.dateOBirth}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div className="w-1/2">
                            <label htmlFor="civilStatus" className="text-sm font-medium text-gray-700">Civil Status</label>
                            <input
                                id="civilStatus"
                                type="text"
                                value={profile.civilStatus}
                                onChange={handleChange}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* Row 6: PIN/Password (Read-only) */}
                    <div className="w-full">
                        <label htmlFor="pin" className="text-sm font-medium text-gray-700">PIN/Password</label>
                        <input
                            id="pin"
                            type="password"
                            value={profile.pin}
                            readOnly 
                            className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 focus:outline-none"
                        />
                    </div>

                    {/* Error Message */}
                    {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

                    {/* Action Buttons */}
                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={!isDirty || isSaving} 
                            className={`mr-3 px-6 py-2 border rounded-lg text-gray-700 transition duration-150 ${
                                isDirty && !isSaving ? 'border-gray-300 hover:bg-gray-50' : 'border-gray-200 bg-gray-100 cursor-not-allowed text-gray-500'
                            }`}
                        >
                            <span className="font-semibold">Cancel</span>
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !isDirty}
                            className={`px-6 py-2 rounded-lg text-white font-semibold transition duration-150 ${
                                isSaving || !isDirty 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OfficialProfile;