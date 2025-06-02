import React, { useState, useEffect } from 'react';
import { Calendar } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { dateFnsLocalizer } from 'react-big-calendar';
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../Firebase";  // Firebase config file

const locales = {
  'en-US': require('date-fns/locale/en-US'),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
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
  const [newEvent, setNewEvent] = useState({ title: '', start: '', end: '' });

  // Fetch events from Firebase on mount
  useEffect(() => {
    async function fetchEvents() {
      try {
        const querySnapshot = await getDocs(collection(db, "events"));
        const eventsFromDB = querySnapshot.docs.map(doc => ({
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

  // Add new event to Firebase and local state
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

      setEvents(prev => [...prev, { ...eventToAdd, id: docRef.id }]);
      setNewEvent({ title: '', start: '', end: '' });
    } catch (e) {
      console.error("Error adding event:", e);
    }
  };

  return (
    <div>
      <div style={{ padding: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Event Title"
          value={newEvent.title}
          onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
        />
        <input
          type="datetime-local"
          value={newEvent.start}
          onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value })}
        />
        <input
          type="datetime-local"
          value={newEvent.end}
          onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
        />
        <button onClick={handleAddEvent}>Add Event</button>
      </div>

      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 500, margin: '20px' }}
      />
    </div>
  );
}
