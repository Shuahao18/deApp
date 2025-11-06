import React, { useEffect, useState, useCallback, useMemo } from "react";
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
import {
  UserCircleIcon,
  ShareIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

// --- Firebase Imports ---
import { db } from "../Firebase";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import TrafficChartWidget from "../components/TrafficChartWidget";

// --- TYPE DEFINITIONS ---
interface EventType {
  id?: string;
  title: string;
  start: Date;
  end?: Date;
  description?: string;
}

interface FinancialTransaction {
  id: string;
  amount: number;
  transactionDate: Date;
  type: 'contribution' | 'expense';
  monthYear?: string;
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

// Helper to get month key for grouping
const getMonthKey = (date: Date): string => {
  return date.toLocaleString('default', { month: 'short' }).toUpperCase();
};

// -------------------------------------------------------------------
// --- SUB-COMPONENTS (Dashboard elements) ---
// -------------------------------------------------------------------

function MemberStatBlock({
  current,
  active,
  inactive,
  newMembers,
  rawTotal,
}: {
  current: number;
  active: number;
  inactive: number;
  newMembers: number;
  rawTotal: number;
}) {
  const MemberInnerBox = ({
    label,
    value,
  }: {
    label: string;
    value: number;
  }) => (
    <div className="flex flex-col items-center justify-center p-2 sm:p-3 md:p-4 w-1/4">
      <h3 className="text-xs sm:text-sm font-medium text-gray-500 whitespace-nowrap break-words text-center">
        {label}
      </h3>
      <p className="text-lg sm:text-xl md:text-2xl mt-1 text-gray-800 font-bold break-words">
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

function StatBox({
  label,
  value,
  type,
}: {
  label: string;
  value: string | number;
  type: "balance";
}) {
  const valueColor = "text-gray-800";
  const borderColor = "border-gray-300";

  return (
    <div
      className={`flex-1 min-w-[250px] bg-white p-3 border-b-4 ${borderColor} rounded shadow-sm text-center`}
    >
      <h2 className="text-xs sm:text-sm font-medium text-gray-500 break-words px-1">
        {label}
      </h2>
      <p className={`text-lg sm:text-xl md:text-2xl mt-1 ${valueColor} font-bold break-words`}>
        {value}
      </p>
    </div>
  );
}

function FinancialOverview({
  data,
  selectedYear,
  setSelectedYear,
  yearOptions,
}: {
  data: any[];
  selectedYear: number;
  setSelectedYear: React.Dispatch<React.SetStateAction<number>>;
  yearOptions: number[];
}) {
  // Calculate max value for proper Y-axis scaling
  const maxValue = useMemo(() => {
    if (data.length === 0) return 1000;
    const allValues = data.flatMap(item => [
      item.Collections || 0, 
      item.Expenses || 0
    ]);
    const max = Math.max(...allValues);
    // Round up to nearest 500 for better scaling
    return Math.ceil(max / 500) * 500 || 1000;
  }, [data]);

  return (
    <div className="bg-white p-4 sm:p-6 rounded shadow-md w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2 sm:gap-0">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
          Financial Overview ({selectedYear} Collections & Expenses)
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="text-xs sm:text-sm text-gray-600">
            Year:
          </label>
          <select
            id="year-select"
            className="text-gray-700 bg-white border border-gray-300 rounded-md py-1 px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#007963] text-xs sm:text-sm font-semibold"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
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
              tickFormatter={(value) => `₱${value.toLocaleString()}`}
              tickLine={false}
              axisLine={false}
              domain={[0, maxValue]}
              tickCount={6}
            />
            <Tooltip
              formatter={(value: any) => [
                `₱${value.toLocaleString()}`,
                "Amount",
              ]}
              labelFormatter={(label) => `Month: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: 20 }}
              verticalAlign="bottom"
              align="center"
            />
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
        <p className="text-gray-500 text-center py-8 sm:py-10 text-sm sm:text-base">
          No financial data available for {selectedYear}.
        </p>
      )}
    </div>
  );
}

function InfoCard({
  title,
  children,
  footer,
  footerContent,
  onViewMoreClick,
}: {
  title: string;
  children: React.ReactNode;
  footer?: string;
  footerContent?: React.ReactNode;
  onViewMoreClick?: () => void;
}) {
  const isViewMore = footer === "View More";

  let actualFooterContent;
  if (footerContent) {
    actualFooterContent = footerContent;
  } else if (isViewMore) {
    actualFooterContent = (
      <button
        className="text-xs sm:text-sm font-semibold text-[#007963] hover:text-[#005a4a]"
        onClick={onViewMoreClick}
      >
        View More
      </button>
    );
  } else {
    actualFooterContent = (
      <span className="text-xs sm:text-sm font-semibold text-gray-500">{footer}</span>
    );
  }

  return (
    <div className="bg-white rounded shadow-md flex flex-col h-full min-h-[200px]">
      <div className="p-3 sm:p-4 bg-object rounded-t border-b border-gray-600">
        <h2 className="text-sm sm:text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="flex-1 px-2 sm:px-3 py-2 overflow-hidden">{children}</div>
      <div
        className={`p-2 sm:p-3 border-t border-gray-100 ${footerContent ? "bg-white" : isViewMore ? "bg-gray-50" : "bg-white"} flex justify-center items-center`}
      >
        {actualFooterContent}
      </div>
    </div>
  );
}

function FullyPaidMembersCard({
  onViewMoreClick,
}: {
  onViewMoreClick: () => void;
}) {
  const today = new Date();
  const currentMonthLabel = today.toLocaleString("default", { month: "long" });
  const currentYear = today.getFullYear().toString();

  const MONTH_OPTIONS = useMemo(() => {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return months.map((month) => ({
      label: month.substring(0, 3).toUpperCase(),
      value: `${month} ${currentYear}`,
    }));
  }, [currentYear]);

  const [currentMonthValue, setCurrentMonthValue] = useState(
    MONTH_OPTIONS.find((opt) => opt.value.includes(currentMonthLabel))?.value ||
      `${currentMonthLabel} ${currentYear}`
  );
  const [fullyPaidMembers, setFullyPaidMembers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFullyPaidMembers = useCallback(
    async (monthYear: string) => {
      if (!db) return;

      setIsLoading(true);
      try {
        const contributionsCollectionPath = `contributions`;

        const contributionsQuery = query(
          collection(db, contributionsCollectionPath),
          where("monthYear", "==", monthYear)
        );

        const querySnapshot = await getDocs(contributionsQuery);

        const uniqueRecipients = new Set<string>();
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.recipient && Number(data.amount) > 0) {
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
    },
    [currentYear]
  );

  useEffect(() => {
    fetchFullyPaidMembers(currentMonthValue);
  }, [currentMonthValue, fetchFullyPaidMembers]);

  const getShortMonthLabel = (value: string) => {
    return MONTH_OPTIONS.find((opt) => opt.value === value)?.label || "N/A";
  };

  const FooterContent = (
    <div className="flex flex-col xs:flex-row justify-between items-center px-1 w-full text-xs font-semibold gap-1 xs:gap-0">
      <div className="flex items-center gap-1 text-gray-500 whitespace-nowrap">
        Month:
        <select
          className="text-gray-700 bg-white border border-gray-300 rounded-md py-0.5 px-1 text-xs appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#007963]"
          value={currentMonthValue}
          onChange={(e) => setCurrentMonthValue(e.target.value)}
        >
          {MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <button
        className="text-[#007963] hover:text-[#005a4a] text-xs whitespace-nowrap"
        onClick={onViewMoreClick}
      >
        View More
      </button>
    </div>
  );

  return (
    <InfoCard title="Fully Paid Members" footerContent={FooterContent}>
      <div className="text-center my-2 h-32 flex flex-col justify-center overflow-hidden">
        {isLoading ? (
          <div className="text-lg text-gray-500 font-semibold flex justify-center">
            <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="sm:text-2xl md:text-3xl lg:text-4xl xl:text-7xl 2xl:text-8xl font-bold text-gray-800 mb-0.5 break-words">
              {fullyPaidMembers}
            </div>
            <p className="text-xs md:text-base lg:text-xs xl:text-sm 2xl:text-xl text-gray-500 px-0.5 break-words leading-tight">
               Total paid for {getShortMonthLabel(currentMonthValue)}
            </p>
          </>
        )}
      </div>
    </InfoCard>
  );
}

// -------------------------------------------------------------------
// --- MAIN DASHBOARD COMPONENT (CORE CONTENT) ---
// -------------------------------------------------------------------

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
  onViewEventsClick,
}: DashboardProps) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const YEAR_OPTIONS = useMemo(
    () => generateYearOptions(2020, 2050),
    []
  );

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

  // Navigation hook
  const navigate = useNavigate();

  // Navigation handlers
  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  // Simplified collection paths
  const memberCollectionPath = "members";
  const complaintsCollectionPath = "complaints";
  const eventsCollectionPath = "events";
  const contributionsCollectionPath = "contributions";
  const expensesCollectionPath = "expenses";

  // --- CALCULATE HOA BALANCE ---
  const calculateHOABalance = useCallback(async () => {
    if (!db) return;
    
    try {
      const startOfYear = Timestamp.fromDate(new Date(selectedYear, 0, 1));
      const endOfYear = Timestamp.fromDate(new Date(selectedYear + 1, 0, 1));

      // Fetch contributions for the selected year
      const contributionsQuery = query(
        collection(db, contributionsCollectionPath),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );
      
      // Fetch expenses for the selected year
      const expensesQuery = query(
        collection(db, expensesCollectionPath),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );

      const [contributionsSnap, expensesSnap] = await Promise.all([
        getDocs(contributionsQuery),
        getDocs(expensesQuery)
      ]);

      let totalCollections = 0;
      let totalExpenses = 0;

      // Process collections
      contributionsSnap.forEach((doc) => {
        const data = doc.data();
        const timestampField = data.transactionDate || data.timestamp;
        if (!timestampField || !data.amount) return;
        
        const date = timestampField instanceof Timestamp 
          ? timestampField.toDate() 
          : new Date(timestampField.seconds * 1000);
        
        if (date.getFullYear() === selectedYear) {
          totalCollections += Number(data.amount) || 0;
        }
      });

      // Process expenses
      expensesSnap.forEach((doc) => {
        const data = doc.data();
        const timestampField = data.transactionDate;
        if (!timestampField || !data.amount) return;
        
        const date = timestampField instanceof Timestamp 
          ? timestampField.toDate() 
          : new Date(timestampField.seconds * 1000);
        
        if (date.getFullYear() === selectedYear) {
          totalExpenses += Number(data.amount) || 0;
        }
      });

      setHoaBalance(totalCollections - totalExpenses);
    } catch (error) {
      console.error(`Error calculating Net Balance for ${selectedYear}:`, error);
      setHoaBalance(null);
    }
  }, [selectedYear]);

  // --- ACCURATE FINANCIAL CALCULATIONS ---
  
  // Improved financial data fetching with proper month-by-month calculation
  const fetchFinanceOverview = useCallback(async () => {
    if (!db) return;
    
    try {
      const startOfYear = Timestamp.fromDate(new Date(selectedYear, 0, 1));
      const endOfYear = Timestamp.fromDate(new Date(selectedYear + 1, 0, 1));

      // Fetch contributions for the selected year
      const collectionsQuery = query(
        collection(db, contributionsCollectionPath),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );
      
      // Fetch expenses for the selected year
      const expensesQuery = query(
        collection(db, expensesCollectionPath),
        where("transactionDate", ">=", startOfYear),
        where("transactionDate", "<", endOfYear)
      );

      const [collectionsSnap, expensesSnap] = await Promise.all([
        getDocs(collectionsQuery),
        getDocs(expensesQuery)
      ]);

      // Initialize monthly data structure
      const monthAbbreviations = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
        "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
      ];
      
      const monthlyData: Record<string, { 
        collections: number; 
        expenses: number;
      }> = {};
      
      monthAbbreviations.forEach(month => {
        monthlyData[month] = { 
          collections: 0, 
          expenses: 0
        };
      });

      // Process collections
      collectionsSnap.forEach((doc) => {
        const data = doc.data();
        const timestampField = data.transactionDate || data.timestamp;
        if (!timestampField || !data.amount) return;
        
        const date = timestampField instanceof Timestamp 
          ? timestampField.toDate() 
          : new Date(timestampField.seconds * 1000);
        
        if (date.getFullYear() === selectedYear) {
          const month = getMonthKey(date);
          if (monthlyData[month]) {
            monthlyData[month].collections += Number(data.amount) || 0;
          }
        }
      });

      // Process expenses
      expensesSnap.forEach((doc) => {
        const data = doc.data();
        const timestampField = data.transactionDate;
        if (!timestampField || !data.amount) return;
        
        const date = timestampField instanceof Timestamp 
          ? timestampField.toDate() 
          : new Date(timestampField.seconds * 1000);
        
        if (date.getFullYear() === selectedYear) {
          const month = getMonthKey(date);
          if (monthlyData[month]) {
            monthlyData[month].expenses += Number(data.amount) || 0;
          }
        }
      });

      // Format data for chart
      const formattedData = monthAbbreviations.map(month => {
        const monthData = monthlyData[month];
        
        return {
          month,
          Collections: monthData.collections,
          Expenses: monthData.expenses
        };
      });

      setFinancialData(formattedData);
    } catch (err) {
      console.error("Error loading financial data:", err);
      setFinancialData([]);
    }
  }, [selectedYear]);

  // --- OTHER DATA FETCHING FUNCTIONS ---
  const fetchComplaintsData = useCallback(async () => {
    if (!db) return;
    try {
      const newComplaintsSnapshot = await getDocs(
        query(
          collection(db, complaintsCollectionPath),
          where("status", "==", "new")
        )
      );
      setNewComplaints(newComplaintsSnapshot.size);
      
      const allComplaintsSnapshot = await getDocs(
        collection(db, complaintsCollectionPath)
      );
      setTotalComplaints(allComplaintsSnapshot.size);
    } catch (error) {
      console.error("Error fetching complaints data:", error);
      setNewComplaints(0);
      setTotalComplaints(0);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!db) return;
    try {
      const querySnapshot = await getDocs(collection(db, eventsCollectionPath));
      const eventsFromDB = querySnapshot.docs
        .map((doc) => {
          const data = doc.data();

          const convertToDate = (timestamp: any): Date | undefined => {
            if (timestamp && typeof timestamp.seconds === "number") {
              return new Date(timestamp.seconds * 1000);
            }
            return undefined;
          };

          const startDate = convertToDate(data.start);
          const endDate = convertToDate(data.end);

          if (!startDate) return null;

          return {
            id: doc.id,
            title: data.title,
            start: startDate,
            end: endDate || startDate,
            description: data.description || "",
          };
        })
        .filter((event) => event !== null) as EventType[];

      eventsFromDB.sort((a, b) => a.start.getTime() - b.start.getTime());
      const now = new Date();
      setEvents(
        eventsFromDB.filter(
          (event) =>
            (event.end ? event.end.getTime() : event.start.getTime()) >=
            now.getTime()
        )
      );
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (!db) return;
    try {
      const membersSnapshot = await getDocs(
        collection(db, memberCollectionPath)
      );
      const members = membersSnapshot.docs.map((doc) => doc.data());

      const currentMembersPool = members.filter(
        (member) => member.status && member.status.toLowerCase() !== "deleted"
      );

      setActiveMembers(
        currentMembersPool.filter(
          (member) => member.status && member.status.toLowerCase() === "active"
        ).length
      );
      setInactiveMembers(
        currentMembersPool.filter(
          (member) =>
            member.status && member.status.toLowerCase() === "inactive"
        ).length
      );
      setNewMembers(
        currentMembersPool.filter(
          (member) => member.status && member.status.toLowerCase() === "new"
        ).length
      );
      setCurrentMembersCount(currentMembersPool.length);
      setRawTotalMembers(members.length);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setRawTotalMembers(0);
      setCurrentMembersCount(0);
      setActiveMembers(0);
      setInactiveMembers(0);
      setNewMembers(0);
    }
  }, []);

  // --- EFFECT HOOKS ---
  useEffect(() => {
    fetchEvents();
    fetchAnalytics();
    fetchComplaintsData();
  }, [fetchEvents, fetchAnalytics, fetchComplaintsData]);

  useEffect(() => {
    fetchFinanceOverview();
    calculateHOABalance();
  }, [selectedYear, fetchFinanceOverview, calculateHOABalance]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* TOP HEADER - Dashboard Header (SAME AS CALENDAR) */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-4 sm:px-6 flex justify-between items-center flex-shrink-0">
        {/* Dashboard Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel">
            Dashboard
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-3">
          {/* ADMIN BUTTON: Navigation Handler */}
          <div
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick}
          >
            <UserCircleIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            <span className="text-xs sm:text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="space-y-6">
          {/* Welcome Panel */}
          <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 break-words">
                Welcome back, {adminUsername}
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-gray-500 mt-1 break-words">
                See the overview and activities of the HOA
              </p>
            </div>
            <div className="w-full sm:w-[160px] lg:w-[180px] bg-white p-3 text-center rounded shadow-md flex-shrink-0">
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800">
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-xs sm:text-sm text-gray-500">
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left Column: Stats and Charts */}
            <div className="flex-1 space-y-4 sm:space-y-6">
              {/* Stat Boxes: Member Stats and Balance Stat */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 border-b border-gray-200 pb-4">
                <MemberStatBlock
                  current={currentMembersCount}
                  active={activeMembers}
                  inactive={inactiveMembers}
                  newMembers={newMembers}
                  rawTotal={rawTotalMembers}
                />

                {/* TOTAL NET HOA BALANCE STATBOX */}
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

              {/* Bottom Section (Small Cards) - NOW 3 COLUMNS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* 1. ACTUAL TRAFFIC WIDGET */}
                <TrafficChartWidget />

                {/* 2. COMPLAINTS CARD - FIXED RESPONSIVE TEXT */}
                <InfoCard
                  title="Complaints"
                  footer="View More"
                  onViewMoreClick={onViewComplaintsClick}
                >
                  <div className="flex flex-col sm:flex-row justify-around items-center h-32 gap-1 sm:gap-0">
                    <div className="text-center flex-1">
                      <div className="sm:text-2xl md:text-3xl lg:text-4xl xl:text-7xl 2xl:text-8xl font-bold text-gray-800 mb-0.5 break-words">
                        {newComplaints}
                      </div>
                      <p className="text-xs md:text-base lg:text-xs xl:text-sm 2xl:text-xl text-gray-500 px-0.5 break-words leading-tight">
                        New Complaints
                      </p>
                    </div>
                    <div className="text-center flex-1">
                      <div className="sm:text-2xl md:text-3xl lg:text-4xl xl:text-7xl 2xl:text-8xl font-bold text-gray-800 mb-0.5 break-words">
                        {totalComplaints}
                      </div>
                      <p className="text-xs md:text-2xl lg:text-xs xl:text-sm 2xl:text-xl text-gray-500 px-0.5 break-words leading-tight">
                        Total Complaints
                      </p>
                    </div>
                  </div>
                </InfoCard>

                {/* 3. FULLY PAID MEMBERS CARD */}
                <FullyPaidMembersCard
                  onViewMoreClick={onViewContributionsClick}
                />
              </div>
            </div>

            {/* Right Column: Upcoming Events */}
            <div className="w-full lg:w-[320px] xl:w-[350px] bg-white rounded shadow-md flex flex-col flex-shrink-0">
              <div className="p-3 sm:p-4 bg-object rounded-t border-b border-gray-600">
                <h2 className="text-sm sm:text-base font-semibold text-white">
                  Upcoming Events
                </h2>
                <div className="text-xs sm:text-sm text-white mt-1">
                  Total {events.length} Upcoming Events
                </div>
              </div>

              <div className="p-2 sm:p-3 max-h-[400px] sm:max-h-[500px] lg:max-h-[600px] overflow-y-auto flex-grow">
                {events.length > 0 ? (
                  events.map((event, index) => {
                    if (!event.start) return null;

                    const eventDate = event.start;
                    const month = eventDate.toLocaleString("default", {
                      month: "short",
                    });
                    const day = eventDate.getDate();
                    const start = eventDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={index}
                        className="flex gap-2 sm:gap-3 py-2 border-b border-gray-200 last:border-b-0"
                      >
                        <div className="bg-[#007963] text-white text-center p-1 rounded font-bold w-10 h-10 sm:w-12 sm:h-12 flex flex-col justify-center items-center flex-shrink-0">
                          <span className="text-xs leading-none">
                            {month.toUpperCase()}
                          </span>
                          <span className="text-base sm:text-lg leading-none">{day}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 text-xs sm:text-sm break-words">
                            {event.title}
                          </h3>
                          {event.description && (
                            <p className="text-xs text-gray-600 mt-0.5 truncate max-w-full">
                              {event.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5 break-words">{`${eventDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | ${start}`}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-gray-500 py-6 sm:py-8">
                    <p className="text-xs sm:text-sm">No upcoming events.</p>
                  </div>
                )}
              </div>

              <div className="p-2 sm:p-3 border-t border-gray-200 bg-white text-center">
                <button
                  className="bg-[#007963] text-white px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-md hover:bg-[#005a4a] w-full sm:w-auto"
                  onClick={onViewEventsClick}
                >
                  View Events
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;