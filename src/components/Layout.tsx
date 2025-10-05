import React, { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../Firebase"; // Adjust the path based on your project structure

// --- Import Icons (Using lucide-react as an example) ---
import {
    LayoutDashboard,
    Calendar,
    ArrowDown, // For Accounting Dropdown
    ArrowRight, // For Accounting Dropdown
    Users,
    Folder,
    ClipboardList,
    Image,
    ClipboardCheck, // For HOA Officials
    Archive,
    LogOut,
    ChevronDown, // For Dropdown
    ChevronRight, // For Dropdown
    DollarSign, // For Accounting items
    UserPlus, // For Account Registration
    ArrowRightCircle, // Used as general Arrow placeholder
    Home, // Placeholder for general Dashboard icon
} from "lucide-react";


// --- Utility Component for Menu Items ---
// This ensures consistent styling for all links
interface SidebarLinkProps {
    to: string;
    icon: React.ReactNode;
    label: string;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, icon, label }) => {
    const location = useLocation();
    const isActive = location.pathname === to;
    
    // Figma/UI accurate styling
    const activeClass = isActive
        ? "bg-green-700 font-semibold" // Active background is slightly darker/solid green
        : "hover:bg-green-800 text-gray-200 hover:text-white"; // Hover state

    return (
        <Link
            to={to}
            className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${activeClass}`}
        >
            {icon}
            <span className="text-sm">{label}</span>
        </Link>
    );
};


const Layout = () => {
    const [isAccountingOpen, setIsAccountingOpen] = useState(false);
    const [isMembersOpen, setIsMembersOpen] = useState(false);
    const navigate = useNavigate();
    
    // Custom color variable (assuming mainColor is the deep green)
    const mainBg = "bg-mainColor"; 
    const headerColor = "bg-headerColor"; // Slightly lighter for the logo area
    const hoverColor = "hover:bg-hover";

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate("/"); // Redirect to login page after logout
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    return (
        <div className="flex h-screen">
            {/* Sidebar (Fixed Width w-64, Deep Green background) */}
            <div className={`w-64 ${mainBg} text-white flex flex-col h-full shadow-2xl`}>
                
                {/* --- 1. Logo/Title Area (Matching Figma's green header) --- */}
                <div className={`p-4 ${headerColor} flex items-center justify-center h-20 shadow-md`}>
                    {/* Placeholder for your HOA Logo/Image */}
                    <div className="w-8 h-8 mr-2 bg-white rounded-full flex items-center justify-center">
                        <Home className="w-5 h-5 text-green-900"/>
                    </div>
                    <div className="text-lg font-extrabold tracking-wide">
                        HOA Panel
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

                    {/* --- Accounting Dropdown --- */}
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
                                {/* Contribution */}
                                <SidebarLink 
                                    to="/accounting/contribution"
                                    icon={<ArrowRightCircle className="w-4 h-4 text-green-400" />}
                                    label="Contribution"
                                />
                                {/* Expenses */}
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
                        icon={<ClipboardList className="w-5 h-5" />}
                        label="Members"
                    />

                    {/* --- Static Links (Simplified for consistency) --- */}
                    
                    {/* Folders */}
                    <SidebarLink 
                        to="/folder"
                        icon={<Folder className="w-5 h-5" />}
                        label="Folders"
                    />
                    
                    {/* Complaints */}
                    <SidebarLink 
                        to="/complaints"
                        icon={<ClipboardList className="w-5 h-5" />}
                        label="Complaints"
                    />

                    {/* Posting */}
                    <SidebarLink 
                        to="/posting"
                        icon={<Image className="w-5 h-5" />}
                        label="Posting"
                    />
                    
                    {/* HOA Officials (Matching the active page in your screenshot) */}
                    <SidebarLink 
                        to="/officials"
                        icon={<ClipboardCheck className="w-5 h-5" />}
                        label="HOA Officials"
                    />
                    
                    {/* Election Module */}
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