import React, { useEffect, useState, useCallback } from "react";
import {
    collection,
    getDocs,
    query,
    where,
    Timestamp,
    // doc, // Not needed here
    // getDoc, // Not needed here
} from "firebase/firestore";
// IMPORTANT: Ensure this path correctly points to your initialized Firestore database instance
import { db } from "../Firebase"; // Assuming your db export is correct
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

// Event type
interface EventType {
    id?: string;
    title: string;
    start: Date;
    end: Date;
    description?: string;
}

// --- Helper Components ---

/**
 * Component for the member stats (Total, Active, Inactive, New) 
 * as a single, combined block to match the Figma design.
 */
function MemberStatBlock({
    total,
    active,
    inactive,
    newMembers,
}: {
    total: number;
    active: number;
    inactive: number;
    newMembers: number;
}) {
    // Inner Stat Box for Members
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
            <MemberInnerBox label="Total members" value={total} />
            <MemberInnerBox label="Active" value={active} />
            <MemberInnerBox label="Inactive" value={inactive} />
            <MemberInnerBox label="New members" value={newMembers} />
        </div>
    );
}

// Stat Box Component (Modified to only handle the single Balance box now)
function StatBox({ label, value, type }: { label: string; value: string | number; type: "balance" }) {
    // Only 'balance' type is expected here after the refactor
    const valueColor = "text-gray-800"; // Changed to gray to match Figma's balance font color
    const borderColor = "border-gray-300"; // Changed border color to match Figma

    return (
        <div className={`flex-1 min-w-[250px] bg-white p-3 border-b-4 ${borderColor} rounded shadow-sm text-center`}>
            <h2 className="text-sm font-medium text-gray-500">{label}</h2>
            <p className={`text-2xl mt-1 ${valueColor} font-bold`}>
                {value}
            </p>
        </div>
    );
}


// Financial Overview Chart Component (Adjusted - no functional changes)
function FinancialOverview({ data }: { data: any[] }) {
    return (
        <div className="bg-white p-6 rounded shadow-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">
                Financial Overview
            </h2>
            {data.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} />
                        
                        {/* ✅ Y-Axis: Domain set to [0, 20000] with 5 ticks for 5k interval */}
                        <YAxis 
                            tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`} 
                            tickLine={false} 
                            axisLine={false}
                            domain={[0, 20000]} // I-set ang domain mula 0 hanggang 20000 (20k)
                            tickCount={5}      // 5 ticks: 0k, 5k, 10k, 15k, 20k
                        />
                        
                        <Tooltip formatter={(value: any) => [`₱${value.toLocaleString()}`, "Amount"]} />
                        <Legend wrapperStyle={{ paddingTop: 20 }} verticalAlign="bottom" align="center" />
                        <Line
                            type="monotone"
                            dataKey="Collections"
                            stroke="#007963"
                            strokeWidth={2}
                            dot={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="Expenses"
                            stroke="#B71C1C"
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <p className="text-gray-500 text-center py-10">
                    No financial data available.
                </p>
            )}
        </div>
    );
}

// InfoCard Component for Bottom Section (Modified to accept ReactNode for footerContent)
function InfoCard({ title, children, footer, footerContent }: { title: string; children: React.ReactNode; footer?: string; footerContent?: React.ReactNode }) {
    const isViewMore = footer === "View More";
    
    // Determine the content to display in the footer
    let actualFooterContent;
    if (footerContent) {
        actualFooterContent = footerContent; // Use the custom ReactNode
    } else if (isViewMore) {
        actualFooterContent = (
            <button className="text-sm font-semibold text-[#007963] hover:text-[#005a4a]">View More</button>
        );
    } else {
        actualFooterContent = (
            <span className="text-sm font-semibold text-gray-500">{footer}</span>
        );
    }

    return (
        <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[250px]">
            <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            </div>
            <div className="flex-1 px-4 py-2">{children}</div>
            {/* The footer div now uses the actualFooterContent */}
            <div className={`p-3 border-t border-gray-100 ${footerContent ? 'bg-white' : (isViewMore ? 'bg-gray-50' : 'bg-white')} flex justify-center items-center`}>
                {actualFooterContent}
            </div>
        </div>
    );
}

// --- Fully Paid Members Card (No changes needed here) ---
function FullyPaidMembersCard() {
    // 1. MONTH OPTIONS: Inayos ko na para kumpleto at tama ang buwan/taon
    const MONTH_OPTIONS = [
        { label: "JAN", value: "January 2025" },
        { label: "FEB", value: "February 2025" },
        { label: "MAR", value: "March 2025" },
        { label: "APR", value: "April 2025" },
        { label: "MAY", value: "May 2025" },
        { label: "JUN", value: "June 2025" },
        { label: "JUL", value: "July 2025" },
        { label: "AUG", value: "August 2025" },
        { label: "SEP", value: "September 2025" }, 
        { label: "OCT", value: "October 2025" },
        { label: "NOV", value: "November 2025" },
        { label: "DEC", value: "December 2025" },
        // Pwede mo itong i-update sa kung anong taon ang kailangan mo (e.g., 'January 2024')
    ];
    
    // 2. STATE
    const [currentMonthValue, setCurrentMonthValue] = useState(MONTH_OPTIONS[0].value); 
    const [fullyPaidMembers, setFullyPaidMembers] = useState(0); 
    const [isLoading, setIsLoading] = useState(true);

    // 3. CORE LOGIC (Firebase Fetching)
    const fetchFullyPaidMembers = useCallback(async (monthYear: string) => {
        setIsLoading(true);
        try {
            // FIREBASE QUERY: Filters the 'contributions' collection based on 'monthYear'
            const contributionsQuery = query(
                collection(db, "contributions"),
                where("monthYear", "==", monthYear)
            );
            
            const querySnapshot = await getDocs(contributionsQuery);
            
            // COUNTING LOGIC: Uses a Set to ensure only unique recipients are counted
            const uniqueRecipients = new Set<string>();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // Assumes 'recipient' field holds the unique member ID/Name
                if (data.recipient) {
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
    }, []);

    // 4. EFFECT HOOK: Trigger the fetch function when the month selection changes
    useEffect(() => {
        fetchFullyPaidMembers(currentMonthValue);
    }, [currentMonthValue, fetchFullyPaidMembers]);
    
    // 5. HELPER FOR DISPLAY
    const getShortMonthLabel = (value: string) => {
        return MONTH_OPTIONS.find(opt => opt.value === value)?.label || 'N/A';
    };


    // 6. CUSTOM FOOTER (Contains the dropdown logic)
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
            {/* View More button is still needed, so let's put it here */}
            <button className="text-[#007963] hover:text-[#005a4a]">View More</button> 
        </div>
    );

    // 7. CARD RETURN (UI Structure)
    return (
        <InfoCard 
            title="Fully Paid Members" 
            footerContent={FooterContent} // Ipinasa ang custom dropdown
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
// --- END OF Fully Paid Members Card ---


// --- Dashboard Component ---

export default function Dashboard() {
    const [events, setEvents] = useState<EventType[]>([]);
    // Initial data matching the provided image
    const [totalMembers, setTotalMembers] = useState(7); // Used initial hardcoded value for quick load
    const [activeMembers, setActiveMembers] = useState(0); // Used initial hardcoded value for quick load
    const [inactiveMembers, setInactiveMembers] = useState(7); // Used initial hardcoded value for quick load
    const [newMembers, setNewMembers] = useState(0); // Used initial hardcoded value for quick load
    
    // Initial value set to 1,000,000 to match the Figma image (This was the previous change)
    const [hoaBalance, setHoaBalance] = useState<number | null>(1000000); 
    
    const [financialData, setFinancialData] = useState<any[]>([]);
    // Data matching the provided image for placeholders
    const [newComplaints, setNewComplaints] = useState(2);
    const [totalComplaints, setTotalComplaints] = useState(10);


    /**
     * Function to calculate the current HOA Balance: Total Contributions - Total Expenses.
     */
    const calculateHOABalance = async () => {
        try {
            // 1. Fetch Total Contributions (Income)
            const contributionsSnapshot = await getDocs(collection(db, "contributions"));
            let totalCollections = 0;
            contributionsSnapshot.forEach((doc) => {
                const data = doc.data();
                // We use || 0 to safely handle potentially missing or non-numeric data
                totalCollections += Number(data.amount) || 0;
            });

            // 2. Fetch Total Expenses (Assuming a separate 'expenses' collection exists)
            const expensesSnapshot = await getDocs(collection(db, "expenses"));
            let totalExpenses = 0;
            expensesSnapshot.forEach((doc) => {
                const data = doc.data();
                totalExpenses += Number(data.amount) || 0;
            });

            // 3. Calculate Final Balance
            const finalBalance = totalCollections - totalExpenses;

            // 4. Update State
            setHoaBalance(finalBalance);

        } catch (error) {
            console.error("Error calculating HOA Balance:", error);
            // Fallback to the initial value if the calculation fails
            setHoaBalance(1000000); 
        }
    };


    useEffect(() => {
        /**
         * Function to fetch events from the "events" collection and filter for upcoming.
         */
        const fetchEvents = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "events"));

                const eventsFromDB = querySnapshot.docs.map((doc) => {
                    const data = doc.data();

                    return {
                        id: doc.id,
                        title: data.title,
                        // Convert Timestamp to JavaScript Date object
                        start: new Date((data.start as Timestamp).seconds * 1000),
                        end: new Date((data.end as Timestamp).seconds * 1000),
                        description: data.description || "",
                    };
                });

                // Sort events by start date
                eventsFromDB.sort((a, b) => a.start.getTime() - b.start.getTime());

                // Filter to show only upcoming events
                const now = new Date();
                const upcomingEvents = eventsFromDB.filter(event => event.end.getTime() >= now.getTime());

                setEvents(upcomingEvents);
            } catch (error) {
                console.error("Error fetching events:", error);
            }
        };

        const fetchAnalytics = async () => {
            try {
                // Fetch members
                const membersSnapshot = await getDocs(collection(db, "members"));
                const allMembers = membersSnapshot.docs.map((doc) => doc.data());
                
                // --- Updated the state setting to use the fetched data ---
                setTotalMembers(allMembers.length);

                const activeCount = allMembers.filter(
                    (member) => member.status === "active"
                ).length;
                const inactiveCount = allMembers.length - activeCount; // Assuming any non-active is inactive
                setActiveMembers(activeCount);
                setInactiveMembers(inactiveCount);
                // --- End of Update ---

                const thirtyDaysAgo = Timestamp.fromDate(
                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                );
                const newMembersSnapshot = await getDocs(
                    query(
                        collection(db, "members"),
                        where("createdAt", ">", thirtyDaysAgo)
                    )
                );
                setNewMembers(newMembersSnapshot.size);

            } catch (error) {
                console.error("Error fetching analytics:", error);
            }
        };

        const fetchFinanceOverview = async () => {
            try {
                const collectionsSnap = await getDocs(collection(db, "contributions"));
                const expensesSnap = await getDocs(collection(db, "expenses"));

                const monthlyMap: Record<
                    string,
                    { collections: number; expenses: number }
                > = {
                    JAN: { collections: 0, expenses: 0 },
                    FEB: { collections: 0, expenses: 0 },
                    MAR: { collections: 0, expenses: 0 },
                    APR: { collections: 0, expenses: 0 },
                    MAY: { collections: 0, expenses: 0 },
                    JUN: { collections: 0, expenses: 0 },
                    JUL: { collections: 0, expenses: 0 },
                    AUG: { collections: 0, expenses: 0 },
                    SEP: { collections: 0, expenses: 0 },
                    OCT: { collections: 0, expenses: 0 },
                    NOV: { collections: 0, expenses: 0 },
                    DEC: { collections: 0, expenses: 0 },
                };

                const parseMonth = (timestamp: any) => {
                    const date =
                        timestamp instanceof Timestamp
                            ? timestamp.toDate()
                            : new Date(timestamp.seconds * 1000);

                    return date
                        .toLocaleString("default", { month: "short" })
                        .toUpperCase();
                };

                // --- Collections Logic (Used 'transactionDate' or fallback) ---
                collectionsSnap.forEach((doc) => {
                    const data = doc.data();
                    // Assumed transactionDate is the primary timestamp field
                    const timestampField = data.transactionDate || data.timestamp; 
                    if (!timestampField || !data.amount) return;

                    const month = parseMonth(timestampField);
                    if (monthlyMap[month]) {
                        monthlyMap[month].collections += Number(data.amount) || 0;
                    }
                });

                // --- ✅ ADJUSTED Expenses Logic to use 'transactionDate' based on screenshot ---
                expensesSnap.forEach((doc) => {
                    const data = doc.data();
                    
                    // Ginamit ang 'transactionDate' na nakita sa inyong Firebase screenshot
                    const timestampField = data.transactionDate; 
                    
                    if (!timestampField || !data.amount) return;
                    
                    const month = parseMonth(timestampField);
                    if (monthlyMap[month]) {
                        monthlyMap[month].expenses += Number(data.amount) || 0;
                    }
                });

                const chartData = Object.keys(monthlyMap).map((month) => ({
                    month,
                    Collections: monthlyMap[month].collections,
                    Expenses: monthlyMap[month].expenses,
                }));

                setFinancialData(chartData);
            } catch (err) {
                console.error("Error loading financial data:", err);
            }
        };


        // Execute the data fetching functions
        fetchEvents();
        fetchAnalytics();
        fetchFinanceOverview();
        // 💰 Call the new balance calculation function
        calculateHOABalance();
    }, []);

    // Static date from Figma design for matching UI
    const figmaDate = new Date('2025-06-30T10:00:00');
    const formattedTime = figmaDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const formattedDate = figmaDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <div className="min-h-screen bg-gray-100 p-6">

            {/* Header and Date/Time Panel */}
            <div className="flex justify-between items-start mb-6">

                <div>
                    <h1 className="text-3xl font-bold text-gray-800">
                        Welcome back, Admin
                    </h1>
                    <p className="text-base text-gray-500 mt-1">
                        See the overview and activities of the HOA
                    </p>
                </div>
                {/* Date/Time Panel (matches Figma's isolated right box) */}
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

                    {/* Stat Boxes: Combined Member Stats and Separate Balance Stat */}
                    <div className="flex flex-wrap gap-4 border-b border-gray-200 pb-4">
                        {/* ✅ UPDATED: Member Stat Block (Combined box) */}
                        <MemberStatBlock
                            total={totalMembers}
                            active={activeMembers}
                            inactive={inactiveMembers}
                            newMembers={newMembers}
                        />

                        {/* ✅ UPDATED: Current HOA Account Balance Stat Box (Separate box) */}
                        <StatBox
                            label="Current HOA Account Balance"
                            value={
                                hoaBalance !== null
                                        ? `₱${hoaBalance.toLocaleString()}`
                                        : "Loading..."
                            }
                            type="balance"
                        />
                    </div>

                    {/* Financial Overview Chart */}
                    <FinancialOverview data={financialData} />

                    {/* Bottom Section (Small Cards) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <InfoCard title="Traffic Acquisition" footer="View More">
                            {/* Pie Chart Placeholder */}
                            <div className="h-40 flex items-center justify-center">
                                <p className="text-sm text-gray-500">
                                    [Pie chart coming soon]
                                </p>
                            </div>
                        </InfoCard>

                        <InfoCard title="Complaints" footer="View More">
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

                        {/* ✅ UPDATED: Gamitin na ang bagong FullyPaidMembersCard component */}
                        <FullyPaidMembersCard /> 
                    </div>

                </div>

                {/* Right Column: Upcoming Events */}
                {/* Structure: Header -> Scrollable Content -> Sticky Footer Button */}
                <div className="w-full lg:w-[350px] bg-white rounded shadow-md flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">
                            Upcoming Events
                        </h2>
                        <div className="text-sm text-gray-500 mt-1">Total {events.length} Upcoming Events</div>
                    </div>
                    
                    {/* Event List: Set a max height and allow scrolling */}
                    <div className="p-4 max-h-[700px] overflow-y-auto flex-grow">
                        {events.length > 0 ? (
                            events.map((event, index) => {
                                const eventDate = new Date(event.start);
                                const month = eventDate.toLocaleString("default", {
                                    month: "short",
                                });
                                const day = eventDate.getDate();
                                const start = event.start.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });
                                const end = event.end.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                });

                                return (
                                    <div
                                        key={index}
                                        className="flex gap-4 py-3 border-b border-gray-200 last:border-b-0"
                                    >
                                        {/* Date Box: Adjusted size and alignment to match Figma */}
                                        <div className="bg-[#007963] text-white text-center p-1 rounded font-bold w-16 h-16 flex flex-col justify-center items-center flex-shrink-0">
                                            <span className="text-xs leading-none">{month.toUpperCase()}</span>
                                            <span className="text-2xl leading-none">{day}</span>
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-800 text-base">
                                                {event.title}
                                            </h3>
                                            {/* Description is the middle line of text (e.g., Report Documents) */}
                                            {event.description && (
                                                <p className="text-sm text-gray-600 mt-0.5">
                                                    {event.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-0.5">{`${eventDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | ${start} - ${end}`}</p>
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
                    
                    {/* ✅ FIX: View Events Button moved to a sticky footer */}
                    <div className="p-4 border-t border-gray-200 bg-white text-center">
                        <button className="bg-[#007963] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:bg-[#005a4a]">
                            View Events
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}