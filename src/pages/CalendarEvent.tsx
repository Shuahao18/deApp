import React, { useState, useEffect } from "react";
import { Calendar } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { dateFnsLocalizer } from "react-big-calendar";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../Firebase";

const locales = {
  "en-US": require("date-fns/locale/en-US"),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

interface EventType {
  id?: string;
  title: string;
  start: Date;
  end: Date;
}

export default function CalendarEvent() {
  const [events, setEvents] = useState<EventType[]>([]);
  const [newEvent, setNewEvent] = useState<{
    title: string;
    start: string;
    end: string;
  }>({ title: "", start: "", end: "" });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            start: new Date(data.start.seconds * 1000),
            end: new Date(data.end.seconds * 1000),
          };
        }) as EventType[];
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    fetchEvents();
  }, []);

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.start || !newEvent.end) {
      alert("Please fill in all fields");
      return;
    }

    const startDate = new Date(newEvent.start);
    const endDate = new Date(newEvent.end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      alert("Invalid date format");
      return;
    }

    const eventToAdd: EventType = {
      title: newEvent.title,
      start: startDate,
      end: endDate,
    };

    try {
      const docRef = await addDoc(collection(db, "events"), {
        title: eventToAdd.title,
        start: startDate,
        end: endDate,
      });

      setEvents((prev) => [...prev, { ...eventToAdd, id: docRef.id }]);
      setNewEvent({ title: "", start: "", end: "" });
      setShowModal(false);
    } catch (e) {
      console.error("Error adding event:", e);
      alert("Failed to add event. Check console for details.");
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center h-20 bg-teader p-4 shadow">
          <h2 className="text-4xl font-poppins font-bold text-white">
            Calendar Events
          </h2>
          <button className="w-10 h-10 bg-white text-bgColor rounded-full flex items-center justify-center font-bold shadow hover:bg-gray-200">
            P
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="text-center text-gray-700 border border-gray-700 px-4 py-2 rounded">
              Total Events:
              <div className="font-bold">{events.length}</div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-gray-700 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              + Add Event
            </button>
          </div>

          {/* Main Content */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Event List */}
            <div className="lg:w-1/3 w-full bg-white rounded-lg shadow-md p-4">
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {events.map((event, index) => {
                  const day = event.start.toLocaleDateString("en-US", {
                    day: "2-digit",
                  });
                  const month = event.start
                    .toLocaleDateString("en-US", { month: "short" })
                    .toUpperCase();

                  return (
                    <div
                      key={event.id || index}
                      className="flex items-center gap-4 border-b pb-4"
                    >
                      {/* Date Box */}
                      <div className="w-20 h-24 rounded-md border border-gray-400 overflow-hidden shadow-md">
                        <div className="h-1/2 bg-bgColor text-white flex items-center justify-center text-sm font-bold uppercase">
                          {month}
                        </div>
                        <div className="h-1/2 bg-white text-bgColor flex items-center justify-center text-2xl font-bold">
                          {day}
                        </div>
                      </div>

                      {/* Event Info */}
                      <div className="flex-1">
                        <div className="font-medium text-base">
                          {event.title}
                        </div>
                        <div className="text-sm text-gray-600">
                          {event.start.toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {event.start.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {event.end.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calendar */}
            <div className="lg:w-2/3 w-full bg-white p-4 rounded-lg shadow-md">
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: 500 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowModal(false)}
            >
              ✕
            </button>
            <h3 className="text-xl font-semibold mb-4">Add New Event</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Event Title"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, title: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
              <input
                type="datetime-local"
                value={newEvent.start}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, start: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
              <input
                type="datetime-local"
                value={newEvent.end}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, end: e.target.value })
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleAddEvent}
                  className="bg-bgColor text-white px-4 py-2 rounded-md hover:bg-green-700"
                >
                  Add Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
