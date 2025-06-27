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
        > = {};

        const months = [
          "JAN",
          "FEB",
          "MAR",
          "APR",
          "MAY",
          "JUN",
          "JUL",
          "AUG",
          "SEP",
          "OCT",
          "NOV",
          "DEC",
        ];

        months.forEach((m) => {
          monthlyMap[m] = { collections: 0, expenses: 0 };
        });

        collectionsSnap.forEach((doc) => {
          const data = doc.data();
          const date = new Date(data.timestamp?.seconds * 1000);
          const month = date
            .toLocaleString("default", { month: "short" })
            .toUpperCase();
          if (monthlyMap[month]) {
            monthlyMap[month].collections += data.amount || 0;
          }
        });

        expensesSnap.forEach((doc) => {
          const data = doc.data();
          const date = new Date(data.timestamp?.seconds * 1000);
          const month = date
            .toLocaleString("default", { month: "short" })
            .toUpperCase();
          if (monthlyMap[month]) {
            monthlyMap[month].expenses += data.amount || 0;
          }
        });

        const chartData = months.map((m) => ({
          month: m,
          Collections: monthlyMap[m].collections,
          Expenses: monthlyMap[m].expenses,
        }));

        setFinancialData(chartData);
      } catch (err) {
        console.error("Error loading financial data:", err);
      }
    };

    // Call it here
    fetchEvents();
    fetchAnalytics();
    fetchFinanceOverview();
  }, []);

  return (
    <div>
      <div className="w-full bg-mainColor py-4 px-6 shadow">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
      </div>

      <div className="min-h-screen bg-gray-100 p-6">
        {/* Top Stats Row */}
        <div className="flex flex-wrap gap-4 mb-6">
          <StatBox label="Total Members" value={totalMembers} />
          <StatBox label="Active" value={activeMembers} />
          <StatBox label="Inactive" value={inactiveMembers} />
          <StatBox label="New Members" value={newMembers} />
          <StatBox
            label="Current HOA Account Balance"
            value={
              hoaBalance !== null
                ? `₱ ${hoaBalance.toLocaleString()}`
                : "Loading..."
            }
          />
        </div>

        {/* Main Content Row */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <FinancialOverview data={financialData} />
          </div>

          {/* Upcoming Events */}
          <div className="w-full lg:w-[350px] bg-[#333] text-white rounded shadow">
            <div className="p-4 border-b border-gray-600 flex items-center gap-2">
              <i className="fas fa-calendar-alt"></i>
              <h2 className="text-lg font-semibold">Upcoming Events</h2>
            </div>

            <div className="p-4 max-h-[400px] overflow-y-auto bg-white text-black">
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
                    className="flex gap-4 py-3 border-b border-gray-300"
                  >
                    <div className="bg-gray-100 text-center px-3 py-2 rounded font-bold text-sm text-[#00695C]">
                      {month} <br /> {day}
                    </div>
                    <div>
                      <h3 className="font-semibold">{event.title}</h3>
                      <p className="text-sm text-gray-600">{`${start} - ${end}`}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
      <h2 className="text-center font-semibold">{label}</h2>
      <p className="text-center text-2xl mt-2 text-[#00695C]">{value}</p>
    </div>
  );
}

function FinancialOverview({ data }: { data: any[] }) {
  return (
    <div className="bg-white p-4 rounded shadow w-full">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">
        Financial Overview
      </h2>
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
            stroke="#00695C"
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
    </div>
  );
}
