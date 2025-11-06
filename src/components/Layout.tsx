import React, { useState, useEffect, useRef } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db, storage } from "../Firebase"; 
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- Import Icons (Using lucide-react as an example) ---
import {
    LayoutDashboard,
    Calendar,
    Users,
    Folder,
    ClipboardList, 
    Image,
    ClipboardCheck, 
    Archive,
    LogOut,
    ChevronDown, 
    ChevronRight, 
    DollarSign, 
    ArrowRightCircle, 
    Home,
    Upload,
    X,
    CheckCircle,
    AlertCircle,
} from "lucide-react";

// --- Utility Component for Menu Items ---
interface SidebarLinkProps {
    to: string;
    icon: React.ReactNode;
    label: string;
    badgeCount?: number; 
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, icon, label, badgeCount }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    
    const activeClass = isActive
        ? "bg-green-700 font-semibold" 
        : "hover:bg-green-800 text-gray-200 hover:text-white"; 

    return (
        <Link
            to={to}
            className={`flex items-center space-x-3 p-3 rounded-lg transition-colors justify-between ${activeClass}`} 
        >
            <div className="flex items-center space-x-3">
                {icon}
                <span className="text-sm">{label}</span>
            </div>
            
            {badgeCount !== undefined && badgeCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                    {badgeCount}
                </span>
            )}
        </Link>
    );
};

// Toast Notification Component
interface ToastProps {
    message: string;
    type: 'success' | 'error';
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);

        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center space-x-3 p-4 rounded-lg shadow-lg border-l-4 ${
            type === 'success' 
                ? 'bg-green-50 border-green-500 text-green-700' 
                : 'bg-red-50 border-red-500 text-red-700'
        }`}>
            {type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
            ) : (
                <AlertCircle className="w-5 h-5" />
            )}
            <span className="text-sm font-medium">{message}</span>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

const Layout = () => {
    const [isAccountingOpen, setIsAccountingOpen] = useState(false);
    const [newComplaintsCount, setNewComplaintsCount] = useState(0); 
    const [logoImage, setLogoImage] = useState<string | null>(null);
    const [showLogoModal, setShowLogoModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    
    const mainBg = "bg-mainColor"; 
    const headerColor = "bg-headerColor";
    const hoverColor = "hover:bg-green-800";

    // Check if user is admin
    useEffect(() => {
        const checkAdminStatus = async () => {
            const user = auth.currentUser;
            if (user) {
                try {
                    const adminDoc = await getDoc(doc(db, "admin", user.uid));
                    setIsAdmin(adminDoc.exists() && adminDoc.data()?.role === "Admin");
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    setIsAdmin(false);
                }
            }
        };

        checkAdminStatus();
    }, []);

    // Load logo from Firestore on component mount
    useEffect(() => {
        const loadLogo = async () => {
            try {
                const logoDoc = doc(db, "settings", "logo");
                const logoSnap = await getDoc(logoDoc);
                
                if (logoSnap.exists() && logoSnap.data().url) {
                    setLogoImage(logoSnap.data().url);
                }
            } catch (error) {
                console.error("Error loading logo:", error);
                // If permissions error, we'll just use the default logo
            }
        };

        loadLogo();
    }, []);

    // Complaints Count Logic
    useEffect(() => {
        const complaintsQuery = query(
            collection(db, "complaints"),
            where("status", "==", "new") 
        );

        const unsubscribe = onSnapshot(complaintsQuery, (querySnapshot) => {
            const count = querySnapshot.size;
            setNewComplaintsCount(count);
        }, (error) => {
            console.error("Error fetching new complaints count:", error);
        });

        return () => unsubscribe();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
    };

    const handleLogoClick = () => {
        if (!isAdmin) {
            showToast("Only administrators can change the logo.", "error");
            return;
        }
        setShowLogoModal(true);
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Check if file is an image
            if (!file.type.startsWith('image/')) {
                showToast("Please select an image file", "error");
                return;
            }

            // Check file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast("File size should be less than 5MB", "error");
                return;
            }

            uploadLogo(file);
        }
    };

    const uploadLogo = async (file: File) => {
        try {
            setUploading(true);
            
            // Create unique filename
            const fileExtension = file.name.split('.').pop();
            const fileName = `logo_${Date.now()}.${fileExtension}`;
            
            // Upload to Firebase Storage
            const storageRef = ref(storage, `logos/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Save URL to Firestore - use setDoc with merge to create if doesn't exist
            const logoDoc = doc(db, "settings", "logo");
            await setDoc(logoDoc, { 
                url: downloadURL,
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser?.uid
            }, { merge: true });

            // Update local state
            setLogoImage(downloadURL);
            setShowLogoModal(false);
            
            showToast("Logo updated successfully!", "success");
        } catch (error: any) {
            console.error("Error uploading logo:", error);
            
            if (error.code === 'storage/unauthorized') {
                showToast("Permission denied: You do not have access to upload files.", "error");
            } else if (error.code === 'permission-denied') {
                showToast("Database permission denied: You cannot modify logo settings.", "error");
            } else {
                showToast("Failed to upload logo. Please try again.", "error");
            }
        } finally {
            setUploading(false);
        }
    };

    const removeLogo = async () => {
        try {
            const logoDoc = doc(db, "settings", "logo");
            await setDoc(logoDoc, { 
                url: null,
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser?.uid
            }, { merge: true });
            
            setLogoImage(null);
            setShowLogoModal(false);
            showToast("Logo removed successfully!", "success");
        } catch (error: any) {
            console.error("Error removing logo:", error);
            
            if (error.code === 'permission-denied') {
                showToast("Permission denied: You cannot modify logo settings.", "error");
            } else {
                showToast("Failed to remove logo. Please try again.", "error");
            }
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate("/");
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    return (
        <div className="flex h-screen ">
            {/* Toast Notification */}
            {toast && (
                <Toast 
                    message={toast.message} 
                    type={toast.type} 
                    onClose={() => setToast(null)} 
                />
            )}

            {/* Logo Upload Modal */}
            {showLogoModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Change Logo</h3>
                            <button 
                                onClick={() => setShowLogoModal(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            {/* Admin Only Notice */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-sm text-blue-700 text-center">
                                    Administrator Function
                                </p>
                            </div>

                            {/* Current Logo Preview */}
                            <div className="text-center">
                                <p className="text-sm text-gray-600 mb-2">Current Logo:</p>
                                <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300">
                                    {logoImage ? (
                                        <img 
                                            src={logoImage} 
                                            alt="Current Logo" 
                                            className="w-16 h-16 rounded-full object-cover"
                                        />
                                    ) : (
                                        <Home className="w-8 h-8 text-gray-400" />
                                    )}
                                </div>
                            </div>

                            {/* Upload New Logo */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    accept="image/*"
                                    className="hidden"
                                />
                                
                                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-600 mb-2">
                                    Click to upload new logo
                                </p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                                >
                                    {uploading ? "Uploading..." : "Select Image"}
                                </button>
                                <p className="text-xs text-gray-500 mt-2">
                                    PNG, JPG, JPEG (Max 5MB)
                                </p>
                            </div>

                            {/* Remove Logo Option */}
                            {logoImage && (
                                <div className="text-center">
                                    <button
                                        onClick={removeLogo}
                                        className="text-red-600 text-sm hover:text-red-700 underline"
                                    >
                                        Remove Current Logo
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <div className={`w-64 ${mainBg} text-white flex flex-col h-full shadow-2xl`}>
                
                {/* --- 1. Logo Area - CLICKABLE LOGO --- */}
                <div 
                    className={`p-4 ${headerColor} flex items-center justify-center h-20 shadow-md ${isAdmin ? 'cursor-pointer group relative' : 'cursor-default'}`}
                    onClick={handleLogoClick}
                    title={isAdmin ? "Click to change logo" : "Logo"}
                >
                    <div className="flex items-center justify-center space-x-3">
                        {/* Logo Container - REMOVED bg-white and added transparent background */}
                        <div className={`w-12 h-12 bg-transparent rounded-full flex items-center justify-center shadow-lg ${isAdmin ? 'group-hover:shadow-xl transition-all duration-200 group-hover:scale-105' : ''}`}>
                            {logoImage ? (
                                <img 
                                    src={logoImage} 
                                    alt="SMUM HOA Logo" 
                                    className="w-12 h-12 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 bg-green-800 rounded-full flex items-center justify-center">
                                    <Home className="w-6 h-6 text-white font-bold" />
                                </div>
                            )}
                        </div>
                        
                        {/* Text Logo */}
                        <div className="flex flex-col">
                            <span className="text-xl font-extrabold tracking-wider text-white">
                                SMUM HOA
                            </span>
                            <span className="text-sm font-semibold tracking-widest text-green-200 -mt-1">
                                MANAGEMENT
                            </span>
                        </div>
                    </div>

                    {/* Edit Indicator (only shows on hover for admins) */}
                    {isAdmin && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <div className="bg-black bg-opacity-50 rounded-full p-1">
                                <Upload className="w-3 h-3 text-white" />
                            </div>
                        </div>
                    )}
                </div>

                {/* --- 2. Scrollable Menu Section --- */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    
                    {/* Dashboard */}
                    <SidebarLink 
                        to="/dashboard"
                        icon={<LayoutDashboard className="w-5 h-5" />}
                        label="Dashboard"
                    />

                    {/* Calendar */}
                    <SidebarLink 
                        to="/calendarEvent"
                        icon={<Calendar className="w-5 h-5" />}
                        label="Calendar"
                    />

                    {/* Accounting Dropdown */}
                    <div className="pt-2">
                        <button
                            onClick={() => setIsAccountingOpen(!isAccountingOpen)}
                            className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-colors ${hoverColor} ${isAccountingOpen ? "bg-green-700 font-semibold" : ""}`}
                        >
                            <div className="flex items-center space-x-3">
                                <DollarSign className="w-5 h-5" />
                                <span className="text-sm">Accounting</span>
                            </div>
                            {isAccountingOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        
                        {isAccountingOpen && (
                            <div className="ml-4 mt-1 space-y-1 border-l border-green-600 pl-3">
                                <SidebarLink 
                                    to="/accounting/contribution"
                                    icon={<ArrowRightCircle className="w-4 h-4 text-green-400" />}
                                    label="Contribution"
                                />
                                <SidebarLink 
                                    to="/accounting/expenses"
                                    icon={<ArrowRightCircle className="w-4 h-4 text-green-400" />}
                                    label="Expenses"
                                />
                            </div>
                        )}
                    </div>

                    <SidebarLink 
                        to="/accReg"
                        icon={<Users className="w-5 h-5" />}
                        label="Members"
                    />

                    <SidebarLink 
                        to="/folder"
                        icon={<Folder className="w-5 h-5" />}
                        label="Folders"
                    />
                    
                    <SidebarLink 
                        to="/complaints"
                        icon={<ClipboardList className="w-5 h-5" />}
                        label="Complaints"
                        badgeCount={newComplaintsCount} 
                    />

                    <SidebarLink 
                        to="/posting"
                        icon={<Image className="w-5 h-5" />}
                        label="Posting"
                    />
                    
                    <SidebarLink 
                        to="/officials"
                        icon={<ClipboardCheck className="w-5 h-5" />}
                        label="HOA Officials"
                    />
                    
                    <SidebarLink 
                        to="/election"
                        icon={<Archive className="w-5 h-5" />}
                        label="Election Module"
                    />
                </div>

                {/* --- 3. Logout Section --- */}
                <div className="p-4 border-t border-green-700">
                    <button
                        onClick={handleLogout}
                        className={`w-full text-left text-red-400 p-3 rounded-lg flex items-center space-x-3 transition-colors hover:bg-red-900/50`}
                    >
                        <LogOut className="w-5 h-5 text-red-300" />
                        <span className="text-sm font-medium">Log Out</span>
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 bg-gray-100 overflow-y-auto">
                <Outlet />
            </div>
        </div>
    );
};

export default Layout;