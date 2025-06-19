  import React, { useEffect, useState } from "react";
  import { collection, getDocs } from "firebase/firestore";
  import { db } from "../Firebase";

  interface EventType {
    id?: string;
    title: string;
    start: Date;
    end: Date;
    description?: string;
  }

  export default function Dashboard() {
    const [events, setEvents] = useState<EventType[]>([]);

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
      fetchEvents();
    }, []);

    return (
      <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6 text-[#00695C]">Admin Dashboard</h1>

      {/* Top Stats Row */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
          <h2 className="text-center font-semibold">Total members</h2>
        </div>
        <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
          <h2 className="text-center font-semibold">Active</h2>
        </div>
        <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
          <h2 className="text-center font-semibold">Inactive</h2>
        </div>
        <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
          <h2 className="text-center font-semibold">New members</h2>
        </div>
        <div className="flex-1 min-w-[150px] bg-white p-4 shadow rounded">
          <h2 className="text-center font-semibold">Current HOA Account Balance</h2>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left content space — optional or empty for now */}
        <div className="flex-1">
          {/* You can put charts/tables here later */}
        </div>

        {/* Upcoming Events Panel */}
        <div className="w-full lg:w-[350px] bg-[#333] text-white rounded shadow">
          <div className="p-4 border-b border-gray-600 flex items-center gap-2">
            <i className="fas fa-calendar-alt"></i>
            <h2 className="text-lg font-semibold">Upcoming Events</h2>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto bg-white text-black">
            {/* Sample Event */}
            {[
              { date: 'JAN 05', title: 'Meeting', time: '8:30 AM - 10:00 AM' },
              { date: 'JAN 31', title: 'Update Meeting', time: '1:30 PM - 2:30 PM' },
              { date: 'FEB 05', title: 'Meeting', time: '3:00 PM - 4:00 PM' },
              { date: 'FEB 31', title: 'Update Meeting', time: '1:30 PM - 2:30 PM' },
            ].map((event, index) => (
              <div key={index} className="flex gap-4 py-3 border-b border-gray-300">
                <div className="bg-gray-100 text-center px-3 py-2 rounded font-bold text-sm text-[#00695C]">
                  {event.date.split(' ')[0]} <br /> {event.date.split(' ')[1]}
                </div>
                <div>
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="text-sm text-gray-600">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
