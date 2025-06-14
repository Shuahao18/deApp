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
  const [newEvent, setNewEvent] = useState({ title: "", start: "", end: "" });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          start: new Date(doc.data().start.seconds * 1000),
          end: new Date(doc.data().end.seconds * 1000),
        })) as EventType[];
        setEvents(eventsFromDB);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    }

    fetchEvents();
  }, []);

  const handleAddEvent = async () => {
    if (!newEvent.title || !newEvent.start || !newEvent.end) return;

    const eventToAdd: EventType = {
      title: newEvent.title,
      start: new Date(newEvent.start),
      end: new Date(newEvent.end),
    };

    try {
      const docRef = await addDoc(collection(db, "events"), {
        title: eventToAdd.title,
        start: eventToAdd.start,
        end: eventToAdd.end,
      });

      setEvents((prev) => [...prev, { ...eventToAdd, id: docRef.id }]);
      setNewEvent({ title: "", start: "", end: "" });
      setShowModal(false);
    } catch (e) {
      console.error("Error adding event:", e);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-4xl font-poppins font-bold">Calendar Events</h2>
      <div className="flex justify-between items-center mt-14 ">
        <div className="mb-2 text-center text-gray-700 border border-gray-700">
          Total Events:
          <div className="font-bold">{events.length}</div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 mt-14 mb-2 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          + Add Event
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Event List */}
        <div className="lg:w-1/3 w-full bg-white rounded-lg shadow-md p-4">
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {events.map((event, index) => (
              <div key={event.id || index} className="border-b pb-2">
                <div className="font-medium">{event.title}</div>
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
            ))}
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
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 "
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
