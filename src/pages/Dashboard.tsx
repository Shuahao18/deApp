import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../Firebase";
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

export default function Dashboard() {
  const [events, setEvents] = useState<EventType[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [activeMembers, setActiveMembers] = useState(0);
  const [inactiveMembers, setInactiveMembers] = useState(0);
  const [newMembers, setNewMembers] = useState(0);
  const [hoaBalance, setHoaBalance] = useState<number | null>(null);
  const [financialData, setFinancialData] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            start: new Date(data.start.seconds * 1000),
            end: new Date(data.end.seconds * 1000),
            description: data.description || "",
          };
        });
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    };

    const fetchAnalytics = async () => {
      try {
        const membersSnapshot = await getDocs(collection(db, "members"));
        const allMembers = membersSnapshot.docs.map((doc) => doc.data());
        setTotalMembers(allMembers.length);

        const activeCount = allMembers.filter(
          (member) => member.status === "active"
        ).length;
        const inactiveCount = allMembers.filter(
          (member) => member.status === "inactive"
        ).length;
        setActiveMembers(activeCount);
        setInactiveMembers(inactiveCount);

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

        const financeDoc = await getDoc(doc(db, "finance", "status"));
        if (financeDoc.exists()) {
          setHoaBalance(financeDoc.data().balance);
        }
      } catch (error) {
        console.error("Error fetching analytics:", error);
      }
    };

    const fetchFinanceOverview = async () => {
      try {
        const collectionsSnap = await getDocs(collection(db, "collections"));
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

        collectionsSnap.forEach((doc) => {
          const data = doc.data();
          if (!data.timestamp || !data.amount) return;
          const month = parseMonth(data.timestamp);
          if (monthlyMap[month]) {
            monthlyMap[month].collections += data.amount || 0;
          }
        });

        expensesSnap.forEach((doc) => {
          const data = doc.data();
          if (!data.timestamp || !data.amount) return;
          const month = parseMonth(data.timestamp);
          if (monthlyMap[month]) {
            monthlyMap[month].expenses += data.amount || 0;
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

    fetchEvents();
    fetchAnalytics();
    fetchFinanceOverview();
  }, []);

  const today = new Date();
  const formattedTime = today.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedDate = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-100 ">
      {/* ✅ Top Navbar */}
      <div className="bg-[#007963] text-white h-20 flex justify-between items-center px-6 py-4 rounded-t shadow">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <div className="bg-white text-[#007963] p-2 rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5.121 17.804A9.003 9.003 0 0112 15c2.137 0 4.104.747 5.879 1.996M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </div>
      </div>

      {/* Header Section */}
      <div className="bg-white p-6 rounded shadow mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Welcome back, Admin
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              See the overview and activities of the HOA
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-gray-800">
              {formattedTime}
            </p>
            <p className="text-sm text-gray-500">{formattedDate}</p>
          </div>
        </div>

        {/* Stat Boxes */}
        <div className="flex flex-wrap gap-4 mt-6">
          <StatBox label="Total Members" value={totalMembers} />
          <StatBox label="Active" value={activeMembers} />
          <StatBox label="Inactive" value={inactiveMembers} />
          <StatBox label="New Members" value={newMembers} />
          <StatBox
            label="Current HOA Account Balance"
            value={
              hoaBalance !== null
                ? `₱${hoaBalance.toLocaleString()}`
                : "Loading..."
            }
          />
        </div>
      </div>

      {/* Middle Section */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <FinancialOverview data={financialData} />
        </div>

        {/* Upcoming Events */}
        <div className="w-full lg:w-[350px] bg-white rounded shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">
              Upcoming Events
            </h2>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {events.map((event, index) => {
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
                  className="flex gap-4 py-3 border-b border-gray-200"
                >
                  <div className="bg-[#007963] text-white text-center px-3 py-2 rounded font-bold text-sm w-14">
                    {month.toUpperCase()} <br /> {day}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">
                      {event.title}
                    </h3>
                    <p className="text-sm text-gray-600">{`${start} - ${end}`}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        <div className="bg-white p-4 rounded shadow col-span-1">
          <h2 className="font-semibold text-gray-700 mb-2">
            Traffic Acquisition
          </h2>
          <p className="text-sm text-gray-500">[Pie chart coming soon]</p>
        </div>
        <div className="bg-white p-4 rounded shadow col-span-1">
          <h2 className="font-semibold text-gray-700 mb-2">Complaints</h2>
          <p className="text-sm">New Complaints: 2</p>
          <p className="text-sm">Total Complaints: 10</p>
        </div>
        <div className="bg-white p-4 rounded shadow col-span-1">
          <h2 className="font-semibold text-gray-700 mb-2">Ongoing Projects</h2>
          <p className="text-sm text-gray-500">No current projects</p>
        </div>
        <div className="bg-white p-4 rounded shadow col-span-1">
          <h2 className="font-semibold text-gray-700 mb-2">
            Fully Paid Members
          </h2>
          <p className="text-sm">29 members</p>
          <p className="text-sm text-gray-500">Month: Jan</p>
        </div>
      </div>
    </div>
  );
}

// Stat Box Component
function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
      <h2 className="text-center font-semibold text-gray-700">{label}</h2>
      <p className="text-center text-2xl mt-2 text-[#007963] font-bold">
        {value}
      </p>
    </div>
  );
}

// Financial Overview Chart Component
function FinancialOverview({ data }: { data: any[] }) {
  return (
    <div className="bg-white p-4 rounded shadow w-full">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">
        Financial Overview
      </h2>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid stroke="#ccc" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => `₱${value / 1000}k`} />
            <Tooltip formatter={(value: any) => `₱${value.toLocaleString()}`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="Collections"
              stroke="#007963"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="Expenses"
              stroke="#B71C1C"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-gray-500 text-center">
          No financial data available.
        </p>
      )}
    </div>
  );
}
