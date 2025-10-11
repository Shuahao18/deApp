import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
// Import Firebase services
import { db, auth } from "../Firebase"; 
import { doc, getDoc, updateDoc } from 'firebase/firestore'; 
import { updatePassword, signOut } from 'firebase/auth'; // Idinagdag ang updatePassword at signOut

// Define ang structure ng Admin Data para sa Type Safety
interface AdminProfileData {
    username: string; // Gagamitin ito para sa Full Name (firstname + surname)
    address: string;
    email: string;
    contact: string;
    dateOBirth: string; 
    civilStatus: string;
    pin: string; 
}

const defaultProfile: AdminProfileData = {
    username: '',
    address: '',
    email: '',
    contact: '',
    dateOBirth: '',
    civilStatus: '',
    pin: '********', 
};

const AdminProfile: React.FC = () => {
    const [profile, setProfile] = useState<AdminProfileData>(defaultProfile);
    const [originalProfile, setOriginalProfile] = useState<AdminProfileData>(defaultProfile); // Para sa tumpak na check ng isDirty
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false); 

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
                const adminRef = doc(db, 'admin', userId);
                const docSnap = await getDoc(adminRef);

                if (docSnap.exists()) {
                    const data = docSnap.data() as { 
                        firstname: string; 
                        surname: string; 
                        address: string;
                        email: string;
                        contact: string;
                        dob: string; 
                        civilStatus: string;
                    };
                    
                    const newProfile: AdminProfileData = {
                        username: `${data.firstname || ''} ${data.surname || ''}`.trim(),
                        address: data.address || '',
                        email: data.email || '',
                        contact: data.contact || '',
                        dateOBirth: data.dob || '', 
                        civilStatus: data.civilStatus || '',
                        pin: '********', 
                    };

                    setProfile(newProfile);
                    setOriginalProfile(newProfile); // I-set ang original data
                } else {
                    setError("Admin profile data not found.");
                }
            } catch (err) {
                console.error("Error fetching admin profile:", err);
                setError("Failed to load profile data.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [userId]);


     const handleChangePassword = async () => {
        const user = auth.currentUser;
        if (!user) {
            setError("User is not logged in. Please log in again.");
            return;
        }

        const newPassword = prompt("Please enter the NEW password (minimum 6 characters):");
        
        if (!newPassword) return; // Kinansela ang prompt o walang in-input

        if (newPassword.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        try {
            // Gumamit ng Firebase Auth function
            await updatePassword(user, newPassword);
            
            // I-mask ang PIN sa UI pagkatapos mag-update
            setProfile(prev => ({ ...prev, pin: '********' })); 
            
            alert("Password successfully updated! For security purposes, you may need to log in again soon.");
            setError(null);

        } catch (authError: any) {
            console.error("Password update error:", authError);
            
            // Ang 'auth/requires-recent-login' ang pinakakaraniwang error
            if (authError.code === 'auth/requires-recent-login') {
                setError("Failed to update password. Please **log out and log in again immediately** to re-authenticate, then try changing your password.");
            } else {
                setError(`Password update failed: ${authError.message}`);
            }
        }
    };


    // --- Handlers ---
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        
        const updatedProfile = { ...profile, [id]: value };
        setProfile(updatedProfile);
        
        // I-check kung may pagkakaiba sa original data
        const hasChanges = (
            updatedProfile.username !== originalProfile.username ||
            updatedProfile.address !== originalProfile.address ||
            updatedProfile.contact !== originalProfile.contact ||
            updatedProfile.dateOBirth !== originalProfile.dateOBirth ||
            updatedProfile.civilStatus !== originalProfile.civilStatus
            // Ang 'email' at 'pin' ay read-only, kaya hindi na kailangan i-check.
        );

        setIsDirty(hasChanges);
        setError(null);
    };

    const handleSave = async () => {
        if (!userId || isSaving || !isDirty) return;

        setIsSaving(true);
        setError(null);
        
        // **LOGIC PARA HATIIN ANG FULL NAME:**
        const nameParts = profile.username.trim().split(/\s+/);
        if (nameParts.length === 0) {
             setError("Full Name cannot be empty.");
             setIsSaving(false);
             return;
        }

        const firstNameUpdate = nameParts[0];
        // Ang lahat ng kasunod na salita ay gagamitin para sa surname.
        const surNameUpdate = nameParts.slice(1).join(' ');

        // Ang Field Mapping: Tiyakin na ang keys dito ay TAMA sa Firestore!
        const fieldsToUpdate = {
            firstname: firstNameUpdate, // I-save ang first part bilang firstname
            surname: surNameUpdate,     // I-save ang natira bilang surname
            address: profile.address,
            contact: profile.contact, 
            dob: profile.dateOBirth,  
            civilStatus: profile.civilStatus,
        };

        try {
            const adminRef = doc(db, 'admin', userId);
            
            await updateDoc(adminRef, fieldsToUpdate);
            
            alert('Profile saved successfully!');
            
            // I-update ang originalProfile para ma-reset ang isDirty state
            setOriginalProfile(profile);
            setIsDirty(false);

        } catch (err) {
            console.error("Error saving profile:", err);
            setError("Failed to save profile. Check network and permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // I-reset ang profile state pabalik sa original value
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

    // --- JSX (Accurate Design) ---
    return (
        <div className="p-6 md:p-10 max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
            <header className="flex items-center justify-between border-b pb-4 mb-6">
                <button onClick={() => window.history.back()} className="text-gray-600 hover:text-gray-900 transition duration-150 flex items-center">
                    <ChevronLeft size={24} className="mr-2" />
                    <span className="text-xl font-semibold">Back</span>
                </button>
                <h1 className="text-2xl font-bold text-gray-800">Admin Profile</h1>
                <div className="w-16"></div> 
            </header>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Left Panel (Profile Picture and Static Info) */}
                <div className="flex flex-col items-center p-6 bg-gray-50 rounded-lg md:w-1/3">
                    {/* Placeholder for Profile Image */}
                    <div className="w-24 h-24 bg-blue-200 rounded-full flex items-center justify-center mb-4 border-4 border-blue-500 overflow-hidden">
                        <div className="text-3xl font-bold text-blue-800">A</div>
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">{profile.username}</h2>
                    <p className="text-sm text-blue-600">Admin ID: {userId ? userId.substring(0, 8) : 'N/A'}</p>
                </div>

                {/* Right Panel (Form Fields) */}
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="md:w-2/3 space-y-4">
                    {/* Row 1: Full Name (Username) - Ngayon, Editable na */}
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

                    {/* Row 4: Contact Number - Inayos ang ID */}
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

                    {/* Row 5: Date of Birth & Civil Status (Two-Column Layout) */}
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
                            // I-disable ang cancel kung walang pagbabago para maging tumpak ang UI
                            disabled={!isDirty} 
                            className={`mr-3 px-6 py-2 border rounded-lg text-gray-700 transition duration-150 ${
                                isDirty ? 'border-gray-300 hover:bg-gray-50' : 'border-gray-200 bg-gray-100 cursor-not-allowed text-gray-500'
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

export default AdminProfile;