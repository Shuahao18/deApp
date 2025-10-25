import React, { useState, useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../Firebase"; 
import { collection, query, where, onSnapshot } from "firebase/firestore";

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

const Layout = () => {
    const [isAccountingOpen, setIsAccountingOpen] = useState(false);
    const [newComplaintsCount, setNewComplaintsCount] = useState(0); 
    const navigate = useNavigate();
    
    const mainBg = "bg-mainColor"; 
    const headerColor = "bg-headerColor";
    const hoverColor = "hover:bg-green-800";

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
            {/* Sidebar */}
            <div className={`w-64 ${mainBg} text-white flex flex-col h-full shadow-2xl`}>
                
                {/* --- 1. Logo Area - SIMPLE TEXT LOGO MUNNA --- */}
                <div className={`p-4 ${headerColor} flex items-center justify-center h-20 shadow-md`}>
                    <div className="flex items-center justify-center space-x-3">
                        {/* Icon Container */}
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                            <Home className="w-6 h-6 text-green-900 font-bold" />
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