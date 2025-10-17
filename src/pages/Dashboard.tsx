import React, { useEffect, useState, useCallback, useMemo } from "react";
// ⭐️ IMPORTANTE: I-import ang useNavigate mula sa React Router
import { useNavigate } from 'react-router-dom'; 

import { collection, getDocs, query, where, Timestamp,
} from "firebase/firestore";
// Assume this path is correct for your Firebase initialization
import { db } from "../Firebase"; 

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,} from "recharts";
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline'; 

// --- TYPE DEFINITIONS (UPDATED) ---
interface EventType {
    id?: string;
    title: string;
    start: Date;
    // Ginawang optional ang 'end' dahil ito ang nag-cause ng 'undefined (reading 'seconds')' error
    end?: Date; 
    description?: string;
}

// -------------------------------------------------------------------
// --- HELPER FUNCTIONS ---
// -------------------------------------------------------------------

const generateYearOptions = (startYear: number, endYear: number) => {
    const years = [];
    for (let year = endYear; year >= startYear; year--) {
        years.push(year);
    }
    return years;
};

// -------------------------------------------------------------------
// --- SUB-COMPONENTS (Dashboard elements) ---
// -------------------------------------------------------------------

function MemberStatBlock({
    current, 
    active,
    inactive,
    newMembers,
}: {
    current: number;
    active: number;
    inactive: number;
    newMembers: number;
    rawTotal: number;
}) {
    const MemberInnerBox = ({ label, value }: { label: string; value: number }) => (
        <div className="flex flex-col items-center justify-center p-3 sm:p-4 w-1/4">
            <h3 className="text-sm font-medium text-gray-500 whitespace-nowrap">
                {label}
            </h3>
            <p className="text-xl sm:text-2xl mt-1 text-gray-800 font-bold">
                {value.toLocaleString()}
            </p>
        </div>
    );

    return (
        <div className="flex bg-white rounded shadow-md border-b-4 border-gray-300 divide-x divide-gray-200 flex-wrap sm:flex-nowrap min-w-[300px] flex-1">
            <MemberInnerBox label="Total members" value={current} /> 
            <MemberInnerBox label="Active" value={active} />
            <MemberInnerBox label="Inactive" value={inactive} />
            <MemberInnerBox label="New members" value={newMembers} />
        </div>
    );
}

function StatBox({ label, value, type }: { label: string; value: string | number; type: "balance" }) {
    const valueColor = "text-gray-800"; 
    const borderColor = "border-gray-300"; 

    return (
        <div className={`flex-1 min-w-[250px] bg-white p-3 border-b-4 ${borderColor} rounded shadow-sm text-center`}>
            <h2 className="text-sm font-medium text-gray-500">{label}</h2>
            <p className={`text-2xl mt-1 ${valueColor} font-bold`}>
                {value}
            </p>
        </div>
    );
}

function FinancialOverview({ 
    data, 
    selectedYear,
    setSelectedYear,
    yearOptions 
}: { 
    data: any[], 
    selectedYear: number,
    setSelectedYear: React.Dispatch<React.SetStateAction<number>>,
    yearOptions: number[]
}) {
    return (
        <div className="bg-white p-6 rounded shadow-md w-full">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                    Financial Overview ({selectedYear} Collections & Expenses)
                </h2>
                <div className="flex items-center gap-2">
                    <label htmlFor="year-select" className="text-sm text-gray-600">Year:</label>
                    <select
                        id="year-select"
                        className="text-gray-700 bg-white border border-gray-300 rounded-md py-1 px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#007963] text-sm font-semibold"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
            </div>
            {data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        <YAxis 
                            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`} 
                            tickLine={false} 
                            axisLine={false}
                            domain={[0, 20000]} 
                            tickCount={5} 
                        />
                        <Tooltip formatter={(value: any) => [`₱${value.toLocaleString()}`, "Amount"]} />
                        <Legend wrapperStyle={{ paddingTop: 20 }} verticalAlign="bottom" align="center" />
                        <Line type="monotone" dataKey="Collections" stroke="#007963" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Expenses" stroke="#B71C1C" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <p className="text-gray-500 text-center py-10">
                    No financial data available for {selectedYear}.
                </p>
            )}
        </div>
    );
}

// ⭐️ UPDATED: Nagdagdag ng 'onViewMoreClick' prop
function InfoCard({ title, children, footer, footerContent, onViewMoreClick }: { 
    title: string; 
    children: React.ReactNode; 
    footer?: string; 
    footerContent?: React.ReactNode;
    onViewMoreClick?: () => void; // New prop
}) {
    const isViewMore = footer === "View More";
    
    let actualFooterContent;
    if (footerContent) {
        actualFooterContent = footerContent; 
    } else if (isViewMore) {
        // ⭐️ UPDATED: Inilipat ang onClick handler dito
        actualFooterContent = (
            <button 
                className="text-sm font-semibold text-[#007963] hover:text-[#005a4a]"
                onClick={onViewMoreClick} // Use the passed handler
            >
                View More
            </button>
        );
    } else {
        actualFooterContent = (
            <span className="text-sm font-semibold text-gray-500">{footer}</span>
        );
    }

    return (
        <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[250px]">
            <div className="p-4 bg-[#1e4643] rounded-t border-b border-gray-600"> 
                <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>
            <div className="flex-1 px-4 py-2">{children}</div>
            <div className={`p-3 border-t border-gray-100 ${footerContent ? 'bg-white' : (isViewMore ? 'bg-gray-50' : 'bg-white')} flex justify-center items-center`}>
                {actualFooterContent}
            </div>
        </div>
    );
}

// ⭐️ UPDATED: Nagdagdag ng 'onViewMoreClick' prop
function FullyPaidMembersCard({ onViewMoreClick }: { onViewMoreClick: () => void }) {
    const today = new Date();
    const currentMonthLabel = today.toLocaleString("default", { month: "long" });
    const currentYear = today.getFullYear().toString();
    
    const MONTH_OPTIONS = useMemo(() => {
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        return months.map(month => ({
            label: month.substring(0, 3).toUpperCase(),
            value: `${month} ${currentYear}`
        }));
    }, [currentYear]);
    
    const [currentMonthValue, setCurrentMonthValue] = useState(MONTH_OPTIONS.find(opt => opt.value.includes(currentMonthLabel))?.value || `${currentMonthLabel} ${currentYear}`); 
    const [fullyPaidMembers, setFullyPaidMembers] = useState(0); 
    const [isLoading, setIsLoading] = useState(true);

    const fetchFullyPaidMembers = useCallback(async (monthYear: string) => {
        setIsLoading(true);
        try {
            const contributionsQuery = query(
                collection(db, "contributions"),
                where("monthYear", "==", monthYear) 
            );
            
            const querySnapshot = await getDocs(contributionsQuery);
            
            const uniqueRecipients = new Set<string>();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.recipient && (Number(data.amount) > 0)) { 
                    uniqueRecipients.add(data.recipient as string);
                }
            });
            
            setFullyPaidMembers(uniqueRecipients.size);

        } catch (error) {
            console.error(`Error fetching paid members for ${monthYear}:`, error);
            setFullyPaidMembers(0); 
        } finally {
            setIsLoading(false);
        }
    }, [currentYear]); 

    useEffect(() => {
        fetchFullyPaidMembers(currentMonthValue);
    }, [currentMonthValue, fetchFullyPaidMembers]);
    
    const getShortMonthLabel = (value: string) => {
        return MONTH_OPTIONS.find(opt => opt.value === value)?.label || 'N/A';
    };

    const FooterContent = (
        <div className="flex justify-between items-center px-2 w-full text-sm font-semibold">
            <div className="flex items-center gap-1 text-gray-500">
                Month: 
                <select 
                    className="text-gray-700 bg-white border border-gray-300 rounded-md py-1 px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#007963]"
                    value={currentMonthValue}
                    onChange={(e) => setCurrentMonthValue(e.target.value)}
                >
                    {MONTH_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
            {/* ⭐️ UPDATED: Inilipat ang onClick handler dito */}
            <button 
                className="text-[#007963] hover:text-[#005a4a]"
                onClick={onViewMoreClick} // Use the passed handler
            >
                View More
            </button> 
        </div>
    );

    return (
        <InfoCard 
            title="Fully Paid Members" 
            footerContent={FooterContent} 
        >
            <div className="text-center my-6 h-40 flex flex-col justify-center">
                {isLoading ? (
                    <div className="text-3xl text-gray-500 font-semibold">Loading...</div>
                ) : (
                    <div className="text-5xl font-bold text-[#007963] mb-2">{fullyPaidMembers}</div>
                )}
                <p className="text-sm text-gray-500">
                    members paid for {getShortMonthLabel(currentMonthValue)}
                </p>
            </div>
        </InfoCard>
    );
}

// -------------------------------------------------------------------
// --- MAIN DASHBOARD COMPONENT (CORE CONTENT) ---
// -------------------------------------------------------------------

// ⭐️ UPDATED: Nagdagdag ng props para sa navigation
interface DashboardProps {
    adminUsername: string;
    onViewComplaintsClick: () => void;
    onViewContributionsClick: () => void;
    onViewEventsClick: () => void;
}

function Dashboard({ 
    adminUsername, 
    onViewComplaintsClick, 
    onViewContributionsClick, 
    onViewEventsClick
}: DashboardProps) {
    const today = new Date();
    const currentYear = today.getFullYear(); 
    const [selectedYear, setSelectedYear] = useState(currentYear); 
    const YEAR_OPTIONS = useMemo(() => generateYearOptions(2020, currentYear), [currentYear]); 
    
    const [currentTime, setCurrentTime] = useState(new Date()); 
    
    const [events, setEvents] = useState<EventType[]>([]);
    const [rawTotalMembers, setRawTotalMembers] = useState(0); 
    const [currentMembersCount, setCurrentMembersCount] = useState(0); 
    const [activeMembers, setActiveMembers] = useState(0); 
    const [inactiveMembers, setInactiveMembers] = useState(0); 
    const [newMembers, setNewMembers] = useState(0); 
    
    const [hoaBalance, setHoaBalance] = useState<number | null>(null); 
    
    const [financialData, setFinancialData] = useState<any[]>([]);
    const [newComplaints, setNewComplaints] = useState(0); 
    const [totalComplaints, setTotalComplaints] = useState(0); 
    
    // --- Data Fetching Callbacks ---
    const calculateHOABalance = useCallback(async () => { 
        const startOfYear = Timestamp.fromDate(new Date(selectedYear, 0, 1));
        const endOfYear = Timestamp.fromDate(new Date(selectedYear + 1, 0, 1)); 

        try {
            const contributionsQuery = query(collection(db, "contributions"), where("transactionDate", ">=", startOfYear), where("transactionDate", "<", endOfYear));
            const contributionsSnapshot = await getDocs(contributionsQuery);
            let totalCollections = 0;
            contributionsSnapshot.forEach((doc) => { totalCollections += Number(doc.data().amount) || 0; });

            const expensesQuery = query(collection(db, "expenses"), where("transactionDate", ">=", startOfYear), where("transactionDate", "<", endOfYear));
            const expensesSnapshot = await getDocs(expensesQuery);
            let totalExpenses = 0;
            expensesSnapshot.forEach((doc) => { totalExpenses += Number(doc.data().amount) || 0; });

            setHoaBalance(totalCollections - totalExpenses);
        } catch (error) {
            console.error(`Error calculating Net Balance for ${selectedYear}:`, error);
            setHoaBalance(null); 
        }
    }, [selectedYear]); 

    const fetchComplaintsData = useCallback(async () => { 
        try {
            const newComplaintsSnapshot = await getDocs(query(collection(db, "complaints"), where("status", "==", "new")));
            setNewComplaints(newComplaintsSnapshot.size);
            const allComplaintsSnapshot = await getDocs(collection(db, "complaints"));
            setTotalComplaints(allComplaintsSnapshot.size);
        } catch (error) {
            console.error("Error fetching complaints data:", error);
            setNewComplaints(0); setTotalComplaints(0);
        }
    }, []);
    
    // ⭐️ FIXED: Ito ang function na inayos para iwasan ang 'seconds' error.
    const fetchEvents = useCallback(async () => { 
        try {
            const querySnapshot = await getDocs(collection(db, "events"));
            const eventsFromDB = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                
                // Helper function para i-convert ang Timestamp
                const convertToDate = (timestamp: any): Date | undefined => {
                    // Tiyakin na ang timestamp ay mayroong 'seconds' property at ito ay Timestamp
                    if (timestamp && typeof timestamp.seconds === 'number') {
                        return new Date(timestamp.seconds * 1000);
                    }
                    return undefined; 
                };

                const startDate = convertToDate(data.start);
                const endDate = convertToDate(data.end);

                // Tiyakin na mayroon talagang start date bago i-include sa list
                if (!startDate) return null; 

                return {
                    id: doc.id,
                    title: data.title,
                    start: startDate,
                    // Kung may valid endDate, gamitin ito; kung wala, ang start date na lang
                    end: endDate || startDate, 
                    description: data.description || "",
                };
            }).filter(event => event !== null) as EventType[]; // Tanggalin ang null entries
            
            eventsFromDB.sort((a, b) => a.start.getTime() - b.start.getTime());
            const now = new Date();
            // I-check kung tapos na ang event gamit ang 'end' date. Kung walang 'end', gagamitin ang 'start'
            setEvents(eventsFromDB.filter(event => event.end!.getTime() >= now.getTime())); 
        } catch (error) {
            console.error("Error fetching events:", error);
        }
    }, []);
    // ----------------------------------------------------------------
    
    const fetchAnalytics = useCallback(async () => { 
        try {
            const membersSnapshot = await getDocs(collection(db, "members"));
            const currentMembersPool = membersSnapshot.docs.map(doc => doc.data()).filter(member => member.status && member.status.toLowerCase() !== "deleted");
            setActiveMembers(currentMembersPool.filter(member => member.status && member.status.toLowerCase() === "active").length);
            setInactiveMembers(currentMembersPool.filter(member => member.status && member.status.toLowerCase() === "inactive").length);
            setNewMembers(currentMembersPool.filter(member => member.status && member.status.toLowerCase() === "new").length);
            setCurrentMembersCount(currentMembersPool.length);
            setRawTotalMembers(0); 
        } catch (error) {
            console.log("CRITICAL ERROR FETCHING ANALYTICS:", error);
            setRawTotalMembers(0); setCurrentMembersCount(0); setActiveMembers(0); setInactiveMembers(0); setNewMembers(0);
        }
    }, []);
    
    const fetchFinanceOverview = useCallback(async () => { 
        try {
            const startOfYear = Timestamp.fromDate(new Date(selectedYear, 0, 1));
            const endOfYear = Timestamp.fromDate(new Date(selectedYear + 1, 0, 1)); 
            const collectionsSnap = await getDocs(query(collection(db, "contributions"), where("transactionDate", ">=", startOfYear), where("transactionDate", "<", endOfYear)));
            const expensesSnap = await getDocs(query(collection(db, "expenses"), where("transactionDate", ">=", startOfYear), where("transactionDate", "<", endOfYear)));

            const monthAbbreviations = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const monthlyMap: Record<string, { collections: number; expenses: number }> = {};
            monthAbbreviations.forEach(month => { monthlyMap[month] = { collections: 0, expenses: 0 }; });

            const parseMonth = (timestamp: any) => {
                const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp.seconds * 1000); 
                return date.toLocaleString("default", { month: "short" }).toUpperCase();
            };

            collectionsSnap.forEach((doc) => {
                const data = doc.data();
                const timestampField = data.transactionDate || data.timestamp; 
                if (!timestampField || !data.amount) return;
                const month = parseMonth(timestampField);
                if (monthlyMap[month]) { monthlyMap[month].collections += Number(data.amount) || 0; }
            });

            expensesSnap.forEach((doc) => {
                const data = doc.data();
                const timestampField = data.transactionDate; 
                if (!timestampField || !data.amount) return;
                const month = parseMonth(timestampField);
                if (monthlyMap[month]) { monthlyMap[month].expenses += Number(data.amount) || 0; }
            });

            setFinancialData(monthAbbreviations.map((month) => ({
                month, 
                Collections: monthlyMap[month].collections,
                Expenses: monthlyMap[month].expenses,
            })));
        } catch (err) {
            console.error("Error loading financial data:", err);
        }
    }, [selectedYear]); 
    // ---------------------------------------------------------------


    // --- EFFECT HOOKS ---
    useEffect(() => {
        const timerId = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000); 
        return () => clearInterval(timerId); 
    }, []);

    useEffect(() => {
        fetchEvents();
        fetchAnalytics(); 
        fetchComplaintsData();
    }, [fetchEvents, fetchAnalytics, fetchComplaintsData]);

    useEffect(() => {
        fetchFinanceOverview();
        calculateHOABalance();
    }, [selectedYear, fetchFinanceOverview, calculateHOABalance]);

    
    // FORMATTING using the currentTime state
    const formattedTime = currentTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const formattedDate = currentTime.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    // --- JSX RENDER ---
    return (
        <div className="p-6"> 

            {/* Header and Date/Time Panel */}
            <div className="flex justify-between items-start mb-6">

                <div>
                    <h1 className="text-3xl font-bold text-gray-800">
                        Welcome back, {adminUsername}
                    </h1>
                    <p className="text-base text-gray-500 mt-1">
                        See the overview and activities of the HOA
                    </p>
                </div>
                {/* Date/Time Panel */}
                <div className="w-[180px] bg-white p-4 text-center rounded shadow-md flex-shrink-0">
                    <p className="text-2xl font-bold text-gray-800">
                        {formattedTime}
                    </p>
                    <p className="text-base text-gray-500">{formattedDate}</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">

                {/* Left Column: Stats and Charts */}
                <div className="flex-1 space-y-6">

                    {/* Stat Boxes: Member Stats and Balance Stat */}
                    <div className="flex flex-wrap gap-4 border-b border-gray-200 pb-4">
                        <MemberStatBlock
                            current={currentMembersCount} 
                            active={activeMembers}
                            inactive={inactiveMembers}
                            newMembers={newMembers}
                            rawTotal={rawTotalMembers} 
                        />

                        <StatBox
                            label={`Total Net ${selectedYear} (HOA Balance)`}
                            value={
                                hoaBalance !== null
                                        ? `₱${hoaBalance.toLocaleString()}`
                                        : "Loading..."
                            }
                            type="balance"
                        />
                    </div>

                    {/* Financial Overview Chart with Year Selector */}
                    <FinancialOverview 
                        data={financialData} 
                        selectedYear={selectedYear}
                        setSelectedYear={setSelectedYear}
                        yearOptions={YEAR_OPTIONS}
                    />

                    {/* Bottom Section (Small Cards) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <InfoCard title="Traffic Acquisition" footer="View More">
                             <div className="h-40 flex items-center justify-center">
                                 <p className="text-sm text-gray-500">
                                     [Chart coming soon]
                                 </p>
                             </div>
                        </InfoCard>

                        <InfoCard 
                            title="Complaints" 
                            footer="View More"
                            onViewMoreClick={onViewComplaintsClick} // ⭐️ NAVIGATION: Complaints
                        >
                            <div className="flex justify-around items-center h-40">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-gray-800 mb-1">{newComplaints}</div>
                                    <p className="text-sm text-gray-500">New Complaints</p>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-gray-800 mb-1">{totalComplaints}</div>
                                    <p className="text-sm text-gray-500">Total Complaints</p>
                                </div>
                            </div>
                        </InfoCard>

                        <InfoCard title="Ongoing Projects" footer="View More">
                            <div className="h-full flex items-center justify-center ">
                                <p className="text-lg font-semibold text-gray-500">No current projects</p>
                            </div>
                        </InfoCard>

                        <FullyPaidMembersCard onViewMoreClick={onViewContributionsClick} /> {/* ⭐️ NAVIGATION: Contributions */}
                    </div>

                </div>

                {/* Right Column: Upcoming Events */}
                <div className="w-full lg:w-[350px] bg-white rounded shadow-md flex flex-col flex-shrink-0">
                    
                    {/* Custom Dark Green Header for Upcoming Events */}
                    <div className="p-4 bg-[#1e4643] rounded-t border-b border-gray-600"> 
                        <h2 className="text-lg font-semibold text-white">
                            Upcoming Events
                        </h2>
                        <div className="text-sm text-white mt-1">Total {events.length} Upcoming Events</div>
                    </div>
                    
                    {/* Event List */}
                    <div className="p-4 max-h-[700px] overflow-y-auto flex-grow">
                        {events.length > 0 ? (
                            events.map((event, index) => {
                                // Tiyakin na mayroong 'start' bago gamitin
                                if (!event.start) return null; 

                                const eventDate = event.start;
                                const month = eventDate.toLocaleString("default", { month: "short" });
                                const day = eventDate.getDate();
                                const start = event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                
                                return (
                                    <div
                                        key={index}
                                        className="flex gap-4 py-3 border-b border-gray-200 last:border-b-0"
                                    >
                                        {/* Date Box */}
                                        <div className="bg-[#007963] text-white text-center p-1 rounded font-bold w-16 h-16 flex flex-col justify-center items-center flex-shrink-0">
                                            <span className="text-xs leading-none">{month.toUpperCase()}</span>
                                            <span className="text-2xl leading-none">{day}</span>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-800 text-base">
                                                {event.title}
                                            </h3>
                                            {event.description && (
                                                <p className="text-sm text-gray-600 mt-0.5">
                                                    {event.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-0.5">{`${eventDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | ${start}`}</p>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center text-gray-500 py-10">
                                <p>No upcoming events.</p>
                            </div>
                        )}
                    </div>
                    
                    {/* View Events Button */}
                    <div className="p-4 border-t border-gray-200 bg-white text-center">
                        <button 
                            className="bg-[#007963] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:bg-[#005a4a]"
                            onClick={onViewEventsClick} // ⭐️ NAVIGATION: CalendarEvents
                        >
                            View Events
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

// -------------------------------------------------------------------
// II. WRAPPER COMPONENT WITH HEADER AND NAVIGATION LOGIC (EXPORTED COMPONENT)
// -------------------------------------------------------------------

export default function DashboardContainer() {
    const headerBgColor = 'bg-[#1e4643]'; 
    const adminUsername = "Admin"; 
    
    // Initialize useNavigate
    const navigate = useNavigate(); 
    
    // --- Navigation Handlers ---
    const handleAdminClick = () => {
        navigate('/EditModal'); 
    };
    
    // ⭐️ NEW HANDLER: Complaints page
    const handleViewComplaintsClick = () => {
        navigate('/Complaints'); 
    };

    // ⭐️ NEW HANDLER: Contributions/Payments page
    const handleViewContributionsClick = () => {
        navigate('/Contribution'); // Assuming your contributions/payments page path is '/Contributions'
    };

    // ⭐️ NEW HANDLER: CalendarEvents page
    const handleViewEventsClick = () => {
        navigate('/CalendarEvent'); 
    };
    // ---------------------------

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            
            {/* TOP HEADER */}
            <header className={`w-full ${headerBgColor} text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0`}>
                
                {/* Dashboard Title on the Left */}
                <div className="flex items-center space-x-4">
                    <h1 className="text-xl font-bold">Admin Dashboard</h1>
                </div>

                {/* Profile/User Icon on the Right */}
                <div className="flex items-center space-x-3">
                    <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
                        <ShareIcon className="h-5 w-5" /> 
                    </button>

                    {/* ADMIN BUTTON: Navigation Handler */}
                    <div 
                        className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
                        onClick={handleAdminClick} 
                    >
                        <UserCircleIcon className="h-8 w-8 text-white" />
                        <span className="text-sm font-medium hidden sm:inline">{adminUsername}</span>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 overflow-auto">
                <Dashboard 
                    adminUsername={adminUsername} 
                    onViewComplaintsClick={handleViewComplaintsClick} 
                    onViewContributionsClick={handleViewContributionsClick}
                    onViewEventsClick={handleViewEventsClick}
                /> 
            </main>
        </div>
    );
}